// Shared vocabulary for the parser.

export const WORDNUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, couple: 2, 'a couple': 2, 'a couple of': 2, few: 3, 'a few': 3,
};
export const NUM_WORD_RE = 'a couple of|a couple|a few|\\d+(?:\\.\\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve';

export function wordToNum(w: string): number | null {
  const s = w.trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  return WORDNUM[s] ?? null;
}

/** Weekday spellings -> 0..6 (Sunday = 0). Singular only; plurals handled separately. */
export const WEEKDAY_FORMS: [string, number][] = [
  ['sunday', 0], ['sun', 0],
  ['monday', 1], ['mon', 1],
  ['tuesday', 2], ['tues', 2], ['tue', 2],
  ['wednesday', 3], ['weds', 3], ['wed', 3],
  ['thursday', 4], ['thurs', 4], ['thur', 4], ['thu', 4],
  ['friday', 5], ['fri', 5],
  ['saturday', 6], ['sat', 6],
];
export const WEEKDAY_RE = WEEKDAY_FORMS.map(([w]) => w).join('|');
export const WEEKDAY_PLURAL_RE = 'sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays';

export function weekdayIndex(word: string): number | null {
  const w = word.toLowerCase();
  for (const [form, i] of WEEKDAY_FORMS) if (form === w || form + 's' === w) return i;
  return null;
}

export const MONTHS: [RegExp, number][] = [
  [/^jan(uary)?$/, 0], [/^feb(ruary)?$/, 1], [/^mar(ch)?$/, 2], [/^apr(il)?$/, 3], [/^may$/, 4],
  [/^june?$/, 5], [/^july?$/, 6], [/^aug(ust)?$/, 7], [/^sep(t(ember)?)?$/, 8], [/^oct(ober)?$/, 9],
  [/^nov(ember)?$/, 10], [/^dec(ember)?$/, 11],
];
export const MONTH_RE = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';

export function monthIndex(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, '');
  for (const [re, i] of MONTHS) if (re.test(w)) return i;
  return null;
}

/** Bare replies that just close whatever prompt is showing (APP_SPEC §4.13). */
export const DISMISS_WORDS = new Set([
  'cancel', 'never mind', 'nevermind', 'nvm', 'stop', 'forget it', 'no thanks', 'nothing', 'no', 'nope', 'nah',
]);

export const CANCEL_VERBS = ['cancel', 'delete', 'remove'];
/** Unambiguous move verbs: if nothing matches we offer to create it instead. */
export const MOVE_VERBS_STRICT = ['move', 'shift', 'reschedule', 'revise', 'push', 'bump'];
/** Words that are move verbs only if an existing item matches ("take out the trash" is a new task). */
export const MOVE_VERBS_LOOSE = ['take', 'replace', 'change'];
export const COMPLETE_RE = /^(?:mark\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished)|(?:done with|finished|completed|complete|check off)\s+(.+))$/;

/** Filler that never identifies an item when matching titles. */
export const STOPWORDS = new Set([
  'the', 'my', 'a', 'an', 'to', 'on', 'at', 'for', 'with', 'from', 'it', 'of', 'and', 'in', 'up', 'down', 'back',
  'earlier', 'later', 'forward', 'ahead', 'by', 'hour', 'hours', 'hr', 'hrs', 'minute', 'minutes', 'min', 'mins',
  'half', 'this', 'that', 'next', 'please', 'pls', 'can', 'you', 'event', 'reminder', 'task',
  'all', 'every', 'one', 'occurrence', 'occurrences', 'instead', 'until', 'till', 'into', 'just', 'i', 'me', 'our',
]);

export type MealHint = { meridiem: 'am' | 'pm' | 'lunch'; defaultHour: number | null };

/** Meal / time-of-day words in a title (APP_SPEC §4.3, §4.5). */
export function mealHint(lowerTitle: string): MealHint | null {
  if (/\b(dinner|supper)\b/.test(lowerTitle)) return { meridiem: 'pm', defaultHour: 18 };
  if (/\b(night|evening|tonight)\b/.test(lowerTitle)) return { meridiem: 'pm', defaultHour: null };
  if (/\b(breakfast|brunch)\b/.test(lowerTitle)) {
    return { meridiem: 'am', defaultHour: /brunch/.test(lowerTitle) ? 11 : 8 };
  }
  if (/\bmorning\b/.test(lowerTitle)) return { meridiem: 'am', defaultHour: null };
  if (/\blunch\b/.test(lowerTitle)) return { meridiem: 'lunch', defaultHour: 12 };
  return null;
}
