// parse-fallback: the online AI fallback for the insert bar.
//
// The app always parses on-device first. Only when its rules are unsure AND the device is
// online does it call this function, with a short timeout, keeping the rule result if this
// is slow or fails. This function:
//   1. verifies the caller's Supabase session (anonymous or signed in),
//   2. spends one AI parse from their monthly allowance (Free: 100/month, Pro: unlimited),
//   3. asks Claude to turn the text into the app's Intent JSON (schema-constrained),
//   4. returns that JSON; the app validates it and applies it with the same rules engine.
//
// Secrets (Dashboard -> Edge Functions -> Secrets): ANTHROPIC_API_KEY.
// Optional: FALLBACK_MODEL (default claude-opus-5-5). SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const FREE_AI_PARSES_PER_MONTH = 100;
const MODEL = Deno.env.get('FALLBACK_MODEL') ?? 'claude-opus-5-5';
const MAX_TEXT = 300;
// Haiku 4.5 rejects the effort setting and the "default" fallback mode; newer models take both.
const SUPPORTS_EFFORT_AND_FALLBACKS = /^claude-(opus-5|fable-5|sonnet-5-5)/.test(MODEL);

const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
  timeout: 8_000, // the app gives up sooner anyway and keeps its own result
  maxRetries: 0,
});

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------------
// Output schema: mirrors the Intent type in packages/core/src/types.ts.
// ---------------------------------------------------------------------------

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const DATE = { type: 'string', format: 'date' };
const TIME = {
  type: 'object',
  additionalProperties: false,
  required: ['h', 'm', 'meridiem'],
  properties: {
    h: { type: 'integer', description: '1-12 with a meridiem, or 0-23 when meridiem is null' },
    m: { type: 'integer', description: '0-59' },
    meridiem: nullable({ type: 'string', enum: ['am', 'pm'] }),
  },
};
const WINDOW = {
  type: 'object',
  additionalProperties: false,
  required: ['start', 'end', 'label'],
  properties: { start: DATE, end: DATE, label: { type: 'string' } },
};

const INTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent'],
  properties: {
    intent: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'draft'],
          properties: {
            type: { const: 'create' },
            draft: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'date', 'start', 'end', 'durationMin', 'window', 'recurrence', 'hint'],
              properties: {
                title: { type: 'string' },
                date: nullable(DATE),
                start: nullable(TIME),
                end: nullable(TIME),
                durationMin: nullable({ type: 'integer' }),
                window: nullable(WINDOW),
                recurrence: nullable({
                  type: 'object',
                  additionalProperties: false,
                  required: ['days', 'label'],
                  properties: {
                    days: { type: 'array', items: { type: 'integer', description: '0=Sunday ... 6=Saturday' } },
                    label: { type: 'string' },
                  },
                }),
                hint: nullable({ type: 'string', enum: ['am', 'pm'] }),
              },
            },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'query', 'strict', 'dest'],
          properties: {
            type: { const: 'move' },
            query: { type: 'string' },
            strict: { type: 'boolean' },
            dest: {
              type: 'object',
              additionalProperties: false,
              required: ['shiftMin', 'date', 'start', 'end', 'window'],
              properties: {
                shiftMin: nullable({ type: 'integer' }),
                date: nullable(DATE),
                start: nullable(TIME),
                end: nullable(TIME),
                window: nullable(WINDOW),
              },
            },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'query', 'onDate'],
          properties: { type: { const: 'cancel' }, query: { type: 'string' }, onDate: nullable(DATE) },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'query'],
          properties: { type: { const: 'complete' }, query: { type: 'string' } },
        },
      ],
    },
  },
};

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The user's wall-clock "now", from the instant and their UTC offset. */
function localNow(nowIso: string, tzOffsetMin: number) {
  const local = new Date(Date.parse(nowIso) - tzOffsetMin * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
    weekday: DOW[local.getUTCDay()],
  };
}

