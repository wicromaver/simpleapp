// Online AI fallback contract.
//
// The app works fully offline on the rule parser. Only when the rules flag low confidence
// AND the device is online does the app ask a server endpoint to interpret the text. The
// endpoint returns an Intent in the same shape the rule parser produces; it is validated
// here and then applied by the same engine, so all behavioral rules still hold.
//
// This module never touches the network itself — the caller injects `fetchIntent`.

import { fmtDate, DOW } from './dates';
import { applyIntent, handleInput } from './engine';
import type { Draft, EngineContext, EngineState, Intent, MoveDest, Outcome, RawTime } from './types';

export const FALLBACK_TIMEOUT_MS = 2500;

/** Instructions for the model behind the fallback endpoint. */
export function fallbackSystemPrompt(now: Date): string {
  return [
    'You convert one line a user typed into a minimal scheduling app into a JSON intent.',
    `Today is ${DOW[now.getDay()]} ${fmtDate(now)}; local time ${now.toTimeString().slice(0, 5)}. Weeks start on Sunday.`,
    'Return ONLY JSON matching one of:',
    '{"type":"create","draft":{"title":string,"date":"YYYY-MM-DD"|null,"start":Time|null,"end":Time|null,"durationMin":number|null,"window":{"start":"YYYY-MM-DD","end":"YYYY-MM-DD","label":string}|null,"recurrence":{"days":[0-6...],"label":string}|null,"hint":"am"|"pm"|null}}',
    '{"type":"move","query":string,"strict":true,"dest":{"shiftMin":number|null,"date":"YYYY-MM-DD"|null,"start":Time|null,"end":Time|null,"window":null}}',
    '{"type":"cancel","query":string,"onDate":"YYYY-MM-DD"|null}',
    '{"type":"complete","query":string}',
    'Time is {"h":1-12,"m":0-59,"meridiem":"am"|"pm"|null}. Use meridiem null when the user did not make am/pm clear — the app resolves it.',
    'Title: the thing itself, without date/time words. date null and start null => an undated task.',
    'A vague deadline ("sometime next week") is a window, not a date.',
  ].join('\n');
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const optDate = (v: unknown): string | null | undefined => (v == null ? null : isDate(v) ? v : undefined);
const optStr = (v: unknown, max = 200): string | null | undefined => (v == null ? null : typeof v === 'string' && v.length <= max ? v : undefined);

function time(v: unknown): RawTime | null | undefined {
  if (v == null) return null;
  if (!isObj(v)) return undefined;
  const { h, m, meridiem } = v;
  if (typeof h !== 'number' || !Number.isInteger(h) || typeof m !== 'number' || !Number.isInteger(m) || m < 0 || m > 59) return undefined;
  if (meridiem !== null && meridiem !== 'am' && meridiem !== 'pm' && meridiem !== undefined) return undefined;
  if (meridiem ? h < 1 || h > 12 : h < 0 || h > 23) return undefined;
  if (!meridiem && (h === 0 || h >= 13)) return { h: h % 12 === 0 ? 12 : h % 12, m, meridiem: h >= 12 ? 'pm' : 'am' };
  return { h, m, meridiem: (meridiem as 'am' | 'pm' | undefined) ?? null };
}

function windowOf(v: unknown): Draft['window'] | undefined {
  if (v == null) return null;
  if (!isObj(v) || !isDate(v.start) || !isDate(v.end) || v.end < v.start) return undefined;
  return { start: v.start, end: v.end, label: typeof v.label === 'string' ? v.label.slice(0, 40) : 'in that window' };
}

/** Validate untrusted model output into an Intent; null if anything is off. */
export function validateIntent(raw: unknown): Intent | null {
  if (!isObj(raw)) return null;
  if (raw.type === 'create' && isObj(raw.draft)) {
    const d = raw.draft;
    const title = typeof d.title === 'string' ? d.title.trim().slice(0, 200) : '';
    const date = optDate(d.date), start = time(d.start), end = time(d.end), window = windowOf(d.window);
    const durationMin = d.durationMin == null ? null : typeof d.durationMin === 'number' && d.durationMin > 0 && d.durationMin <= 1440 ? Math.round(d.durationMin) : undefined;
    let recurrence: Draft['recurrence'] | undefined = null;
    if (d.recurrence != null) {
      const r = d.recurrence;
      const days = isObj(r) && Array.isArray(r.days) ? r.days.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 6) : [];
      recurrence = days.length ? { days: [...new Set(days)].sort(), label: isObj(r) && typeof r.label === 'string' ? r.label.slice(0, 60) : 'repeating' } : undefined;
    }
    const hint = d.hint === 'am' || d.hint === 'pm' ? d.hint : null;
    if (!title || date === undefined || start === undefined || end === undefined || window === undefined || durationMin === undefined || recurrence === undefined) return null;
    return { type: 'create', draft: { title, date, start, end, durationMin, window, recurrence, hint } };
  }
  if (raw.type === 'move' && typeof raw.query === 'string' && isObj(raw.dest)) {
    const d = raw.dest;
    const date = optDate(d.date), start = time(d.start), end = time(d.end), window = windowOf(d.window);
    const shiftMin = d.shiftMin == null ? null : typeof d.shiftMin === 'number' && Math.abs(d.shiftMin) <= 1440 ? Math.round(d.shiftMin) : undefined;
    if (date === undefined || start === undefined || end === undefined || window === undefined || shiftMin === undefined) return null;
    const dest: MoveDest = { shiftMin, date, start, end, window };
    return { type: 'move', query: raw.query.slice(0, 200), dest, strict: true };
  }
  if (raw.type === 'cancel' && typeof raw.query === 'string') {
    const onDate = optDate(raw.onDate);
    if (onDate === undefined) return null;
    return { type: 'cancel', query: raw.query.slice(0, 200), onDate };
  }
  if (raw.type === 'complete' && typeof raw.query === 'string') {
    const q = optStr(raw.query);
    return q ? { type: 'complete', query: q } : null;
  }
  return null;
}

export interface FallbackOptions {
  online: boolean;
  /** False when the plan's monthly AI allowance is used up (see plans.ts canUseAI). */
  aiAllowed?: boolean;
  /** Calls the app's own server endpoint; resolves to the model's JSON. */
  fetchIntent?: (text: string, now: Date, signal: AbortSignal) => Promise<unknown>;
  timeoutMs?: number;
}

/**
 * handleInput + optional AI fallback. Offline, or on timeout/error/invalid output,
 * the rule-based result is used, so the user is never left waiting or stuck.
 */
export async function handleInputWithFallback(
  state: EngineState, input: string, ctx: EngineContext, opts: FallbackOptions,
): Promise<Outcome & { source: 'rules' | 'ai'; aiSkipped?: 'quota' }> {
  const local = handleInput(state, input, ctx);
  if (!local.needsFallback || !opts.online || !opts.fetchIntent || !local.fallbackText) return { ...local, source: 'rules' };
  // Out of free AI parses: the rule result still goes through instantly; the UI may hint at Pro.
  if (opts.aiAllowed === false) return { ...local, source: 'rules', aiSkipped: 'quota' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? FALLBACK_TIMEOUT_MS);
  try {
    const raw = await Promise.race([
      opts.fetchIntent(local.fallbackText, ctx.now, controller.signal),
      new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('timeout')))),
    ]);
    const intent = validateIntent(raw);
    if (!intent) return { ...local, source: 'rules' };
    return { ...applyIntent(state, intent, ctx, local.fallbackText), source: 'ai' };
  } catch {
    return { ...local, source: 'rules' };
  } finally {
    clearTimeout(timer);
  }
}
