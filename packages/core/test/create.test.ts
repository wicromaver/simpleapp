// APP_SPEC §4.1–§4.9: creating items from text.
import { describe, expect, it } from 'vitest';
import { kindOf } from '../src';
import { at, makeCtx, Session, WED_2PM } from './helpers';

const session = (now = WED_2PM, settings = {}) => new Session(makeCtx(now, settings));

describe('§4.1 explicit date + time', () => {
  it('"lunch with sam at noon" -> event at noon', () => {
    const s = session(at(2026, 9, 30, 9));
    s.say('lunch with sam at noon');
    expect(s.one()).toMatchObject({ title: 'Lunch with sam', date: '2026-09-30', start: '12:00', end: '12:30', color: 'blue' });
  });

  it('"call with mara at 2pm"', () => {
    const s = session(at(2026, 9, 30, 9));
    s.say('call with mara at 2pm');
    expect(s.one()).toMatchObject({ title: 'Call with mara', start: '14:00', end: '14:30' });
  });

  it('"meeting 3-4pm" spans the exact range', () => {
    const s = session(at(2026, 9, 30, 9));
    s.say('meeting 3-4pm');
    expect(s.one()).toMatchObject({ title: 'Meeting', start: '15:00', end: '16:00' });
  });

  it('"11-1pm" borrows meridiem sensibly (11am-1pm)', () => {
    const s = session(at(2026, 9, 30, 9));
    s.say('workshop friday 11-1pm');
    expect(s.one()).toMatchObject({ date: '2026-10-02', start: '11:00', end: '13:00' });
  });

  it('uses the settings default duration', () => {
    const s = session(at(2026, 9, 30, 9), { defaultDuration: 60 });
    s.say('sync at 3pm');
    expect(s.one()).toMatchObject({ start: '15:00', end: '16:00' });
  });

  it('explicit duration overrides the default', () => {
    const s = session(at(2026, 9, 30, 9), { defaultDuration: 60 });
    s.say('sync at 3pm for 30 min');
    expect(s.one()).toMatchObject({ title: 'Sync', start: '15:00', end: '15:30' });
    s.say('review friday at 10am for 1 hour');
    expect(s.one()).toMatchObject({ title: 'Review', date: '2026-10-02', start: '10:00', end: '11:00' });
    s.say('focus block tomorrow at 9am for an hour and a half');
    expect(s.one()).toMatchObject({ start: '09:00', end: '10:30' });
  });

  it('keeps prepositions that belong to the title', () => {
    const s = session();
    s.say('Essay for English');
    expect(s.one().title).toBe('Essay for English');
  });
});

describe('§4.2 time given, no day', () => {
  it('rolls an explicit past time to tomorrow (regression: am/pm skipped the check)', () => {
    const s = session(); // Wed 2pm
    s.say('call at 1pm');
    expect(s.one()).toMatchObject({ date: '2026-10-01', start: '13:00' });
  });

  it('rolls an ambiguous past time to tomorrow', () => {
    const s = session();
    s.say('call at 2');
    expect(s.one()).toMatchObject({ date: '2026-10-01', start: '14:00' });
  });

  it('does not roll over when the user explicitly said today', () => {
    const s = session();
    s.say('call today at 1pm');
    expect(s.one()).toMatchObject({ date: '2026-09-30', start: '13:00' });
  });
});

describe('§4.3 ambiguous bare hour', () => {
  it('dinner hint => pm', () => {
    const s = session(at(2026, 9, 30, 9));
    s.say('dinner with sam at 7');
    expect(s.one()).toMatchObject({ date: '2026-09-30', start: '19:00' });
  });

  it('breakfast hint wins, and a passed hinted time rolls to tomorrow instead of flipping to pm', () => {
    const s = session(); // 2pm
    s.say('breakfast with ana at 9');
    expect(s.one()).toMatchObject({ date: '2026-10-01', start: '09:00' });
  });

  it('"lunch at 11" is 11am, not 11pm', () => {
    const s = session(at(2026, 9, 30, 8));
    s.say('lunch at 11');
    expect(s.one()).toMatchObject({ start: '11:00' });
  });

  it('"lunch at 1" is 1pm', () => {
    const s = session(at(2026, 9, 30, 8));
    s.say('lunch at 1');
    expect(s.one()).toMatchObject({ start: '13:00' });
  });

  it('today, no hint: picks the meridiem that is still ahead', () => {
    const s = session(at(2026, 9, 30, 10));
    s.say('call at 9');
    expect(s.one()).toMatchObject({ date: '2026-09-30', start: '21:00' });
  });

  it('today, no hint: both ahead => the sooner one', () => {
    const s = session(at(2026, 9, 30, 7));
    s.say('call at 9');
    expect(s.one()).toMatchObject({ date: '2026-09-30', start: '09:00' });
  });

  it('future day: 1–6 => pm, otherwise am, 12 => noon', () => {
    const s = session();
    s.say('call friday at 3');
    expect(s.one()).toMatchObject({ date: '2026-10-02', start: '15:00' });
    s.say('call friday at 9');
    expect(s.one()).toMatchObject({ start: '09:00' });
    s.say('call friday at 12');
    expect(s.one()).toMatchObject({ start: '12:00' });
  });

  it('"tonight at 8" => 8pm today', () => {
    const s = session();
    s.say('movie tonight at 8');
    expect(s.one()).toMatchObject({ title: 'Movie', date: '2026-09-30', start: '20:00' });
  });
});

