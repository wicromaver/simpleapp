// Client side of the online AI fallback. Talks only to OUR Supabase edge function (never a
// model vendor directly). The on-device rules always run first; this is consulted only
// when they're unsure, with a timeout, and any failure just keeps the rule result.

import { usagePeriod } from '@simpleapp/core';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

const URL = process.env.EXPO_PUBLIC_PARSE_FALLBACK_URL ?? (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/parse-fallback` : '');

/** Month in which the server said the free allowance is used up (skip calls until it rolls over). */
let exhaustedPeriod: string | null = null;

export function isFallbackConfigured(): boolean {
  return !!URL;
}

export function aiAllowed(now: Date): boolean {
  return exhaustedPeriod !== usagePeriod(now);
}

/** Auth token provider; set by the auth layer once a session (anonymous or not) exists. */
let authToken: () => Promise<string | null> = async () => null;
export function setFallbackAuth(fn: () => Promise<string | null>) {
  authToken = fn;
}

export async function fetchFallbackIntent(text: string, now: Date, signal: AbortSignal): Promise<unknown> {
  if (!URL) throw new Error('fallback not configured');
  const token = await authToken();
  if (!token) throw new Error('no session yet'); // the allowance is per account
  const res = await fetch(URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      text,
      // Instant + offset so the server resolves "today" the way the user sees it.
      now: now.toISOString(),
      tzOffsetMin: now.getTimezoneOffset(),
    }),
  });
  if (res.status === 402) exhaustedPeriod = usagePeriod(now);
  if (!res.ok) throw new Error(`fallback ${res.status}`);
  return res.json();
}