function systemPrompt(now: { date: string; time: string; weekday: string }): string {
  return `You interpret one line typed into a minimal scheduling app and return it as a JSON intent.

Today is ${now.weekday} ${now.date}, local time ${now.time}. Weeks start on Sunday.

Intent types:
- create: a new item. title is the thing itself, without date/time words ("call mom", not "call mom every other tuesday"). date is the specific day if one is meant. start/end are times if given. Leave date and start null for an undated to-do. Use window instead of date for a vague deadline ("sometime next week", "before friday"): the app picks the least busy day in that range. Use recurrence for repeating items (days 0=Sunday..6=Saturday); date is then the first occurrence if one is implied.
- move: change an existing item. query is the words that identify it. Use shiftMin for relative moves ("an hour later" = 60, "30 min earlier" = -30), otherwise date and/or start.
- cancel: delete an existing item. query identifies it; onDate if a specific occurrence is named.
- complete: mark an existing to-do as done.

Times: {"h", "m", "meridiem"}. Set meridiem only when the user made am/pm clear ("3pm", "tonight", "in the morning"). Otherwise leave it null; the app has rules for ambiguous hours.

If something can't be expressed exactly (for example "every other Tuesday"), choose the closest single item the user would want next and keep the title clean. Never invent details that weren't typed.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  // 1. Who is calling? (anonymous accounts count; requests without a session don't.)
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData.user) return json(401, { error: 'not signed in' });
  const userId = userData.user.id;

  let body: { text?: unknown; now?: unknown; tzOffsetMin?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad json' });
  }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  const nowIso = typeof body.now === 'string' && !Number.isNaN(Date.parse(body.now)) ? body.now : new Date().toISOString();
  const tz = typeof body.tzOffsetMin === 'number' && Math.abs(body.tzOffsetMin) <= 14 * 60 ? body.tzOffsetMin : 0;
  if (!text) return json(400, { error: 'empty text' });

  // 2. Spend one parse from the allowance (atomic; Pro is unlimited).
  const { data: allowed, error: quotaError } = await admin.rpc('consume_ai_parse', {
    p_user: userId,
    p_free_limit: FREE_AI_PARSES_PER_MONTH,
  });
  if (quotaError) return json(500, { error: 'quota check failed' });
  if (!allowed) return json(402, { error: 'monthly AI allowance used up' });

  // 3. Ask Claude for the intent, constrained to the schema.
  try {
    const format = { type: 'json_schema' as const, schema: INTENT_SCHEMA };
    const request = {
      model: MODEL,
      max_tokens: 4_000,
      system: systemPrompt(localNow(nowIso, tz)),
      messages: [{ role: 'user' as const, content: text }],
    };
    const response = SUPPORTS_EFFORT_AND_FALLBACKS
      ? await anthropic.beta.messages.create({
          ...request,
          // Short, well-specified task: low effort keeps latency and cost down.
          output_config: { effort: 'low', format },
          // If the model declines, the API retries on a suitable fallback model in the same call.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        })
      : await anthropic.beta.messages.create({ ...request, output_config: { format } });

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      await admin.rpc('refund_ai_parse', { p_user: userId });
      return json(422, { error: `no intent (${response.stop_reason})` });
    }
    const out = response.content.find((b) => b.type === 'text');
    if (!out || out.type !== 'text') {
      await admin.rpc('refund_ai_parse', { p_user: userId });
      return json(502, { error: 'no output' });
    }
    // The app re-validates this with validateIntent before using it.
    const parsed = JSON.parse(out.text) as { intent: unknown };
    return json(200, parsed.intent);
  } catch (e) {
    await admin.rpc('refund_ai_parse', { p_user: userId });
    if (e instanceof Anthropic.RateLimitError) return json(503, { error: 'busy, try again' });
    if (e instanceof Anthropic.APIError) return json(502, { error: `model error ${e.status ?? ''}`.trim() });
    return json(502, { error: 'model call failed' });
  }
});
