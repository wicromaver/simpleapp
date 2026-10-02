// Client side of the online AI fallback. Talks only to OUR server endpoint (never a model
// vendor directly). Disabled unless EXPO_PUBLIC_PARSE_FALLBACK_URL is set, so the app
// works entirely on the on-device rules by default.

const URL = process.env.EXPO_PUBLIC_PARSE_FALLBACK_URL;

export function isFallbackConfigured(): boolean {
  return !!URL;
}

/** Auth header provider; set by the sync layer once the anonymous session exists. */
let authToken: () => Promise<string | null> = async () => null;
export function setFallbackAuth(fn: () => Promise<string | null>) {
  authToken = fn;
}

export async function fetchFallbackIntent(text: string, now: Date, signal: AbortSignal): Promise<unknown> {
  if (!URL) throw new Error('fallback not configured');
  const token = await authToken();
  const res = await fetch(URL, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      text,
      // Local wall-clock time + offset so the server resolves "today" the way the user sees it.
      now: now.toISOString(),
      tzOffsetMin: now.getTimezoneOffset(),
    }),
  });
  if (!res.ok) throw new Error(`fallback ${res.status}`);
  return res.json();
}
