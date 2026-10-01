// Free vs Pro plans. Pure: the server stores the entitlement and usage counter (and is the
// source of truth for enforcing the AI cap); clients run the same functions to decide what
// to show and whether to attempt an AI-assisted parse at all, including offline.
//
// Free (no time limit, no card): the full local app + a monthly allowance of AI-assisted parses.
// Pro: Google/Outlook calendar sync + unlimited AI-assisted parses.

import { fmtDate, type DateStr } from './dates';

export type Plan = 'free' | 'pro';
export type Feature = 'calendarSync' | 'unlimitedAI';

export const FREE_AI_PARSES_PER_MONTH = 100;

export const PLAN_FEATURES: Record<Plan, { aiParsesPerMonth: number | null; features: Feature[] }> = {
  free: { aiParsesPerMonth: FREE_AI_PARSES_PER_MONTH, features: [] },
  pro: { aiParsesPerMonth: null, features: ['calendarSync', 'unlimitedAI'] },
};

/** USD. Annual is $4/mo billed yearly; monthly is $6/mo. Billing provider TBD. */
export const PRO_PRICING = {
  monthly: { perMonth: 6, billed: 6 },
  annual: { perMonth: 4, billed: 48 },
} as const;

export interface Entitlement {
  /** End of the paid Pro period (ISO), or null if not subscribed. */
  proUntil: string | null;
  /** AI-assisted parses used in `period` ('YYYY-MM'). */
  aiUsage: { period: string; count: number };
}

export function freeEntitlement(now: Date): Entitlement {
  return { proUntil: null, aiUsage: { period: usagePeriod(now), count: 0 } };
}

/** Allowance resets on the 1st of each calendar month (local time). */
export function usagePeriod(now: Date): string {
  return fmtDate(now).slice(0, 7);
}

export function effectivePlan(e: Entitlement, now: Date): Plan {
  return e.proUntil && new Date(e.proUntil).getTime() > now.getTime() ? 'pro' : 'free';
}

export function hasFeature(e: Entitlement, now: Date, f: Feature): boolean {
  return PLAN_FEATURES[effectivePlan(e, now)].features.includes(f);
}

export interface AIQuota {
  /** null => unlimited */
  limit: number | null;
  used: number;
  remaining: number | null;
  resetsOn: DateStr;
}

export function aiQuota(e: Entitlement, now: Date): AIQuota {
  const limit = PLAN_FEATURES[effectivePlan(e, now)].aiParsesPerMonth;
  const used = e.aiUsage.period === usagePeriod(now) ? e.aiUsage.count : 0;
  const resetsOn = fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  return { limit, used, remaining: limit === null ? null : Math.max(0, limit - used), resetsOn };
}

export function canUseAI(e: Entitlement, now: Date): boolean {
  const q = aiQuota(e, now);
  return q.remaining === null || q.remaining > 0;
}

/** Count one AI-assisted parse (rolls the counter over at a new month). */
export function recordAIUse(e: Entitlement, now: Date): Entitlement {
  const period = usagePeriod(now);
  const count = e.aiUsage.period === period ? e.aiUsage.count + 1 : 1;
  return { ...e, aiUsage: { period, count } };
}
