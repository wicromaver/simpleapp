// Edit sheet (§6, §4.15), calendar layout (§7), tasks list, notifications, fallback, plans.
import { describe, expect, it } from 'vitest';
import {
  aiQuota, applyEdit, canUseAI, effectivePlan, FREE_AI_PARSES_PER_MONTH, freeEntitlement, hasFeature, recordAIUse, applyOps, daySegments, handleInputWithFallback, layoutDay, monthGrid, notificationTimes,
  requestDelete, toggleTask, validateIntent, visibleTasks, type EngineState, type Entitlement,
} from '../src';
import { at, makeCtx, seed, Session, WED_2PM } from './helpers';

const today = '2026-09-30';

describe('§6 unified edit sheet', () => {
  const ctx = makeCtx(WED_2PM);
  const state = (): EngineState => seed(WED_2PM,
    { title: 'Essay' },
    { title: 'Dentist', date: '2026-10-02' },
    { title: 'Sync', date: today, start: '15:00', end: '16:00' },
    { title: 'Design review', date: today, start: '17:00', end: '18:00' },
  );
  const item = (o: ReturnType<typeof applyEdit>) => (o.ops[0] as { item: import('../src').Item }).item;

  it('task + date => reminder (with reminderAt and orange)', () => {
    const o = applyEdit(state(), 'seed1', { title: 'Essay', date: '2026-10-02', start: '', end: '' }, ctx);
    expect(item(o)).toMatchObject({ date: '2026-10-02', start: null, color: 'orange' });
    expect(item(o).reminderAt).not.toBeNull();
  });

  it('reminder + times => event (blue, no reminderAt)', () => {
    const o = applyEdit(state(), 'seed2', { title: 'Dentist', date: '2026-10-02', start: '10:00', end: '11:00' }, ctx);
    expect(item(o)).toMatchObject({ start: '10:00', end: '11:00', color: 'blue', reminderAt: null });
  });

  it('event with date cleared => task (tan, all times cleared)', () => {
    const o = applyEdit(state(), 'seed3', { title: 'Sync', date: '', start: '15:00', end: '16:00' }, ctx);
    expect(item(o)).toMatchObject({ date: null, start: null, end: null, endDate: null, color: 'tan' });
    expect(o.jump).toEqual({ tab: 'tasks', date: null });
  });

  it('§4.15 only the start moved past the end => keep the original duration', () => {
    const o = applyEdit(state(), 'seed3', { title: 'Sync', date: today, start: '19:00', end: '16:00' }, ctx);
    expect(item(o)).toMatchObject({ start: '19:00', end: '20:00', endDate: null });
    expect(o.message).toContain('kept it 60 min long');
  });

  it('an end deliberately set before the start => runs past midnight', () => {
    const o = applyEdit(state(), 'seed3', { title: 'Sync', date: today, start: '22:00', end: '01:00' }, ctx);
    expect(item(o)).toMatchObject({ start: '22:00', end: '01:00', endDate: '2026-10-01' });
  });

  it('re-runs conflict detection against the new time, excluding itself', () => {
    const o = applyEdit(state(), 'seed3', { title: 'Sync', date: today, start: '17:30', end: '18:30' }, ctx);
    expect(o.message).toContain('overlaps with "Design review"');
    const o2 = applyEdit(state(), 'seed3', { title: 'Sync', date: today, start: '15:15', end: '16:00' }, ctx);
    expect(o2.message).not.toContain('Heads up');
  });

  it('series occurrence edits say they only affect this occurrence', () => {
    const s = new Session(ctx);
    s.say('gym every monday at 6am');
    const occ = s.state.items[0]!;
    const o = applyEdit(s.state, occ.id, { title: 'Gym', date: occ.date, start: '07:00', end: '07:30' }, ctx);
    expect(o.message).toContain('just this occurrence');
    expect(item(o).seriesId).toBe(occ.seriesId);
  });

  it('Delete on a series item asks One/All', () => {
    const s = new Session(ctx);
    s.say('gym every monday at 6am');
    expect(requestDelete(s.state, s.state.items[0]!.id, ctx).pending?.type).toBe('seriesScope');
  });
});

