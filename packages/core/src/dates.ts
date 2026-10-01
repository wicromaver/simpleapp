// Date/time helpers. Everything is device-local time; dates are 'YYYY-MM-DD' strings and
// times are 'HH:MM' (24h) strings so they round-trip through storage without timezone drift.

export type DateStr = string;
export type TimeStr = string;

export const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const MIN_PER_DAY = 1440;

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function fmtDate(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a 'YYYY-MM-DD' string. */
export function parseDate(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
}

export function addDaysStr(s: DateStr, n: number): DateStr {
  return fmtDate(addDays(parseDate(s), n));
}

/** Calendar-day difference b - a, immune to DST. */
export function daysBetween(a: DateStr, b: DateStr): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** Weeks start on Sunday. */
export function startOfWeek(d: Date): Date {
  return addDays(startOfDay(d), -d.getDay());
}

export function timeToMin(t: TimeStr): number {
  const [h, m] = t.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

export function minToTime(min: number): TimeStr {
  const m = ((min % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** 13:30 -> "1:30pm", 9:00 -> "9am". Accepts minutes past midnight. */
export function fmtClock(min: number): string {
  const m = ((min % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mm ? ':' + pad(mm) : ''}${ap}`;
}

/** "Fri 10/2" */
export function fmtDayShort(s: DateStr): string {
  const d = parseDate(s);
  return `${DOW_SHORT[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

/** Local Date for a date string + minutes past that date's midnight (may exceed a day). */
export function atMinutes(s: DateStr, min: number): Date {
  const d = parseDate(s);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, min);
}
