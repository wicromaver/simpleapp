// The rules engine: applies Intents to state and produces Outcomes (ops + message +
// follow-up prompt). Pure — the app owns persistence and rendering.

import {
  addDaysStr, daysBetween, fmtClock, fmtDate, fmtDayShort, MIN_PER_DAY, minToTime, minutesOfDay, timeToMin,
  type DateStr,
} from './dates';
import { extractDay, Scanner } from './extract';
import {
  computeReminderAt, conflictNote, describeItem, durationMin, kindOf, leastBookedDay, newItem, normalizeItem,
  timeLabel, toggleDone, upcomingItems,
} from './items';
import { mealHint } from './lexicon';
import { isDismissal, normalizeInput, parse, parseCreate, parseDest, queryWords } from './parse';
import { materializeSeries, SERIES_HORIZON_DAYS } from './recurrence';
import type {
  Choice, Draft, EngineContext, EngineState, Intent, Item, Jump, MoveDest, Op, Outcome, Pending, RawTime, Series,
} from './types';

// ---------------------------------------------------------------------------
// Time resolution (APP_SPEC §4.2, §4.3)
// ---------------------------------------------------------------------------

interface ResolveCtx {
  now: Date;
  date: DateStr;
  /** No day word was typed; the date fell back to today (enables rollover). */
  dateWasDefaulted: boolean;
  titleLower: string;
  hint: 'am' | 'pm' | null;
  /** Resolve as if for a future day (recurring rules, windows): no "still ahead today" logic. */
  asFutureDay?: boolean;
}

/** Minutes past midnight for an hour/minute under a meridiem. */
function withMeridiem(t: RawTime, mer: 'am' | 'pm'): number {
  return ((t.h % 12) + (mer === 'pm' ? 12 : 0)) * 60 + t.m;
}

/** Resolve a start time. `rollover` => the date should move to tomorrow (same time). */
export function resolveStart(t: RawTime, ctx: ResolveCtx): { min: number; rollover: boolean } {
  const nowMin = minutesOfDay(ctx.now);
  const isToday = !ctx.asFutureDay && ctx.date === fmtDate(ctx.now);
  const finalize = (min: number) => ({ min, rollover: isToday && ctx.dateWasDefaulted && min <= nowMin });

  if (t.meridiem) return finalize(withMeridiem(t, t.meridiem));

  // 1) Meal / time-of-day hint wins, even over "must be in the future".
  const meal = mealHint(ctx.titleLower);
  const hint = meal?.meridiem ?? ctx.hint;
  if (hint === 'pm') return finalize(withMeridiem(t, 'pm'));
  if (hint === 'am') return finalize(withMeridiem(t, 'am'));
  if (hint === 'lunch') return finalize(withMeridiem(t, t.h >= 9 && t.h <= 11 ? 'am' : 'pm'));

  // 2) Today: whichever of am/pm is still ahead (the sooner if both); both passed => roll over.
  if (isToday) {
    const am = withMeridiem(t, 'am');
    const pm = withMeridiem(t, 'pm');
    const amAhead = am > nowMin, pmAhead = pm > nowMin;
    if (amAhead && pmAhead) return finalize(Math.min(am, pm));
    if (amAhead) return finalize(am);
    if (pmAhead) return finalize(pm);
    return finalize(t.h === 12 ? pm : t.h <= 6 ? pm : am);
  }

  // 3) Future day: 1–6 => pm, otherwise am ("at 12" means noon).
  return finalize(withMeridiem(t, t.h === 12 || (t.h >= 1 && t.h <= 6) ? 'pm' : 'am'));
}

/** End time as minutes after the start day's midnight; always after `startMin` (may cross midnight). */
export function resolveEnd(t: RawTime, startMin: number): number {
  const candidates = t.meridiem ? [withMeridiem(t, t.meridiem)] : [withMeridiem(t, 'am'), withMeridiem(t, 'pm')];
  let best = Infinity;
  for (const c of candidates) {
    let diff = (c - startMin) % MIN_PER_DAY;
    if (diff <= 0) diff += MIN_PER_DAY;
    best = Math.min(best, diff);
  }
  return startMin + best;
}