describe('tasks list', () => {
  it('done tasks sink to the bottom, then disappear the next day', () => {
    const ctx = makeCtx(WED_2PM);
    let st = seed(WED_2PM, { title: 'A' }, { title: 'B' }, { title: 'C' });
    st = applyOps(st, toggleTask(st, 'seed1', ctx).ops);
    expect(visibleTasks(st.items, WED_2PM).map((t) => t.title)).toEqual(['B', 'C', 'A']);
    const tomorrow = at(2026, 10, 1, 8);
    expect(visibleTasks(st.items, tomorrow).map((t) => t.title)).toEqual(['B', 'C']);
    expect(visibleTasks(st.items, tomorrow, false).map((t) => t.title)).toEqual(['B', 'C', 'A']);
  });
});

describe('§7 day view layout', () => {
  const st = seed(WED_2PM,
    { title: 'Long block', date: today, start: '13:00', end: '16:30' },
    { title: 'Inside', date: today, start: '13:30', end: '14:00' },
    { title: 'After inside', date: today, start: '14:00', end: '15:00' },
    { title: 'Separate', date: today, start: '18:00', end: '19:00' },
    { title: 'Overnight', date: '2026-09-29', start: '23:00', end: '01:30' },
  );

  it('overlapping events get side-by-side columns; back-to-back reuse a column', () => {
    const laid = layoutDay(daySegments(st.items, today));
    const by = (t: string) => laid.find((p) => p.item.title === t)!;
    expect(by('Long block')).toMatchObject({ col: 0, totalCols: 2 });
    expect(by('Inside')).toMatchObject({ col: 1, totalCols: 2 });
    expect(by('After inside')).toMatchObject({ col: 1, totalCols: 2 });
    expect(by('Separate')).toMatchObject({ col: 0, totalCols: 1 });
  });

  it('overnight events are split at midnight with continuation flags', () => {
    const prev = daySegments(st.items, '2026-09-29').find((s) => s.item.title === 'Overnight')!;
    expect(prev).toMatchObject({ startMin: 23 * 60, endMin: 1440, continuesToNext: true, continuesFromPrev: false });
    const next = daySegments(st.items, today).find((s) => s.item.title === 'Overnight')!;
    expect(next).toMatchObject({ startMin: 0, endMin: 90, continuesFromPrev: true, continuesToNext: false });
  });

  it('covers the full 24 hours (regression: early events were invisible)', () => {
    const s2 = seed(WED_2PM, { title: 'Early', date: today, start: '00:15', end: '00:45' });
    expect(daySegments(s2.items, today)[0]).toMatchObject({ startMin: 15, endMin: 45 });
  });

  it('month grid starts on Sunday and flags days with items', () => {
    const g = monthGrid(st.items, today);
    expect(g).toHaveLength(42);
    expect(g[0]!.date).toBe('2026-08-30'); // Sunday
    expect(g.find((c) => c.date === today)!.hasItems).toBe(true);
  });
});

describe('notifications', () => {
  it('events alert at each chosen lead time', () => {
    const [it] = seed(WED_2PM, { title: 'X', date: today, start: '15:00', end: '15:30' }).items;
    const times = notificationTimes(it!, { defaultDuration: 30, eventAlerts: [15, 60, 30] });
    expect(times.map((t) => t.getHours() * 60 + t.getMinutes())).toEqual([14 * 60, 14 * 60 + 30, 14 * 60 + 45]);
  });
});