describe('§4.4 day, no time => reminder', () => {
  it('future date notifies at 6am', () => {
    const s = session();
    const out = s.say('dentist friday');
    const it = s.one();
    expect(kindOf(it)).toBe('reminder');
    expect(it).toMatchObject({ title: 'Dentist', date: '2026-10-02', start: null, color: 'orange' });
    expect(new Date(it.reminderAt!).getTime()).toBe(at(2026, 10, 2, 6).getTime());
    expect(out.message).toContain('reminder at 6am');
  });

  it('today after 6am => 90 minutes after creation, shown as a clock time', () => {
    const s = session();
    const out = s.say('pay rent today');
    expect(new Date(s.one().reminderAt!).getTime()).toBe(at(2026, 9, 30, 15, 30).getTime());
    expect(out.message).toContain('3:30pm');
  });

  it('today before 6am => 6am', () => {
    const s = session(at(2026, 9, 30, 5));
    s.say('pay rent today');
    expect(new Date(s.one().reminderAt!).getTime()).toBe(at(2026, 9, 30, 6).getTime());
  });
});

describe('§4.5 bare mealtime', () => {
  it('"dinner with sam" => event today at 6pm', () => {
    const s = session();
    s.say('dinner with sam');
    expect(s.one()).toMatchObject({ date: '2026-09-30', start: '18:00', title: 'Dinner with sam' });
  });

  it('rolls to tomorrow when the meal time has passed', () => {
    const s = session(at(2026, 9, 30, 19));
    s.say('dinner with sam');
    expect(s.one()).toMatchObject({ date: '2026-10-01', start: '18:00' });
    s.say('breakfast with ana');
    expect(s.one()).toMatchObject({ date: '2026-10-01', start: '08:00' });
  });
});

describe('§4.6 nothing temporal => task', () => {
  it('creates a task', () => {
    const s = session();
    const out = s.say('buy new running shoes');
    expect(s.one()).toMatchObject({ date: null, start: null, color: 'tan', done: false });
    expect(out.jump).toEqual({ tab: 'tasks', date: null });
  });
});

describe('§4.7 vague deadlines => least-booked day', () => {
  it('"sometime next week" searches Mon–Thu of next week only (regression: searched from today)', () => {
    const s = session(); // Wed 9/30; next week Mon 10/5 .. Thu 10/8
    s.say('busy thing 10/5 at 9am for 3 hours');
    s.say('busy thing 10/6 at 9am for 2 hours');
    s.say('write report sometime next week');
    expect(s.one()).toMatchObject({ title: 'Write report', date: '2026-10-07', start: '09:00' });
  });

  it('uses meal hints for the default start', () => {
    const s = session();
    s.say('dinner with the team sometime next week');
    expect(s.one()).toMatchObject({ start: '18:00' });
  });

  it('"before friday" searches today through Thursday', () => {
    const s = session();
    s.say('blocker today at 3pm for 4 hours');
    s.say('submit form before friday');
    expect(s.one()).toMatchObject({ date: '2026-10-01' });
  });

  it('"before friday" on a Friday means next Friday', () => {
    const s = session(at(2026, 10, 2, 9)); // Friday
    s.say('a 10/2 at 10am for 2 hours');
    s.say('b 10/3 at 10am for 2 hours');
    s.say('c 10/4 at 10am for 2 hours');
    s.say('submit form before friday');
    expect(s.one().date).toBe('2026-10-05');
  });

  it('"before sunday" on a Sunday means next Sunday (window through Saturday)', () => {
    const s = session(at(2026, 10, 4, 9)); // Sunday
    for (const d of ['10/4', '10/5', '10/6', '10/7', '10/8', '10/9']) s.say(`x ${d} at 10am for 2 hours`);
    s.say('clean garage before sunday');
    expect(s.one().date).toBe('2026-10-10');
  });

  it('"next week" said on a Sunday starts 8 days out', () => {
    const s = session(at(2026, 10, 4, 9)); // Sunday
    s.say('plan trip sometime next week');
    expect(s.one().date).toBe('2026-10-12');
  });
});