// ---------------------------------------------------------------------------
// Outcome helpers
// ---------------------------------------------------------------------------

function outcome(partial: Partial<Outcome>): Outcome {
  return {
    ops: [], message: '', choices: [], pending: null, jump: null, needsFallback: false, fallbackText: null,
    ...partial,
  };
}

function jumpTo(it: Item): Jump {
  return it.date ? { tab: 'calendar', date: it.date } : { tab: 'tasks', date: null };
}

function dayWord(date: DateStr, now: Date): string {
  const diff = daysBetween(fmtDate(now), date);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return fmtDayShort(date);
}

/** Apply ops to a state snapshot (used by the engine itself and handy for apps/tests). */
export function applyOps(state: EngineState, ops: Op[]): EngineState {
  let items = state.items;
  let series = state.series;
  for (const op of ops) {
    if (op.op === 'putItem') items = [...items.filter((i) => i.id !== op.item.id), op.item];
    else if (op.op === 'deleteItem') items = items.filter((i) => i.id !== op.id);
    else if (op.op === 'putSeries') series = [...series.filter((s) => s.id !== op.series.id), op.series];
    else series = series.filter((s) => s.id !== op.id);
  }
  return { ...state, items, series };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

function hasWhen(d: Draft): boolean {
  return !!(d.date || d.start || d.window || d.recurrence);
}

export function applyCreate(state: EngineState, draft: Draft, ctx: EngineContext): Outcome {
  const { now, settings } = ctx;
  const today = fmtDate(now);
  const titleLower = draft.title.toLowerCase();
  const meal = mealHint(titleLower);
  const others = state.items;

  const makeEvent = (date: DateStr, startMin: number, endMin: number, extra: Partial<Item> = {}): Item => {
    // startMin may be >= 1440 after a rollover-free resolution; normalize into date.
    const dayOffset = Math.floor(startMin / MIN_PER_DAY);
    const d = addDaysStr(date, dayOffset);
    return newItem({
      id: ctx.newId(), title: draft.title, date: d,
      start: minToTime(startMin), end: minToTime(endMin), ...extra,
    }, now);
  };
  const endFor = (startMin: number, draftEnd: RawTime | null) =>
    draftEnd ? resolveEnd(draftEnd, startMin) : startMin + (draft.durationMin ?? settings.defaultDuration);

  // Recurring (§4.10)
  if (draft.recurrence) {
    const startDate = draft.date ?? today;
    let start: string | null = null, end: string | null = null;
    if (draft.start) {
      const s = resolveStart(draft.start, { now, date: startDate, dateWasDefaulted: false, titleLower, hint: draft.hint, asFutureDay: true }).min;
      start = minToTime(s);
      end = minToTime(endFor(s, draft.end));
    }
    const series: Series = {
      id: ctx.newId(), title: draft.title, days: draft.recurrence.days, start, end, startDate, until: null,
      exceptions: [], createdAt: now.toISOString(),
    };
    const occurrences = materializeSeries(series, [], ctx, SERIES_HORIZON_DAYS);
    const first = occurrences[0];
    const note = first ? conflictNote(others, first) : '';
    const at = start ? ` at ${fmtClock(timeToMin(start))}` : ' (all day)';
    return outcome({
      ops: [{ op: 'putSeries', series }, ...occurrences.map((item): Op => ({ op: 'putItem', item }))],
      message: `Set "${draft.title}" for ${draft.recurrence.label}${at}.${note}`,
      jump: first ? { tab: 'calendar', date: first.date } : null,
    });
  }

  // Least-booked day in a window (§4.7)
  if (draft.window) {
    const startMin = draft.start
      ? resolveStart(draft.start, { now, date: draft.window.start, dateWasDefaulted: false, titleLower, hint: draft.hint, asFutureDay: true }).min
      : (meal?.defaultHour ?? (meal?.meridiem === 'pm' || draft.hint === 'pm' ? 18 : 9)) * 60;
    // Today only counts if the slot is still ahead.
    let from = draft.window.start;
    if (from === today && startMin <= minutesOfDay(now) && from < draft.window.end) from = addDaysStr(from, 1);
    const day = leastBookedDay(others, from, draft.window.end);
    const it = makeEvent(day, startMin, endFor(startMin, draft.end));
    return outcome({
      ops: [{ op: 'putItem', item: it }],
      message: `Put "${it.title}" on the lightest day ${draft.window.label} — ${fmtDayShort(it.date!)} at ${fmtClock(startMin)}.${conflictNote(others, it)}`,
      jump: jumpTo(it),
    });
  }

  // Explicit time (§4.1, §4.2)
  if (draft.start) {
    let date = draft.date ?? today;
    const r = resolveStart(draft.start, { now, date, dateWasDefaulted: !draft.date, titleLower, hint: draft.hint });
    if (r.rollover) date = addDaysStr(date, 1);
    const endMin = endFor(r.min, draft.end);
    const it = makeEvent(date, r.min, endMin);
    const dur = endMin - r.min;
    const when = draft.end
      ? `${dayWord(it.date!, now)}, ${timeLabel(it)}`
      : `${dayWord(it.date!, now)} at ${fmtClock(r.min)}, ${dur} min`;
    return outcome({
      ops: [{ op: 'putItem', item: it }],
      message: `Added "${it.title}" — ${when}.${conflictNote(others, it)}`,
      jump: jumpTo(it),
    });
  }

  // Day, no time => all-day reminder (§4.4)
  if (draft.date) {
    const it = newItem({ id: ctx.newId(), title: draft.title, date: draft.date }, now);
    const { at, lateAdd } = computeReminderAt(draft.date, now);
    const message = lateAdd
      ? `Added "${it.title}" as an all-day reminder for today — you'll get a notification at ${fmtClock(minutesOfDay(at))}.`
      : `Added "${it.title}" to ${draft.date === today ? 'today' : fmtDayShort(draft.date)} — reminder at 6am that day.`;
    return outcome({ ops: [{ op: 'putItem', item: it }], message, jump: jumpTo(it) });
  }

  // Bare mealtime => event at the meal's default hour, with rollover (§4.5)
  if (meal?.defaultHour != null) {
    const startMin = meal.defaultHour * 60;
    const date = startMin <= minutesOfDay(now) ? addDaysStr(today, 1) : today;
    const it = makeEvent(date, startMin, startMin + (draft.durationMin ?? settings.defaultDuration));
    return outcome({
      ops: [{ op: 'putItem', item: it }],
      message: `Added "${it.title}" — ${dayWord(date, now)} at ${fmtClock(startMin)}.${conflictNote(others, it)}`,
      jump: jumpTo(it),
    });
  }

  // Nothing temporal => Task (§4.6)
  const it = newItem({ id: ctx.newId(), title: draft.title }, now);
  return outcome({ ops: [{ op: 'putItem', item: it }], message: `Added "${it.title}" to your tasks.`, jump: jumpTo(it) });
}

// ---------------------------------------------------------------------------
// Matching (§4.11, §4.12)
// ---------------------------------------------------------------------------

function wordMatches(q: string, titleWord: string): boolean {
  if (q === titleWord) return true;
  return q.length >= 4 && titleWord.length >= 4 && (titleWord.startsWith(q) || q.startsWith(titleWord));
}

/** Items whose titles best overlap the query words (ties all returned). */
export function findMatches(items: Item[], query: string, now: Date, filter: (it: Item) => boolean = () => true): Item[] {
  const words = queryWords(query);
  if (!words.length) return [];
  let best = 0;
  const scored: [Item, number][] = [];
  for (const it of upcomingItems(items, now).filter(filter)) {
    const tw = queryWords(it.title);
    const score = words.filter((w) => tw.some((t) => wordMatches(w, t))).length;
    if (score > 0) { scored.push([it, score]); best = Math.max(best, score); }
  }
  return sortItems(scored.filter(([, s]) => s === best).map(([it]) => it));
}

function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) =>
    (a.date ?? '').localeCompare(b.date ?? '') || (a.start ?? '').localeCompare(b.start ?? '') || a.createdAt.localeCompare(b.createdAt));
}