describe('AI fallback', () => {
  const text = 'call mom every other tuesday';
  const empty: EngineState = { items: [], series: [], pending: null };

  it('offline => rules only', async () => {
    let called = false;
    const r = await handleInputWithFallback(empty, text, makeCtx(WED_2PM), { online: false, fetchIntent: async () => { called = true; return {}; } });
    expect(called).toBe(false);
    expect(r.source).toBe('rules');
  });

  it('online + confident rules => no AI call', async () => {
    let called = false;
    const r = await handleInputWithFallback(empty, 'lunch at noon', makeCtx(WED_2PM), { online: true, fetchIntent: async () => { called = true; return {}; } });
    expect(called).toBe(false);
    expect(r.source).toBe('rules');
  });

  it('online + unsure => AI intent applied through the same engine rules', async () => {
    const r = await handleInputWithFallback(empty, text, makeCtx(WED_2PM), {
      online: true,
      fetchIntent: async () => ({ type: 'create', draft: { title: 'Call mom', date: '2026-10-06', start: { h: 6, m: 0, meridiem: null }, end: null, durationMin: null, window: null, recurrence: null, hint: null } }),
    });
    expect(r.source).toBe('ai');
    const it = (r.ops[0] as { item: import('../src').Item }).item;
    expect(it).toMatchObject({ title: 'Call mom', date: '2026-10-06', start: '18:00' }); // future-day 1–6 => pm rule
  });

  it('timeout, error or invalid output => rules result, never stuck', async () => {
    const slow = await handleInputWithFallback(empty, text, makeCtx(WED_2PM), {
      online: true, timeoutMs: 20, fetchIntent: () => new Promise((r) => setTimeout(() => r({}), 500)),
    });
    expect(slow.source).toBe('rules');
    const bad = await handleInputWithFallback(empty, text, makeCtx(WED_2PM), { online: true, fetchIntent: async () => ({ type: 'create', draft: { title: 'x', date: 'tomorrow' } }) });
    expect(bad.source).toBe('rules');
    const err = await handleInputWithFallback(empty, text, makeCtx(WED_2PM), { online: true, fetchIntent: async () => { throw new Error('500'); } });
    expect(err.source).toBe('rules');
  });

  it('validateIntent rejects malformed shapes', () => {
    expect(validateIntent(null)).toBeNull();
    expect(validateIntent({ type: 'drop_tables' })).toBeNull();
    expect(validateIntent({ type: 'move', query: 'x', dest: { shiftMin: 99999 } })).toBeNull();
    expect(validateIntent({ type: 'cancel', query: 'gym', onDate: null })).toEqual({ type: 'cancel', query: 'gym', onDate: null });
  });
});

describe('plans: free vs pro', () => {
  const now = at(2026, 9, 30, 10);

  it('free has no time limit, no sync, and 100 AI parses a month', () => {
    const e = freeEntitlement(now);
    const muchLater = at(2028, 1, 1);
    expect(effectivePlan(e, muchLater)).toBe('free');
    expect(hasFeature(e, now, 'calendarSync')).toBe(false);
    expect(aiQuota(e, now)).toEqual({ limit: 100, used: 0, remaining: 100, resetsOn: '2026-10-01' });
  });

  it('the AI allowance runs out at 100 and resets next month', () => {
    let e = freeEntitlement(now);
    for (let i = 0; i < FREE_AI_PARSES_PER_MONTH; i++) e = recordAIUse(e, now);
    expect(canUseAI(e, now)).toBe(false);
    expect(aiQuota(e, now).remaining).toBe(0);
    const nextMonth = at(2026, 10, 1, 0, 1);
    expect(canUseAI(e, nextMonth)).toBe(true);
    expect(recordAIUse(e, nextMonth).aiUsage).toEqual({ period: '2026-10', count: 1 });
  });

  it('pro unlocks sync and unlimited AI until it lapses', () => {
    let e: Entitlement = { ...freeEntitlement(now), proUntil: at(2026, 10, 30).toISOString() };
    for (let i = 0; i < 500; i++) e = recordAIUse(e, now);
    expect(effectivePlan(e, now)).toBe('pro');
    expect(hasFeature(e, now, 'calendarSync')).toBe(true);
    expect(canUseAI(e, now)).toBe(true);
    expect(aiQuota(e, now).limit).toBeNull();
    expect(effectivePlan(e, at(2026, 10, 31))).toBe('free');
  });

  it('out of AI parses => rules result instantly, no call, flagged for an upgrade hint', async () => {
    let called = false;
    const r = await handleInputWithFallback({ items: [], series: [], pending: null }, 'call mom every other tuesday', makeCtx(WED_2PM), {
      online: true, aiAllowed: false, fetchIntent: async () => { called = true; return {}; },
    });
    expect(called).toBe(false);
    expect(r).toMatchObject({ source: 'rules', aiSkipped: 'quota' });
    expect(r.ops.length).toBeGreaterThan(0);
  });
});
