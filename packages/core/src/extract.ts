// Phrase extractors. Each one finds a phrase in the not-yet-consumed part of the input,
// marks it consumed, and returns a structured value. Whatever is left becomes the title.
//
// Regexes deliberately avoid lookbehind so they run on every JS engine we ship to
// (including older Hermes builds on React Native).

import { addDays, fmtDate, startOfDay, startOfWeek, type DateStr } from './dates';
import {
  MONTH_RE, monthIndex, NUM_WORD_RE, WEEKDAY_PLURAL_RE, WEEKDAY_RE, weekdayIndex, wordToNum,
} from './lexicon';
import type { RawTime } from './types';

export class Scanner {
  readonly raw: string;
  private work: string;

  constructor(raw: string) {
    this.raw = raw;
    // Same length as raw so match indices map straight back onto the original text.
    this.work = raw.replace(/[A-Z]/g, (c) => c.toLowerCase()).replace(/[‘’]/g, "'").replace(/[–—]/g, '-');
  }

  /** First match of `re` in unconsumed text whose preceding char passes `okBefore`. */
  find(re: RegExp, okBefore: (prev: string) => boolean = () => true): RegExpExecArray | null {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(this.work))) {
      if (m[0].trim() === '') { g.lastIndex++; continue; }
      const prev = m.index > 0 ? this.work[m.index - 1]! : ' ';
      if (okBefore(prev)) return m;
      g.lastIndex = m.index + 1;
    }
    return null;
  }

  consume(m: RegExpExecArray): void {
    this.work = this.work.slice(0, m.index) + ' '.repeat(m[0].length) + this.work.slice(m.index + m[0].length);
  }

  /** Lowercased unconsumed text. */
  rest(): string {
    return this.work;
  }

  /** Original-case text with consumed spans removed. */
  remainingRaw(): string {
    let out = '';
    for (let i = 0; i < this.raw.length; i++) out += this.work[i] === ' ' && this.raw[i] !== ' ' ? ' ' : this.raw[i];
    return out;
  }
}

const notDigitOrSlash = (p: string) => !/[\d/:.]/.test(p);

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

const MERIDIEM = '(?:am|pm|a\\.m\\.?|p\\.m\\.?)';
const TIME_TOK = `(?:noon|midnight|\\d{1,2}(?::\\d{2})?(?:\\s*${MERIDIEM}(?![a-z]))?)`;
const HOUR_WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve';
const NOT_A_TIME_AFTER = `(?!\\s*(?:\\/|st\\b|nd\\b|rd\\b|th\\b|%|days?\\b|weeks?\\b|hours?\\b|hrs?\\b|min|months?\\b|years?\\b|people\\b|of\\b|${WEEKDAY_PLURAL_RE}))`;

export function parseTimeTok(tok: string): RawTime | null {
  const t = tok.trim().toLowerCase();
  if (t === 'noon') return { h: 12, m: 0, meridiem: 'pm' };
  if (t === 'midnight') return { h: 0, m: 0, meridiem: 'am' };
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!m) {
    const w = wordToNum(t);
    return w && w >= 1 && w <= 12 && Number.isInteger(w) ? { h: w, m: 0, meridiem: null } : null;
  }
  const h = parseInt(m[1]!, 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3] ? (m[3].startsWith('a') ? 'am' : 'pm') : null;
  if (min > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    return { h, m: min, meridiem: mer };
  }
  if (h > 23) return null;
  // 24h style ("15:00", "08:30", "0:15") is unambiguous: encode as a definite meridiem.
  if (h >= 13 || h === 0 || (m[2] && m[1]!.length === 2 && m[1]!.startsWith('0'))) {
    return { h: h % 12 === 0 ? 12 : h % 12, m: min, meridiem: h >= 12 ? 'pm' : 'am' };
  }
  return { h, m: min, meridiem: null };
}

function toMin(t: RawTime, mer: 'am' | 'pm'): number {
  return ((t.h % 12) + (mer === 'pm' ? 12 : 0)) * 60 + t.m;
}

