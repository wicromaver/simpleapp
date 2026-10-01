import type { DateStr, TimeStr } from './dates';

// ---------------------------------------------------------------------------
// Data model (APP_SPEC §3). Kind is derived from the date/time fields, never stored
// as a separate user-set type.
// ---------------------------------------------------------------------------

export type Kind = 'task' | 'reminder' | 'event';
export type Color = 'blue' | 'orange' | 'tan';

export interface Item {
  id: string;
  title: string;
  /** null => Task */
  date: DateStr | null;
  /** start/end both null => Reminder (when date is set) */
  start: TimeStr | null;
  end: TimeStr | null;
  /** Set only when an event ends on a later calendar day than `date` (crosses midnight). */
  endDate: DateStr | null;
  /** ISO timestamp, Reminders only. */
  reminderAt: string | null;
  /** Tasks only. */
  done: boolean;
  doneAt: string | null;
  color: Color;
  recurring: { days: number[] } | null;
  seriesId: string | null;
  /** The date this occurrence was generated for (stable even if the occurrence is moved). */
  occurrenceDate: DateStr | null;
  createdAt: string;
}

/** A recurring rule. Occurrences are materialized as Items on a rolling window. */
export interface Series {
  id: string;
  title: string;
  days: number[]; // 0 = Sunday
  start: TimeStr | null; // null => recurring all-day reminder
  end: TimeStr | null;
  startDate: DateStr;
  until: DateStr | null;
  /** Occurrence dates that were cancelled individually and must not be regenerated. */
  exceptions: DateStr[];
  createdAt: string;
}

export interface CoreSettings {
  /** Default event length in minutes when none is given or inferable. */
  defaultDuration: 30 | 60;
  /** Minutes-before alerts for timed events; any subset of [15, 30, 60]. */
  eventAlerts: number[];
}

export interface EngineState {
  items: Item[];
  series: Series[];
  pending: Pending | null;
}

export interface EngineContext {
  now: Date;
  settings: CoreSettings;
  newId: () => string;
}

// ---------------------------------------------------------------------------
// Intents: the boundary between "understanding text" and "applying rules".
// The rule-based parser produces these; the online AI fallback produces the
// same shape, so every behavioral rule (rollover, meal hints, conflicts, …)
// is applied identically regardless of who understood the text.
// ---------------------------------------------------------------------------

export interface RawTime {
  h: number; // 0-23; values 1-12 with meridiem null are ambiguous
  m: number;
  meridiem: 'am' | 'pm' | null;
}

export interface Draft {
  title: string;
  /** Explicit date the user named, or null. */
  date: DateStr | null;
  start: RawTime | null;
  end: RawTime | null;
  durationMin: number | null;
  /** "sometime next week", "before friday": schedule on the least-booked day in [start, end]. */
  window: { start: DateStr; end: DateStr; label: string } | null;
  /** Weekdays (0 = Sunday) for a repeating item. */
  recurrence: { days: number[]; label: string } | null;
  /** Meridiem hint from words like "tonight" / "in the morning". */
  hint: 'am' | 'pm' | null;
}

export interface MoveDest {
  shiftMin: number | null;
  date: DateStr | null;
  start: RawTime | null;
  end: RawTime | null;
  window: Draft['window'];
}

export type Intent =
  | { type: 'create'; draft: Draft }
  | { type: 'move'; query: string; dest: MoveDest; strict: boolean }
  | { type: 'cancel'; query: string; onDate: DateStr | null }
  | { type: 'complete'; query: string }
  | { type: 'dismiss' };

export interface ParseResult {
  intent: Intent;
  /** 'low' => the text had date/time-looking words the rules couldn't place. */
  confidence: 'high' | 'low';
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Engine output. Pure data: the app applies `ops` to its store and renders the rest.
// ---------------------------------------------------------------------------

export type Op =
  | { op: 'putItem'; item: Item }
  | { op: 'deleteItem'; id: string }
  | { op: 'putSeries'; series: Series }
  | { op: 'deleteSeries'; id: string };

export interface Choice {
  label: string;
  /** Text fed back into handleInput (with the outcome's pending state) when tapped. */
  reply: string;
}

export interface Jump {
  tab: 'tasks' | 'calendar';
  date: DateStr | null;
}

/** Conversational state: what the last message asked the user. */
export type Pending =
  | { type: 'pickMatch'; action: 'move' | 'cancel' | 'complete'; candidateIds: string[]; text: string }
  | { type: 'seriesScope'; itemId: string }
  | { type: 'moveWhen'; itemId: string }
  | { type: 'confirmCreate'; text: string }
  | { type: 'createWhen'; title: string };

export interface Outcome {
  ops: Op[];
  /** Empty string => clear the message slot (e.g. after a dismissal). */
  message: string;
  choices: Choice[];
  pending: Pending | null;
  jump: Jump | null;
  /** True when the rule parser was unsure; the app may ask the AI fallback (if online). */
  needsFallback: boolean;
  /** The text the fallback should interpret, when needsFallback is true. */
  fallbackText: string | null;
}
