import {
  addDaysStr, atMinutes, daysBetween, fmtClock, fmtDate, fmtDayShort, MIN_PER_DAY, minutesOfDay,
  startOfDay, timeToMin, type DateStr,
} from './dates';
import type { Color, CoreSettings, Item, Kind } from './types';

export function kindOf(it: Pick<Item, 'date' | 'start' | 'end'>): Kind {
  if (!it.date) return 'task';
  return it.start && it.end ? 'event' : 'reminder';
}

/** Color encodes kind, not title (APP_SPEC §3). */
export function colorFor(kind: Kind): Color {
  return kind === 'event' ? 'blue' : kind === 'reminder' ? 'orange' : 'tan';
}

/**
 * Reminder notification time (APP_SPEC §4.4/§5): 6am on the date, unless the date is today
 * and 6am has already passed, in which case 90 minutes after creation.
 */
export function computeReminderAt(date: DateStr, now: Date): { at: Date; lateAdd: boolean } {
  const sixAm = atMinutes(date, 6 * 60);
  if (date === fmtDate(now) && now.getTime() > sixAm.getTime()) {
    return { at: new Date(now.getTime() + 90 * 60000), lateAdd: true };
  }
  return { at: sixAm, lateAdd: false };
}

/**
 * Normalize an item after any change to its date/time fields: derives endDate for
 * overnight events, recomputes reminderAt, color, and clears fields that don't apply
 * to the new kind. Every create/edit/move path goes through here so kind switches
 * never leave stale data behind.
 */
export function normalizeItem(it: Item, now: Date): Item {
  const out: Item = { ...it };
  const kind = kindOf(out);
  if (kind === 'task') {
    out.start = null; out.end = null; out.endDate = null; out.reminderAt = null;
  } else if (kind === 'reminder') {
    out.start = null; out.end = null; out.endDate = null;
    out.reminderAt = computeReminderAt(out.date!, now).at.toISOString();
    out.done = false; out.doneAt = null;
  } else {
    out.reminderAt = null;
    out.done = false; out.doneAt = null;
    // An end at or before the start means the event runs past midnight into the next day.
    out.endDate = timeToMin(out.end!) <= timeToMin(out.start!) ? addDaysStr(out.date!, 1) : null;
  }
  out.color = colorFor(kind);
  return out;
}

export function newItem(fields: Partial<Item> & { id: string; title: string }, now: Date): Item {
  return normalizeItem({
    date: null, start: null, end: null, endDate: null, reminderAt: null, done: false, doneAt: null,
    color: 'tan', recurring: null, seriesId: null, occurrenceDate: null, createdAt: now.toISOString(),
    ...fields,
  }, now);
}

/** Event interval as absolute minutes relative to `anchor` date's midnight. */
export function eventInterval(it: Item, anchor: DateStr): [number, number] | null {
  if (kindOf(it) !== 'event') return null;
  const base = daysBetween(anchor, it.date!) * MIN_PER_DAY;
  const s = base + timeToMin(it.start!);
  const endBase = daysBetween(anchor, it.endDate ?? it.date!) * MIN_PER_DAY;
  let e = endBase + timeToMin(it.end!);
  if (e <= s) e += MIN_PER_DAY;
  return [s, e];
}

export function durationMin(it: Item): number | null {
  const iv = eventInterval(it, it.date ?? '1970-01-01');
  return iv ? iv[1] - iv[0] : null;
}

export function findConflicts(items: Item[], date: DateStr, startMin: number, endMin: number, excludeId: string | null): Item[] {
  return items.filter((it) => {
    if (it.id === excludeId) return false; // never conflict with yourself (§4.14)
    const iv = eventInterval(it, date);
    return !!iv && Math.max(iv[0], startMin) < Math.min(iv[1], endMin);
  });
}

export function conflictNote(items: Item[], it: Item): string {
  const iv = eventInterval(it, it.date ?? '1970-01-01');
  if (!iv || !it.date) return '';
  const c = findConflicts(items, it.date, iv[0], iv[1], it.id);
  if (!c.length) return '';
  return ` Heads up — overlaps with "${c[0]!.title}" (${timeLabel(c[0]!)}).`;
}

export function timeLabel(it: Item): string {
  if (!it.start || !it.end) return 'all day';
  const overnight = it.endDate && it.date && it.endDate > it.date ? ' (+1)' : '';
  return `${fmtClock(timeToMin(it.start))}–${fmtClock(timeToMin(it.end))}${overnight}`;
}

/** One line that tells similar items apart: kind, day, time, repeats (§4.11). */
export function describeItem(it: Item): string {
  const repeats = it.seriesId ? ' · repeats' : '';
  const kind = kindOf(it);
  if (kind === 'task') return `${it.title} — task (no date)`;
  const when = fmtDayShort(it.date!);
  if (kind === 'reminder') return `${it.title} — ${when}, all-day (no set time)${repeats}`;
  return `${it.title} — ${when}, ${timeLabel(it)}${repeats}`;
}

/** Notification times for an item: reminderAt for reminders, chosen lead times for events. */
export function notificationTimes(it: Item, settings: CoreSettings): Date[] {
  const kind = kindOf(it);
  if (kind === 'reminder') return it.reminderAt ? [new Date(it.reminderAt)] : [];
  if (kind !== 'event') return [];
  const start = atMinutes(it.date!, timeToMin(it.start!));
  return [...new Set(settings.eventAlerts)].sort((a, b) => b - a).map((m) => new Date(start.getTime() - m * 60000));
}

/** Minutes of timed events falling on `date` (overnight events count on both days). */
export function bookedMinutes(items: Item[], date: DateStr): number {
  let total = 0;
  for (const it of items) {
    const iv = eventInterval(it, date);
    if (!iv) continue;
    total += Math.max(0, Math.min(iv[1], MIN_PER_DAY) - Math.max(iv[0], 0));
  }
  return total;
}

export function leastBookedDay(items: Item[], start: DateStr, end: DateStr): DateStr {
  let best = start;
  let bestLoad = Infinity;
  for (let d = start; d <= end; d = addDaysStr(d, 1)) {
    const load = bookedMinutes(items, d);
    if (load < bestLoad) { best = d; bestLoad = load; }
  }
  return best;
}

/**
 * Tasks tab ordering: open tasks first (oldest first), completed tasks sink to the bottom,
 * and completed tasks disappear once a new day starts (unless hideCompletedNextDay is off).
 */
export function visibleTasks(items: Item[], now: Date, hideCompletedNextDay = true): Item[] {
  const today = startOfDay(now).getTime();
  return items
    .filter((it) => kindOf(it) === 'task')
    .filter((it) => !(hideCompletedNextDay && it.done && it.doneAt && new Date(it.doneAt).getTime() < today))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt.localeCompare(b.createdAt));
}

export function toggleDone(it: Item, now: Date): Item {
  const done = !it.done;
  return { ...it, done, doneAt: done ? now.toISOString() : null };
}

/** Items that are still relevant for text commands: open tasks and anything from today on. */
export function upcomingItems(items: Item[], now: Date): Item[] {
  const today = fmtDate(now);
  return items.filter((it) => {
    if (!it.date) return !it.done;
    return (it.endDate ?? it.date) >= today;
  });
}

export function isTodayStr(d: DateStr, now: Date): boolean {
  return d === fmtDate(now);
}

export function nowMinutes(now: Date): number {
  return minutesOfDay(now);
}