/** "3-4pm", "from 2 to 3:30", "between 1pm and 2pm", "10pm-1am". */
export function extractRange(sc: Scanner): { start: RawTime; end: RawTime } | null {
  const re = new RegExp(
    `(?:\\b(from|between|at)\\s+|@\\s*)?\\b(${TIME_TOK})\\s*(-|to|until|till|and)\\s*(${TIME_TOK})(?![\\d/])`,
  );
  const m = sc.find(re, notDigitOrSlash);
  if (!m) return null;
  const lead = m[1];
  if (m[3] === 'and' && lead !== 'between') return null;
  const sTok = m[2]!, eTok = m[4]!;
  const marked = (s: string) => /noon|midnight|:|m\.?$|m$/.test(s.trim());
  if (!lead && !marked(sTok) && !marked(eTok)) return null; // "chapters 3-4" is not a time
  let start = parseTimeTok(sTok);
  let end = parseTimeTok(eTok);
  if (!start || !end) return null;
  // Borrow a meridiem from the other side: "3-4pm" => 3pm-4pm; "11-1pm" => 11am-1pm.
  if (!start.meridiem && end.meridiem) {
    const same: 'am' | 'pm' = end.meridiem;
    const other: 'am' | 'pm' = same === 'pm' ? 'am' : 'pm';
    start = { ...start, meridiem: toMin(start, same) < toMin(end, same) ? same : other };
  } else if (start.meridiem && !end.meridiem) {
    const same: 'am' | 'pm' = start.meridiem;
    const other: 'am' | 'pm' = same === 'pm' ? 'am' : 'pm';
    end = { ...end, meridiem: toMin(end, same) > toMin(start, same) ? same : other };
  }
  sc.consume(m);
  return { start, end };
}

/** Single time: "at 3", "3pm", "@ 7:30", "noon", "15:00", "at seven", "4 o'clock". */
export function extractTime(sc: Scanner, opts: { allowTo?: boolean } = {}): RawTime | null {
  const lead = `(?:(?:\\bat|\\baround|\\bby|@)\\s*)?`;
  // In move commands "to 8" is a time ("move dinner to 8").
  const bareLead = opts.allowTo ? `(?:\\bat|\\baround|\\bto|@)` : `(?:\\bat|\\baround|@)`;
  const patterns: RegExp[] = [
    new RegExp(`${lead}\\b(\\d{1,2}(?::\\d{2})?\\s*${MERIDIEM})(?![a-z])`),
    new RegExp(`${lead}\\b(noon|midnight)\\b`),
    new RegExp(`${lead}\\b(\\d{1,2}:\\d{2})\\b(?![/])`),
    new RegExp(`\\b(\\d{1,2}|${HOUR_WORDS})\\s*o'?clock\\b`),
    new RegExp(`${bareLead}\\s*(\\d{1,2}|${HOUR_WORDS})\\b${NOT_A_TIME_AFTER}(?:\\s*o'?clock\\b)?`),
  ];
  for (const re of patterns) {
    const m = sc.find(re, notDigitOrSlash);
    if (!m) continue;
    const t = parseTimeTok(m[1]!);
    if (!t) continue;
    sc.consume(m);
    return t;
  }
  return null;
}

/** "for 30 min", "for an hour", "for 1.5 hours", "for an hour and a half". */
export function extractDuration(sc: Scanner): number | null {
  const re = new RegExp(
    `\\bfor\\s+(?:(${NUM_WORD_RE})\\s+hours?\\s+and\\s+a\\s+half|(half\\s+an?\\s+hour)|(${NUM_WORD_RE})\\s*(hours?|hrs?|h|minutes?|mins?|m)\\b)`,
  );
  const m = sc.find(re);
  if (!m) return null;
  let min: number | null = null;
  if (m[1]) { const n = wordToNum(m[1]); if (n) min = n * 60 + 30; }
  else if (m[2]) min = 30;
  else if (m[3] && m[4]) {
    const n = wordToNum(m[3]);
    if (n) min = /^h/.test(m[4]) ? n * 60 : n;
  }
  if (!min || min <= 0 || min > 24 * 60) return null;
  sc.consume(m);
  return Math.round(min);
}

