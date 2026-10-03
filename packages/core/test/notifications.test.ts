import { describe, expect, it } from 'vitest';
import { planNotifications } from '../src';
import { at, seed, WED_2PM } from './helpers';

const settings = { defaultDuration: 30 as const, eventAlerts: [15, 60] };

describe('notification plan', () => {
  const st = seed(WED_2PM,
    { title: 'Call Mara', date: '2026-09-30', start: '15:30', end: '16:00' },
    { title: 'Past thing', date: '2026-09-30', start: '14:10', end: '15:00' },
    { title: 'Dentist', date: '2026-10-02' },
    { title: 'Far away', date: '2026-12-25' },
    { title: 'Essay' },
  );

  it('schedules each chosen lead time for events, soonest first, never in the past', () => {
    const plan = planNotifications(st.items, settings, WED_2PM);
    const mara = plan.filter((p) => p.title === 'Call Mara');
    expect(mara.map((p) => [p.at.getHours() * 60 + p.at.getMinutes(), p.body])).toEqual([
      [14 * 60 + 30, 'In 1 hour · 3:30pm–4pm'],
      [15 * 60 + 15, 'In 15 min · 3:30pm–4pm'],
    ]);
    // 14:10 event: the 1-hour alert is past, the 15-min alert (13:55) is past too.
    expect(plan.some((p) => p.title === 'Past thing')).toBe(false);
  });

  it('reminders fire at their reminder time (6am on the day)', () => {
    const d = planNotifications(st.items, settings, WED_2PM).find((p) => p.title === 'Dentist')!;
    expect(d.at.getTime()).toBe(at(2026, 10, 2, 6).getTime());
  });

  it('skips tasks and anything beyond the horizon, and respects the cap', () => {
    const plan = planNotifications(st.items, settings, WED_2PM);
    expect(plan.some((p) => p.title === 'Essay' || p.title === 'Far away')).toBe(false);
    expect(planNotifications(st.items, settings, WED_2PM, { limit: 1 })).toHaveLength(1);
  });

  it('no alerts chosen => only reminders', () => {
    const plan = planNotifications(st.items, { ...settings, eventAlerts: [] }, WED_2PM);
    expect(plan.map((p) => p.title)).toEqual(['Dentist']);
  });
});
