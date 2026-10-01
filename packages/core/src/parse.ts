// Rule-based natural-language parser: text -> Intent. Pure and offline.
// Applying an intent (rollover, meal hints, conflicts, …) is the engine's job, so the AI
// fallback can produce the same Intent shape and get identical behavior.

import {
  extractDay, extractDuration, extractPartOfDay, extractRange, extractRecurrence, extractShift, extractTime,
  extractWeekdayOfNextWeek, extractWindow, Scanner,
} from './extract';
import {
  CANCEL_VERBS, COMPLETE_RE, DISMISS_WORDS, MONTH_RE, MOVE_VERBS_LOOSE, MOVE_VERBS_STRICT, STOPWORDS, WEEKDAY_RE,
} from './lexicon';
import type { Draft, Intent, MoveDest, ParseResult } from './types';

const POLITE_PREFIX = /^(?:please|pls|plz|can you|could you|hey|ok|okay|also|and)[,\s]+/i;

export function normalizeInput(text: string): string {
  let t = text.trim().replace(/\s+/g, ' ');
  let prev: string;
  do { prev = t; t = t.replace(POLITE_PREFIX, ''); } while (t !== prev);
  return t.replace(/[.!?]+$/, '');
}

export function isDismissal(text: string): boolean {
  return DISMISS_WORDS.has(text.trim().toLowerCase().replace(/[.!?]+$/, ''));
}

/** Title from whatever the extractors didn't consume. */
export function cleanTitle(remaining: string, fallback: string): string {
  const EDGE = /^(?:at|on|for|from|to|by|in|this|next|every|each|sometime|around|and|until|till|starting|due)\b\s*|^[\s,.;:@&+-]+/i;
  const EDGE_END = /\s*\b(?:at|on|for|from|to|by|in|this|next|every|each|sometime|around|and|until|till|starting|due)$|[\s,.;:@&+-]+$/i;
  let t = remaining.replace(/\s+/g, ' ').trim();
  let prev: string;
  do {
    prev = t;
    t = t.replace(EDGE, '').replace(EDGE_END, '').replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  } while (t !== prev);
  if (!t) t = fallback.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Words that suggest a date/time the rules failed to place => ask the AI fallback if online. */
const UNPLACED_TEMPORAL = new RegExp(
  `\\d|\\b(?:every|next|last|weekend|o'?clock|am|pm|noon|midnight|tonight|until|till|ago|month|months|year|years|week|weeks|days|fortnight|biweekly|monthly|yearly|annually|quarterly|other|eod|eow|asap|${WEEKDAY_RE}|${MONTH_RE.split('|').filter((w) => !['may', 'mar', 'march'].includes(w)).join('|')})\\b`,
  'i',
);

function confidenceFor(leftover: string): Pick<ParseResult, 'confidence' | 'reasons'> {
  const m = leftover.match(UNPLACED_TEMPORAL);
  return m ? { confidence: 'low', reasons: [`unplaced "${m[0]}"`] } : { confidence: 'high', reasons: [] };
}

export function parseDraft(sc: Scanner, now: Date): Draft {
  const recurrence = extractRecurrence(sc);
  const nextWeekDay = extractWeekdayOfNextWeek(sc, now);
  const window = nextWeekDay ? null : extractWindow(sc, now);
  const day = nextWeekDay ?? (window ? null : extractDay(sc, now));
  const range = extractRange(sc);
  const time = range ? null : extractTime(sc);
  const durationMin = extractDuration(sc);
  const part = extractPartOfDay(sc);
  return {
    title: '',
    date: day?.date ?? null,
    start: range?.start ?? time,
    end: range?.end ?? null,
    durationMin,
    window,
    recurrence,
    hint: day?.hint ?? part,
  };
}

export function parseDest(sc: Scanner, now: Date): MoveDest {
  const shiftMin = extractShift(sc);
  if (shiftMin !== null) return { shiftMin, date: null, start: null, end: null, window: null };
  const nextWeekDay = extractWeekdayOfNextWeek(sc, now);
  const window = nextWeekDay ? null : extractWindow(sc, now);
  const day = nextWeekDay ?? (window ? null : extractDay(sc, now));
  const range = extractRange(sc);
  const time = range ? null : extractTime(sc, { allowTo: true });
  return { shiftMin: null, date: day?.date ?? null, start: range?.start ?? time, end: range?.end ?? null, window };
}

/** Significant words used to find the item a command refers to. */
export function queryWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

export function parse(input: string, now: Date): ParseResult {
  const text = normalizeInput(input);
  if (isDismissal(text)) return { intent: { type: 'dismiss' }, confidence: 'high', reasons: [] };

  const lower = text.toLowerCase();
  const verbMatch = lower.match(/^([a-z]+)\b\s*(.*)$/);
  const verb = verbMatch?.[1] ?? '';

  const done = lower.match(COMPLETE_RE);
  if (done) {
    return { intent: { type: 'complete', query: (done[1] ?? done[2])! }, confidence: 'high', reasons: [] };
  }

  if (CANCEL_VERBS.includes(verb)) {
    const sc = new Scanner(text.slice(verb.length));
    const day = extractWeekdayOfNextWeek(sc, now) ?? extractDay(sc, now);
    return {
      intent: { type: 'cancel', query: sc.remainingRaw().trim(), onDate: day?.date ?? null },
      confidence: 'high',
      reasons: [],
    };
  }

  if (MOVE_VERBS_STRICT.includes(verb) || MOVE_VERBS_LOOSE.includes(verb)) {
    const sc = new Scanner(text.slice(verb.length));
    const dest = parseDest(sc, now);
    const query = sc.remainingRaw().trim();
    const intent: Intent = { type: 'move', query, dest, strict: MOVE_VERBS_STRICT.includes(verb) };
    return { intent, confidence: 'high', reasons: [] };
  }

  const created = parseCreate(text, now);
  return { intent: { type: 'create', draft: created.draft }, confidence: created.confidence, reasons: created.reasons };
}

/** Parse text as a new item, ignoring command verbs. */
export function parseCreate(text: string, now: Date): { draft: Draft } & Pick<ParseResult, 'confidence' | 'reasons'> {
  const sc = new Scanner(normalizeInput(text));
  const draft = parseDraft(sc, now);
  draft.title = cleanTitle(sc.remainingRaw(), text);
  return { draft, ...confidenceFor(draft.title) };
}