/** "up one hour", "back 30 min", "later by half an hour". Returns signed minutes. */
export function extractShift(sc: Scanner): number | null {
  const dir = sc.find(/\b(up|down|back|earlier|later|forward|ahead)\b/);
  if (!dir) return null;
  const amt = sc.find(new RegExp(
    `\\b(?:by\\s+)?(?:(an?|one|\\d+(?:\\.\\d+)?)\\s+hours?\\s+and\\s+a\\s+half|(half\\s+an?\\s+hour)|(${NUM_WORD_RE})\\s*(hours?|hrs?|h|minutes?|mins?|m)\\b)`,
  ));
  if (!amt) return null;
  let min = 0;
  if (amt[1]) min = (wordToNum(amt[1]) ?? 1) * 60 + 30;
  else if (amt[2]) min = 30;
  else min = (wordToNum(amt[3]!) ?? 1) * (/^h/.test(amt[4]!) ? 60 : 1);
  sc.consume(dir);
  sc.consume(amt);
  const sign = /^(up|earlier)$/.test(dir[1]!) ? -1 : 1;
  return Math.round(sign * min);
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

export interface DayHit {
  date: DateStr;
  hint: 'am' | 'pm' | null;
}

/** Upcoming occurrence of weekday, including today. */
export function upcomingWeekday(now: Date, dow: number): Date {
  const t = startOfDay(now);
  return addDays(t, (dow - t.getDay() + 7) % 7);
}

/** Next occurrence of weekday strictly after today. */
export function strictNextWeekday(now: Date, dow: number): Date {
  const t = startOfDay(now);
  return addDays(t, ((dow - t.getDay() + 7) % 7) || 7);
}

function partHint(word: string | undefined): 'am' | 'pm' | null {
  if (!word) return null;
  return word === 'morning' ? 'am' : 'pm';
}

function buildDate(now: Date, month: number, day: number, year: number | null): Date | null {
  const y = year ?? now.getFullYear();
  const d = new Date(y, month, day);
  if (d.getMonth() !== month || d.getDate() !== day) return null;
  if (year === null && d < startOfDay(now)) return new Date(y + 1, month, day);
  return d;
}

/** "friday next week", "next week on tuesday". Must run before window extraction. */
export function extractWeekdayOfNextWeek(sc: Scanner, now: Date): DayHit | null {
  const m = sc.find(new RegExp(`\\b(?:on\\s+)?(${WEEKDAY_RE})\\s+(?:of\\s+)?next\\s+week\\b|\\bnext\\s+week\\s+(?:on\\s+)?(${WEEKDAY_RE})\\b`));
  if (!m) return null;
  const dow = weekdayIndex((m[1] ?? m[2])!);
  if (dow === null) return null;
  sc.consume(m);
  return { date: fmtDate(addDays(startOfWeek(now), 7 + dow)), hint: null };
}

/** Any phrase naming a single day. Order matters: more specific phrases first. */
export function extractDay(sc: Scanner, now: Date): DayHit | null {
  const today = startOfDay(now);
  const hit = (m: RegExpExecArray, d: Date | null, hint: 'am' | 'pm' | null = null): DayHit | null => {
    if (!d) return null;
    sc.consume(m);
    return { date: fmtDate(d), hint };
  };
  let m: RegExpExecArray | null;

  if ((m = sc.find(/\b(?:on\s+)?(?:the\s+)?day\s+after\s+(?:tomorrow|tmrw|tmr)\b/))) return hit(m, addDays(today, 2));
  if ((m = sc.find(/\b(?:on\s+)?(?:tomorrow|tmrw|tmr|tmw|tomorow|tommorow|tommorrow|2morrow)(?:\s+(morning|afternoon|evening|night))?\b/))) {
    return hit(m, addDays(today, 1), partHint(m[1]));
  }
  if ((m = sc.find(/\btonight\b/))) return hit(m, today, 'pm');
  if ((m = sc.find(/\bthis\s+(morning|afternoon|evening)\b/))) return hit(m, today, partHint(m[1]));
  if ((m = sc.find(/\b(?:for\s+|on\s+)?today\b/))) return hit(m, today);

  if ((m = sc.find(new RegExp(`\\b(${NUM_WORD_RE})\\s+(${WEEKDAY_PLURAL_RE}|${WEEKDAY_RE})\\s+from\\s+(?:now|today)\\b`)))) {
    const n = wordToNum(m[1]!);
    const dow = weekdayIndex(m[2]!);
    if (n && dow !== null) return hit(m, addDays(strictNextWeekday(now, dow), (n - 1) * 7));
  }
  if ((m = sc.find(new RegExp(`\\b(?:in\\s+(${NUM_WORD_RE})\\s+(days?|weeks?)|(${NUM_WORD_RE})\\s+(days?|weeks?)\\s+from\\s+(?:now|today))\\b`)))) {
    const n = wordToNum((m[1] ?? m[3])!);
    const unit = (m[2] ?? m[4])!;
    if (n && Number.isInteger(n)) return hit(m, addDays(today, unit.startsWith('w') ? n * 7 : n));
  }

  if ((m = sc.find(/\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/, notDigitOrSlash))) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : null;
    const d = buildDate(now, parseInt(m[1]!, 10) - 1, parseInt(m[2]!, 10), y);
    if (d) return hit(m, d);
  }
  if ((m = sc.find(new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?`)))) {
    const mo = monthIndex(m[1]!);
    if (mo !== null) {
      const d = buildDate(now, mo, parseInt(m[2]!, 10), m[3] ? parseInt(m[3], 10) : null);
      if (d) return hit(m, d);
    }
  }
  if ((m = sc.find(new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b(?:,?\\s+(\\d{4})\\b)?`)))) {
    const mo = monthIndex(m[2]!);
    if (mo !== null) {
      const d = buildDate(now, mo, parseInt(m[1]!, 10), m[3] ? parseInt(m[3], 10) : null);
      if (d) return hit(m, d);
    }
  }
  if ((m = sc.find(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/))) {
    const dom = parseInt(m[1]!, 10);
    let d = buildDate(now, now.getMonth(), dom, now.getFullYear());
    if (d && d < today) d = buildDate(now, now.getMonth() + 1 > 11 ? 0 : now.getMonth() + 1, dom, now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear());
    if (d) return hit(m, d);
  }

  if ((m = sc.find(new RegExp(`\\b(?:on\\s+)?(?:(this|next|coming|the)\\s+)?(${WEEKDAY_RE})\\b(?:\\s+(morning|afternoon|evening|night))?`)))) {
    const dow = weekdayIndex(m[2]!);
    if (dow !== null) {
      const d = m[1] === 'next' || m[1] === 'coming' ? strictNextWeekday(now, dow) : upcomingWeekday(now, dow);
      return hit(m, d, partHint(m[3]));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Windows ("sometime next week", "before friday") — APP_SPEC §4.7
// ---------------------------------------------------------------------------

export interface WindowHit {
  start: DateStr;
  end: DateStr;
  label: string;
}

export function extractWindow(sc: Scanner, now: Date): WindowHit | null {
  const today = startOfDay(now);
  const sunday = startOfWeek(now);
  let m: RegExpExecArray | null;

  if ((m = sc.find(/\b(?:some\s*time\s+|anytime\s+|during\s+)?next\s+week\b/))) {
    // Monday–Thursday of next week: Friday is the deadline itself, so stop 24h before it.
    const mon = addDays(sunday, 8);
    sc.consume(m);
    return { start: fmtDate(mon), end: fmtDate(addDays(mon, 3)), label: 'next week' };
  }
  if ((m = sc.find(/\b(?:some\s*time\s+)?(this|next)\s+weekend\b/))) {
    const sat = today.getDay() === 0 ? addDays(today, -1) : addDays(sunday, 6);
    const start = m[1] === 'next' ? addDays(sat, 7) : sat;
    sc.consume(m);
    const s = start < today ? today : start;
    return { start: fmtDate(s), end: fmtDate(addDays(start, 1)), label: `${m[1]} weekend` };
  }
  if ((m = sc.find(new RegExp(`\\b(?:some\\s*time\\s+)?before\\s+(?:next\\s+|this\\s+)?(${WEEKDAY_RE})\\b`)))) {
    const dow = weekdayIndex(m[1]!);
    if (dow !== null) {
      // On or after the named day, "before friday" means next week's Friday.
      const deadline = strictNextWeekday(now, dow);
      const end = addDays(deadline, -1);
      sc.consume(m);
      const name = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
      return { start: fmtDate(today), end: fmtDate(end < today ? today : end), label: `before ${name}` };
    }
  }
  if ((m = sc.find(/\b(?:some\s*time\s+)?this\s+week\b|\bsome\s*time\b/))) {
    sc.consume(m);
    return { start: fmtDate(today), end: fmtDate(addDays(sunday, 6)), label: 'this week' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Recurrence — APP_SPEC §4.10, any combination of weekdays
// ---------------------------------------------------------------------------

export function extractRecurrence(sc: Scanner): { days: number[]; label: string } | null {
  let m: RegExpExecArray | null;
  if ((m = sc.find(/\b(?:every|each)\s+(?:single\s+)?day\b|\bdaily\b|\beveryday\b/))) {
    sc.consume(m);
    return { days: [0, 1, 2, 3, 4, 5, 6], label: 'every day' };
  }
  if ((m = sc.find(/\b(?:every|each)\s+weekday\b|\b(?:every\s+|on\s+)?weekdays\b/))) {
    sc.consume(m);
    return { days: [1, 2, 3, 4, 5], label: 'every weekday' };
  }
  if ((m = sc.find(/\b(?:every|each)\s+weekend\b|\b(?:every\s+|on\s+)?weekends\b/))) {
    sc.consume(m);
    return { days: [0, 6], label: 'every weekend' };
  }
  const DAY = `(?:${WEEKDAY_PLURAL_RE}|${WEEKDAY_RE})`;
  const SEP = `(?:\\s*(?:,|&|\\/|\\+)\\s*|\\s+(?:and|or)\\s+|\\s*,\\s*(?:and|or)\\s+|\\s+)`;
  const list = `(${DAY}(?:${SEP}${DAY})*)\\b`;
  m = sc.find(new RegExp(`\\b(?:every|each)\\s+(?!other\\b)${list}`));
  if (!m) {
    const plural = sc.find(new RegExp(`\\b(?:on\\s+)?((?:${WEEKDAY_PLURAL_RE})(?:${SEP}${DAY})*)\\b(?!\\s+from\\b)`));
    if (plural && !/\bfrom\s+(now|today)/.test(sc.rest().slice(plural.index))) m = plural;
  }
  if (!m) return null;
  const words = m[1]!.split(/[^a-z]+/).filter((w) => w && w !== 'and' && w !== 'or');
  const days = [...new Set(words.map(weekdayIndex).filter((d): d is number => d !== null))].sort();
  if (!days.length) return null;
  sc.consume(m);
  const names = days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]!);
  const label = names.length > 1 ? `every ${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : `every ${names[0]}`;
  return { days, label };
}

/** Meridiem hints that aren't attached to a day word: "in the morning", "at night". */
export function extractPartOfDay(sc: Scanner): 'am' | 'pm' | null {
  const m = sc.find(/\b(?:in\s+the\s+(morning|afternoon|evening)|at\s+(night))\b/);
  if (!m) return null;
  sc.consume(m);
  return partHint(m[1] ?? m[2]);
}
