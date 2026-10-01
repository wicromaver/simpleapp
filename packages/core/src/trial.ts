// Free trial + paywall status. Pure: the server stores the timestamps, every client
// computes the same answer (and can do so offline from the last-synced values).

export const TRIAL_DAYS = 7;

export interface Entitlement {
  /** When the account was created / trial began (ISO). */
  trialStartedAt: string;
  /** End of the paid period (ISO), or null if never subscribed. */
  paidUntil: string | null;
}

export type AccessStatus =
  | { state: 'trial'; endsAt: string; daysLeft: number }
  | { state: 'active'; until: string }
  | { state: 'expired'; since: string };

export function accessStatus(e: Entitlement, now: Date): AccessStatus {
  if (e.paidUntil && new Date(e.paidUntil).getTime() > now.getTime()) return { state: 'active', until: e.paidUntil };
  const ends = new Date(new Date(e.trialStartedAt).getTime() + TRIAL_DAYS * 86400000);
  if (now.getTime() < ends.getTime()) {
    const daysLeft = Math.ceil((ends.getTime() - now.getTime()) / 86400000);
    return { state: 'trial', endsAt: ends.toISOString(), daysLeft };
  }
  const since = e.paidUntil && new Date(e.paidUntil).getTime() > ends.getTime() ? e.paidUntil : ends.toISOString();
  return { state: 'expired', since };
}

/** Banner copy so users always know they're on a trial (never a surprise lockout). */
export function trialBanner(s: AccessStatus): string | null {
  if (s.state === 'trial') return s.daysLeft <= 1 ? 'Last day of your free trial' : `Free trial — ${s.daysLeft} days left`;
  if (s.state === 'expired') return 'Your free trial has ended. Subscribe to keep using the app.';
  return null;
}
