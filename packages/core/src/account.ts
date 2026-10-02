// "Invisible account": every install silently gets an anonymous backend account on first
// launch. We only ask for an email at moments where its value is obvious. These pure rules
// decide when to ask and what happens to data when an anonymous install signs in.

import type { Item, Series } from './types';

export interface AccountInfo {
  isAnonymous: boolean;
  email: string | null;
}

export type ClaimMoment =
  /** First launch on a device with nothing in it: maybe they use us elsewhere already. */
  | 'emptyFirstLaunch'
  /** Turning on Google/Outlook sync needs a real identity (and billing). */
  | 'enableCalendarSync'
  | 'upgradeToPro'
  /** The always-available, never-pushed row in Settings. */
  | 'settings';

export interface ClaimPrompt {
  moment: ClaimMoment;
  /** inline = dismissible note; gate = required to continue that action; row = passive settings entry. */
  style: 'inline' | 'gate' | 'row';
  /** signIn = look up an existing account by email; claim = attach an email to this account. */
  mode: 'signIn' | 'claim';
  title: string;
  body: string;
  primary: string;
  secondary: string | null;
}

export function claimPrompt(
  moment: ClaimMoment,
  account: AccountInfo,
  ctx: { itemCount: number; dismissed: ClaimMoment[] },
): ClaimPrompt | null {
  if (!account.isAnonymous) return null;
  switch (moment) {
    case 'emptyFirstLaunch':
      // Only while this install is still empty; never again once dismissed or used.
      if (ctx.itemCount > 0 || ctx.dismissed.includes('emptyFirstLaunch')) return null;
      return {
        moment, style: 'inline', mode: 'signIn',
        title: 'Using this on another device?',
        body: 'Sign in with your email to bring your schedule here.',
        primary: 'Sign in', secondary: 'Not now',
      };
    case 'enableCalendarSync':
      return {
        moment, style: 'gate', mode: 'claim',
        title: 'Add your email to turn on sync',
        body: 'Calendar sync is tied to your account, so we need an email to connect it. Everything you already have stays put.',
        primary: 'Continue', secondary: 'Cancel',
      };
    case 'upgradeToPro':
      return {
        moment, style: 'gate', mode: 'claim',
        title: 'Add your email to upgrade',
        body: 'Your subscription is tied to your account. Everything you already have stays put.',
        primary: 'Continue', secondary: 'Cancel',
      };
    case 'settings':
      return {
        moment, style: 'row', mode: 'claim',
        title: 'Add email',
        body: 'Keeps your schedule safe and lets you use it on other devices.',
        primary: 'Add email', secondary: null,
      };
  }
}

/**
 * When an anonymous install signs into an existing account, its local items move into that
 * account instead of being thrown away. Exact duplicates (same title, date and times) are
 * dropped so signing in twice never doubles anything.
 */
export function mergeAnonymousInto(
  account: { items: Item[]; series: Series[] },
  anon: { items: Item[]; series: Series[] },
): { items: Item[]; series: Series[] } {
  const key = (i: Item) => [i.title.trim().toLowerCase(), i.date, i.start, i.end, i.done].join('|');
  const seen = new Set(account.items.map(key));
  const seriesIds = new Set(account.series.map((s) => s.id));
  return {
    items: [...account.items, ...anon.items.filter((i) => !seen.has(key(i)))],
    series: [...account.series, ...anon.series.filter((s) => !seriesIds.has(s.id))],
  };
}