describe('regressions found while probing', () => {
  it('recurring times are not resolved against "now" ("weekdays at 9:30" is 9:30am)', () => {
    const s = session();
    s.say('standup weekdays at 9:30');
    expect(s.state.series[0]).toMatchObject({ start: '09:30', end: '10:00' });
  });

  it('a window never schedules into a slot that already passed today', () => {
    const s = session(); // Wed 2pm, default start 9am
    s.say('book flights sometime this week');
    expect(s.one().date).toBe('2026-10-01');
  });
});

describe('unmarked hour ranges', () => {
  it('"design review 11-12" is 11am–12pm', () => {
    const s = session(at(2026, 9, 30, 9));
    s.say('design review 11-12');
    expect(s.one()).toMatchObject({ title: 'Design review', start: '11:00', end: '12:00' });
  });

  it('"study 9-11" picks a sensible meridiem and an end after the start', () => {
    const s = session(at(2026, 9, 30, 8));
    s.say('study 9-11');
    expect(s.one()).toMatchObject({ start: '09:00', end: '11:00' });
  });

  it('counts are not times ("read chapters 3-4", "do problems 1-5")', () => {
    const s = session();
    s.say('read chapters 3-4');
    expect(s.one()).toMatchObject({ title: 'Read chapters 3-4', date: null });
    s.say('do problems 1-5 friday');
    expect(s.one()).toMatchObject({ title: 'Do problems 1-5', date: '2026-10-02', start: null });
  });
});

describe('§4.8 N weekdays from now / in N weeks', () => {
  it('"two mondays from now" is the Monday after next', () => {
    const s = session();
    s.say('gym two mondays from now');
    expect(s.one()).toMatchObject({ title: 'Gym', date: '2026-10-12', start: null });
  });

  it('"one monday from now" is the very next Monday', () => {
    const s = session();
    s.say('gym 1 monday from now');
    expect(s.one().date).toBe('2026-10-05');
  });

  it('"in two weeks" is exactly 14 days out', () => {
    const s = session();
    s.say('dinner with sam in two weeks');
    expect(s.one()).toMatchObject({ title: 'Dinner with sam', date: '2026-10-14' });
  });
});

describe('§4.9 numeric and named dates', () => {
  it('M/D in the past rolls to next year', () => {
    const s = session();
    s.say('renew passport 8/10');
    expect(s.one().date).toBe('2027-08-10');
  });

  it('M/D upcoming stays this year, M/D/YYYY is literal', () => {
    const s = session();
    s.say('dentist 10/15 at 3pm');
    expect(s.one()).toMatchObject({ title: 'Dentist', date: '2026-10-15', start: '15:00' });
    s.say('wedding 8/10/2027');
    expect(s.one().date).toBe('2027-08-10');
  });

  it('month names', () => {
    const s = session();
    s.say('flight oct 12 at 7am');
    expect(s.one()).toMatchObject({ title: 'Flight', date: '2026-10-12', start: '07:00' });
    s.say('mom birthday 3rd of january');
    expect(s.one()).toMatchObject({ title: 'Mom birthday', date: '2027-01-03' });
  });
});

describe('overnight events', () => {
  it('"party 10pm-1am" ends the next day', () => {
    const s = session();
    s.say('party friday 10pm-1am');
    expect(s.one()).toMatchObject({ date: '2026-10-02', start: '22:00', end: '01:00', endDate: '2026-10-03' });
  });
});

describe('low-confidence detection for the AI fallback', () => {
  it('flags unplaced temporal words but still produces a result', () => {
    const s = session();
    const out = s.say('call mom every other tuesday');
    expect(out.needsFallback).toBe(true);
    expect(out.fallbackText).toBe('call mom every other tuesday');
    expect(out.ops.length).toBeGreaterThan(0);
  });

  it('does not flag ordinary inputs', () => {
    const s = session();
    expect(s.say('lunch with sam at noon').needsFallback).toBe(false);
    expect(s.say('buy milk').needsFallback).toBe(false);
  });
});