/** One representative (soonest) per recurring series (§4.10 disambiguation bug). */
export function dedupeSeries(items: Item[]): Item[] {
  const seen = new Set<string>();
  return sortItems(items).filter((it) => {
    const key = it.seriesId ?? `single-${it.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickPrompt(action: 'move' | 'cancel' | 'complete', matches: Item[], text: string, question: string): Outcome {
  const shown = matches.slice(0, 4);
  return outcome({
    message: question,
    choices: shown.map((m, i): Choice => ({ label: describeItem(m), reply: `#${i + 1}` })),
    pending: { type: 'pickMatch', action, candidateIds: shown.map((m) => m.id), text },
  });
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

function seriesOf(state: EngineState, it: Item): Series | undefined {
  return it.seriesId ? state.series.find((s) => s.id === it.seriesId) : undefined;
}

function deleteOne(state: EngineState, it: Item, label: string): Outcome {
  const ops: Op[] = [{ op: 'deleteItem', id: it.id }];
  const series = seriesOf(state, it);
  if (series && it.occurrenceDate) {
    ops.push({ op: 'putSeries', series: { ...series, exceptions: [...series.exceptions, it.occurrenceDate] } });
  }
  return outcome({ ops, message: label });
}

function deleteAll(state: EngineState, it: Item, ctx: EngineContext): Outcome {
  const today = fmtDate(ctx.now);
  const upcoming = state.items.filter((i) => i.seriesId === it.seriesId && (i.date ?? today) >= today);
  const ops: Op[] = upcoming.map((i): Op => ({ op: 'deleteItem', id: i.id }));
  const series = seriesOf(state, it);
  // Keep past occurrences as history; just end the rule.
  if (series) ops.push({ op: 'putSeries', series: { ...series, until: addDaysStr(today, -1) } });
  return outcome({ ops, message: `Cancelled all ${upcoming.length} upcoming occurrences of "${it.title}".` });
}

/** Delete flow used by text commands and the edit sheet's Delete button. */
export function requestDelete(state: EngineState, itemId: string, ctx: EngineContext): Outcome {
  const it = state.items.find((i) => i.id === itemId);
  if (!it) return outcome({ message: `That item no longer exists.` });
  if (it.seriesId) {
    return outcome({
      message: `Cancel just this one, or every occurrence of "${it.title}"?`,
      choices: [{ label: 'Just this one', reply: 'one' }, { label: 'All occurrences', reply: 'all' }],
      pending: { type: 'seriesScope', itemId: it.id },
    });
  }
  return deleteOne(state, it, `Cancelled "${it.title}".`);
}

function applyCancel(state: EngineState, query: string, onDate: DateStr | null, ctx: EngineContext, text: string): Outcome {
  const all = findMatches(state.items, query, ctx.now);
  if (onDate) {
    const exact = all.find((m) => m.date === onDate);
    if (exact) return deleteOne(state, exact, `Cancelled "${exact.title}" for ${fmtDayShort(onDate)}.`);
  }
  const matches = dedupeSeries(all);
  if (!matches.length) return outcome({ message: `Couldn't find anything upcoming that matches that to cancel.` });
  if (matches.length > 1) return pickPrompt('cancel', matches, text, `Found a few things that match — which one should I cancel?`);
  return requestDelete(state, matches[0]!.id, ctx);
}

// ---------------------------------------------------------------------------
// Move (§4.11)
// ---------------------------------------------------------------------------

function hasDest(d: MoveDest): boolean {
  return d.shiftMin !== null || !!d.date || !!d.start || !!d.window;
}

export function applyMove(state: EngineState, it: Item, dest: MoveDest, ctx: EngineContext): Outcome {
  const { now, settings } = ctx;
  const others = state.items;
  const done = (updated: Item, msg: string) => {
    const item = normalizeItem(updated, now);
    return outcome({ ops: [{ op: 'putItem', item }], message: `${msg}${conflictNote(others, item)}`, jump: jumpTo(item) });
  };
  const curDur = durationMin(it) ?? settings.defaultDuration;

  // 1) Relative shift
  if (dest.shiftMin !== null) {
    if (kindOf(it) !== 'event') {
      return outcome({ message: `"${it.title}" doesn't have a set time to shift — try giving it a day or time instead.` });
    }
    const s = timeToMin(it.start!) + dest.shiftMin;
    const dayOffset = Math.floor(s / MIN_PER_DAY);
    const moved = { ...it, date: addDaysStr(it.date!, dayOffset), start: minToTime(s), end: minToTime(s + curDur) };
    return done(moved, `Moved "${it.title}" ${dest.shiftMin < 0 ? 'earlier' : 'later'} — now ${dayOffset ? fmtDayShort(moved.date) + ', ' : ''}${timeLabel(normalizeItem(moved, now))}.`);
  }

  // Window: least-booked day, keep the time if it has one
  if (dest.window) {
    const day = leastBookedDay(others.filter((o) => o.id !== it.id), dest.window.start, dest.window.end);
    return done({ ...it, date: day }, `Moved "${it.title}" to the lightest day ${dest.window.label} — ${fmtDayShort(day)}.`);
  }

  // 2) New day and/or 3) new time
  if (dest.date || dest.start) {
    const today = fmtDate(now);
    let date = dest.date ?? it.date ?? today;
    if (dest.start) {
      const r = resolveStart(dest.start, {
        now, date, dateWasDefaulted: !dest.date && !it.date, titleLower: it.title.toLowerCase(), hint: null,
      });
      if (r.rollover) date = addDaysStr(date, 1);
      const endMin = dest.end ? resolveEnd(dest.end, r.min) : r.min + curDur;
      const moved = { ...it, date, start: minToTime(r.min), end: minToTime(endMin) };
      const where = dest.date ? `${fmtDayShort(date)} at ` : '';
      return done(moved, `Moved "${it.title}" to ${where}${fmtClock(r.min)}.`);
    }
    return done({ ...it, date }, `Moved "${it.title}" to ${fmtDayShort(date)}.`);
  }

  // 4) Nothing usable: ask, and remember what we asked.
  return outcome({
    message: `Move "${it.title}" to when? Try a day ("to Friday"), a time ("to 8pm"), or a shift ("up one hour").`,
    pending: { type: 'moveWhen', itemId: it.id },
  });
}

function applyMoveIntent(state: EngineState, intent: Extract<Intent, { type: 'move' }>, ctx: EngineContext, text: string): Outcome | null {
  const matches = dedupeSeries(findMatches(state.items, intent.query, ctx.now));
  if (!matches.length) {
    if (!intent.strict) return null; // "take out the trash" is a new item, not a move
    return outcome({
      message: `There's nothing upcoming that matches that. Want to create it instead?`,
      choices: [{ label: 'Create it', reply: 'create it' }, { label: 'Never mind', reply: 'never mind' }],
      pending: { type: 'confirmCreate', text: text.replace(/^\s*\S+\s*/, '') },
    });
  }
  if (matches.length > 1) return pickPrompt('move', matches, text, `Found a few things that match — which one?`);
  return applyMove(state, matches[0]!, intent.dest, ctx);
}

// ---------------------------------------------------------------------------
// Complete
// ---------------------------------------------------------------------------

function completeItem(it: Item, ctx: EngineContext): Outcome {
  const item = it.done ? it : toggleDone(it, ctx.now);
  return outcome({
    ops: [{ op: 'putItem', item }],
    message: `Marked "${it.title}" done.`,
    jump: { tab: 'tasks', date: null },
  });
}

function applyComplete(state: EngineState, query: string, ctx: EngineContext, text: string): Outcome {
  const matches = findMatches(state.items, query, ctx.now, (it) => kindOf(it) === 'task');
  if (!matches.length) return outcome({ message: `Couldn't find an open task that matches that.` });
  if (matches.length > 1) return pickPrompt('complete', matches, text, `Which one did you finish?`);
  return completeItem(matches[0]!, ctx);
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** Apply an already-understood intent (from the rule parser or the AI fallback). */
export function applyIntent(state: EngineState, intent: Intent, ctx: EngineContext, text = ''): Outcome {
  switch (intent.type) {
    case 'dismiss':
      return outcome({});
    case 'cancel':
      return applyCancel(state, intent.query, intent.onDate, ctx, text);
    case 'complete':
      return applyComplete(state, intent.query, ctx, text);
    case 'move': {
      const r = applyMoveIntent(state, intent, ctx, text);
      if (r) return r;
      // A loose verb with no matching item ("take out the trash") is a new item.
      return applyCreate(state, parseCreate(text, ctx.now).draft, ctx);
    }
    case 'create':
      return applyCreate(state, intent.draft, ctx);
  }
}

const ORDINALS: Record<string, number> = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4 };

function pickFromReply(state: EngineState, p: Extract<Pending, { type: 'pickMatch' }>, reply: string, now: Date): Item | null {
  const candidates = p.candidateIds.map((id) => state.items.find((i) => i.id === id)).filter((i): i is Item => !!i);
  const lower = reply.toLowerCase();
  const num = lower.match(/^#?\s*(\d)$/) ?? lower.match(/^(?:the\s+)?(?:number\s+)?(\d)(?:\s+one)?$/);
  if (num) return candidates[parseInt(num[1]!, 10) - 1] ?? null;
  const ord = lower.match(/\b(first|second|third|fourth|1st|2nd|3rd|4th|last)\b/);
  if (ord) return ord[1] === 'last' ? candidates[candidates.length - 1] ?? null : candidates[ORDINALS[ord[1]!]! - 1] ?? null;
  // "the friday one", "the one with sam"
  const sc = new Scanner(reply);
  const day = extractDay(sc, now);
  let pool = candidates;
  if (day) pool = pool.filter((c) => c.date === day.date);
  const words = queryWords(sc.remainingRaw()).filter((w) => w !== 'one');
  if (words.length) {
    const scored = pool.map((c) => [c, words.filter((w) => queryWords(c.title).some((t) => wordMatches(w, t))).length] as const);
    const best = Math.max(0, ...scored.map(([, s]) => s));
    if (best > 0) pool = scored.filter(([, s]) => s === best).map(([c]) => c);
    else if (!day) pool = [];
  }
  return pool.length === 1 ? pool[0]! : null;
}

/** Try to read `text` as the answer to the pending question. null => treat as a new command. */
function resolvePending(state: EngineState, p: Pending, text: string, ctx: EngineContext): Outcome | null {
  const lower = text.toLowerCase();
  switch (p.type) {
    case 'pickMatch': {
      const it = pickFromReply(state, p, text, ctx.now);
      if (!it) return null;
      if (p.action === 'cancel') return requestDelete(state, it.id, ctx);
      if (p.action === 'complete') return completeItem(it, ctx);
      const reparsed = parse(p.text, ctx.now);
      const dest = reparsed.intent.type === 'move' ? reparsed.intent.dest : null;
      return dest ? applyMove(state, it, dest, ctx) : null;
    }
    case 'seriesScope': {
      const it = state.items.find((i) => i.id === p.itemId);
      if (!it) return null;
      if (/^(?:just\s+|only\s+)?(?:this|that|the)?\s*(?:one|occurrence|single|this|that)(?:\s+one)?$/.test(lower)) {
        return deleteOne(state, it, `Cancelled that one occurrence of "${it.title}".`);
      }
      if (/^(?:all|every|everything|both|the (?:whole )?series|whole series|series)\b/.test(lower)) return deleteAll(state, it, ctx);
      return null;
    }
    case 'moveWhen': {
      const it = state.items.find((i) => i.id === p.itemId);
      if (!it) return null;
      const dest = parseDest(new Scanner(text), ctx.now);
      return hasDest(dest) ? applyMove(state, it, dest, ctx) : null;
    }
    case 'confirmCreate': {
      if (!/^(?:yes|yeah|yep|yup|sure|ok|okay|y|create(?: it)?|do it|go ahead)$/.test(lower)) return null;
      const parsed = parse(p.text, ctx.now);
      if (parsed.intent.type !== 'create') return null;
      if (!hasWhen(parsed.intent.draft)) {
        const title = parsed.intent.draft.title;
        return outcome({
          message: `When should "${title}" happen? Try a day or time, like "friday" or "at 3pm".`,
          pending: { type: 'createWhen', title },
        });
      }
      return applyCreate(state, parsed.intent.draft, ctx);
    }
    case 'createWhen': {
      const parsed = parse(text, ctx.now);
      if (parsed.intent.type !== 'create' || !hasWhen(parsed.intent.draft)) return null;
      return applyCreate(state, { ...parsed.intent.draft, title: p.title }, ctx);
    }
  }
}

/**
 * Main entry point for the insert bar. Handles dismissals, answers to pending
 * questions (multi-turn), and new commands. Never calls the network: if the rules
 * were unsure, `needsFallback` is set and the app decides whether to ask the AI.
 */
export function handleInput(state: EngineState, input: string, ctx: EngineContext): Outcome {
  const text = normalizeInput(input);
  if (!text || isDismissal(text)) return outcome({});

  if (state.pending) {
    const answered = resolvePending(state, state.pending, text, ctx);
    if (answered) return answered;
  }

  const parsed = parse(text, ctx.now);
  const result = applyIntent(state, parsed.intent, ctx, text);
  if (parsed.intent.type === 'create' && parsed.confidence === 'low') {
    return { ...result, needsFallback: true, fallbackText: text };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Edit sheet (§6) and task checkbox
// ---------------------------------------------------------------------------

export interface EditFields {
  title: string;
  date: DateStr | '' | null;
  start: string | '' | null;
  end: string | '' | null;
}

export function applyEdit(state: EngineState, itemId: string, edit: EditFields, ctx: EngineContext): Outcome {
  const it = state.items.find((i) => i.id === itemId);
  if (!it) return outcome({ message: `That item no longer exists.` });
  const origDur = durationMin(it) ?? ctx.settings.defaultDuration;
  const title = edit.title.trim() || it.title;
  let note = '';
  let updated: Item;

  if (!edit.date) {
    updated = { ...it, title, date: null, start: null, end: null };
  } else if (edit.start) {
    const s = timeToMin(edit.start);
    let endStr = edit.end || minToTime(s + ctx.settings.defaultDuration);
    const endChanged = !!edit.end && edit.end !== it.end;
    if (timeToMin(endStr) <= s && !endChanged) {
      // Only the start moved past the old end: keep the block's length (§4.15).
      endStr = minToTime(s + origDur);
      note = ` (kept it ${origDur} min long since the end time was earlier than the new start)`;
    }
    // An end the user deliberately set before the start = runs past midnight.
    updated = { ...it, title, date: edit.date, start: edit.start, end: endStr };
  } else {
    updated = { ...it, title, date: edit.date, start: null, end: null };
  }

  const item = normalizeItem(updated, ctx.now);
  const series = it.seriesId ? ' (just this occurrence)' : '';
  return outcome({
    ops: [{ op: 'putItem', item }],
    message: `Updated "${item.title}"${series}.${note}${conflictNote(state.items, item)}`,
    jump: jumpTo(item),
  });
}

export function toggleTask(state: EngineState, itemId: string, ctx: EngineContext): Outcome {
  const it = state.items.find((i) => i.id === itemId);
  if (!it || kindOf(it) !== 'task') return outcome({});
  return outcome({ ops: [{ op: 'putItem', item: toggleDone(it, ctx.now) }] });
}
