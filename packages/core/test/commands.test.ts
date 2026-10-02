// APP_SPEC §4.10–§4.14 plus multi-turn follow-ups.
import { describe, expect, it } from 'vitest';
import { kindOf, refreshSeries } from '../src';
import { at, makeCtx, seed, Session, WED_2PM } from './helpers';

const today = '2026-09-30';
const withSeed = (now = WED_2PM) =>
  new Session(makeCtx(now), seed(now,
    { title: 'Design review', date: today, start: '09:00', end: '10:00' },
    { title: 'Call with Mara', date: today, start: '15:30', end: '16:00' },
    { title: 'Dinner, no laptop', date: today, start: '19:00', end: '20:30' },
    { title: 'Essay for English' },
  ));

describe('§4.10 recurring', () => {
  it('creates a series with shared seriesId on the right weekdays', () => {
    const s = new Session(makeCtx(WED_2PM));
    const out = s.say('gym every monday and wednesday at 6am');
    const occ = s.created();
    expect(occ.length).toBeGreaterThanOrEqual(15);
    expect(new Set(occ.map((o) => o.seriesId)).size).toBe(1);
    expect(occ.every((o) => o.start === '06:00' && o.end === '06:30' && o.title === 'Gym')).toBe(true);
    expect(new Set(occ.map((o) => new Date(o.date + 'T12:00').getDay()))).toEqual(new Set([1, 3]));
    expect(occ.some((o) => o.date === today)).toBe(false); // 6am today already passed
    expect(out.message).toContain('every Mon & Wed at 6am');
  });

  it('supports any weekday combination', () => {
    const cases: [string, number[]][] = [
      ['yoga every mon, wed and fri at 7am', [1, 3, 5]],
      ['swim tuesdays and thursdays at 6pm', [2, 4]],
      ['standup weekdays at 9:30am', [1, 2, 3, 4, 5]],
      ['brunch every weekend at 11am', [0, 6]],
      ['meds every day at 8am', [0, 1, 2, 3, 4, 5, 6]],
      ['class every tue/thu at 6pm', [2, 4]],
      ['run every mon wed sat at 7am', [1, 3, 6]],
    ];
    for (const [text, days] of cases) {
      const s = new Session(makeCtx(WED_2PM));
      s.say(text);
      expect(s.state.series[0]?.days, text).toEqual(days);
    }
  });

  it('recurring without a time => repeating all-day reminders', () => {
    const s = new Session(makeCtx(WED_2PM));
    s.say('trash out every tuesday');
    expect(s.created().every((o) => kindOf(o) === 'reminder')).toBe(true);
  });

  it('"cancel gym" collapses the series into one One/All prompt (regression: showed 4 Mondays)', () => {
    const s = new Session(makeCtx(WED_2PM));
    s.say('gym every monday and wednesday at 6am');
    const out = s.say('cancel gym');
    expect(out.pending?.type).toBe('seriesScope');
    expect(out.choices.map((c) => c.label)).toEqual(['Just this one', 'All occurrences']);
  });

  it('"one" deletes just the soonest occurrence and it is not regenerated', () => {
    const s = new Session(makeCtx(WED_2PM));
    s.say('gym every monday and wednesday at 6am');
    const before = s.find(/Gym/).length;
    s.say('cancel gym');
    s.say('just this one');
    expect(s.find(/Gym/).length).toBe(before - 1);
    expect(s.find(/Gym/).some((g) => g.date === '2026-10-05')).toBe(false);
    expect(refreshSeries(s.state, s.ctx).length).toBe(0);
  });

  it('"all" deletes every upcoming occurrence and ends the rule', () => {
    const s = new Session(makeCtx(WED_2PM));
    s.say('gym every monday and wednesday at 6am');
    s.say('cancel gym');
    const out = s.say('all');
    expect(s.find(/Gym/).length).toBe(0);
    expect(out.message).toMatch(/Cancelled all \d+ upcoming occurrences/);
    expect(refreshSeries(s.state, s.ctx).length).toBe(0);
  });

  it('naming a date targets that occurrence directly, no prompt', () => {
    const s = new Session(makeCtx(WED_2PM));
    s.say('gym every monday and wednesday at 6am');
    const out = s.say('cancel gym next wednesday');
    expect(out.pending).toBeNull();
    expect(s.find(/Gym/).some((g) => g.date === '2026-10-07')).toBe(false);
    expect(s.find(/Gym/).some((g) => g.date === '2026-10-05')).toBe(true);
  });

  it('occurrence ids are deterministic so two synced devices generate the same records', () => {
    const s = new Session(makeCtx(WED_2PM));
    s.say('gym every monday at 6am');
    const series = s.state.series[0]!;
    expect(s.state.items.every((i) => i.id === `${series.id}:${i.occurrenceDate}`)).toBe(true);
    const otherDevice = { ...s.state, items: [] };
    const ops = refreshSeries(otherDevice, makeCtx(WED_2PM));
    expect(ops.map((o) => (o.op === 'putItem' ? o.item.id : '')).sort()).toEqual(s.state.items.map((i) => i.id).sort());
  });

  it('refreshSeries extends the rolling window without duplicates', () => {
    const s = new Session(makeCtx(WED_2PM));
    s.say('gym every monday at 6am');
    expect(refreshSeries(s.state, s.ctx).length).toBe(0);
    const later = makeCtx(at(2026, 10, 30, 9));
    const ops = refreshSeries(s.state, later);
    expect(ops.length).toBeGreaterThan(0);
    const dates = ops.map((o) => (o.op === 'putItem' ? o.item.date : null));
    expect(new Set(dates).size).toBe(dates.length);
  });
});

describe('§4.11 move', () => {
  it('relative shift: up one hour', () => {
    const s = withSeed();
    s.say('move call up one hour');
    expect(s.one()).toMatchObject({ title: 'Call with Mara', start: '14:30', end: '15:00' });
  });

  it('relative shift: push back 30 min / half an hour later', () => {
    const s = withSeed();
    s.say('push call back 30 min');
    expect(s.one()).toMatchObject({ start: '16:00', end: '16:30' });
    s.say('move call later by half an hour');
    expect(s.one()).toMatchObject({ start: '16:30', end: '17:00' });
  });

  it('new day keeps the time', () => {
    const s = withSeed();
    s.say('move dinner to friday');
    expect(s.one()).toMatchObject({ date: '2026-10-02', start: '19:00', end: '20:30' });
  });

  it('new time same day keeps the duration', () => {
    const s = withSeed();
    s.say('move dinner to 8');
    expect(s.one()).toMatchObject({ date: today, start: '20:00', end: '21:30' });
  });

  it('new day and time together', () => {
    const s = withSeed();
    s.say('move dinner to friday at 8pm');
    expect(s.one()).toMatchObject({ date: '2026-10-02', start: '20:00' });
  });

  it('giving a reminder a time turns it into an event', () => {
    const s = new Session(makeCtx(WED_2PM));
    s.say('dentist friday');
    s.say('move dentist to 3pm');
    expect(s.one()).toMatchObject({ date: '2026-10-02', start: '15:00', end: '15:30', color: 'blue', reminderAt: null });
  });

  it('tasks can be moved onto the calendar', () => {
    const s = withSeed();
    s.say('move essay to friday');
    expect(s.one()).toMatchObject({ title: 'Essay for English', date: '2026-10-02', color: 'orange' });
  });

  it('ambiguous matches list kind, day and time so they can be told apart', () => {
    const s = new Session(makeCtx(WED_2PM));
    s.say('lunch with sam friday at noon');
    s.say('lunch with ana thursday');
    const out = s.say('move lunch to 1pm');
    expect(out.choices.map((c) => c.label)).toEqual([
      'Lunch with ana — Thu 10/1, all-day (no set time)',
      'Lunch with sam — Fri 10/2, 12pm–12:30pm',
    ]);
    s.say('the friday one');
    expect(s.one()).toMatchObject({ title: 'Lunch with sam', start: '13:00' });
  });

  it('picks by number too', () => {
    const s = new Session(makeCtx(WED_2PM));
    s.say('lunch with sam friday at noon');
    s.say('lunch with ana thursday');
    s.say('move lunch to 1pm');
    s.say('2');
    expect(s.one().title).toBe('Lunch with sam');
  });

  it('no destination => asks, and the next message answers it (multi-turn)', () => {
    const s = withSeed();
    const out = s.say('move dinner');
    expect(out.message).toContain('to when?');
    expect(out.pending?.type).toBe('moveWhen');
    s.say('8pm');
    expect(s.one()).toMatchObject({ title: 'Dinner, no laptop', start: '20:00' });
  });

  it('an unrelated message after a question is a new command', () => {
    const s = withSeed();
    s.say('move dinner');
    s.say('buy milk');
    expect(s.one()).toMatchObject({ title: 'Buy milk', date: null });
  });

  it('no match: offers to create; creates immediately if a day/time was given', () => {
    const s = new Session(makeCtx(WED_2PM));
    const out = s.say('move yoga to friday at 5pm');
    expect(out.choices.map((c) => c.label)).toEqual(['Create it', 'Never mind']);
    s.say('create it');
    expect(s.one()).toMatchObject({ title: 'Yoga', date: '2026-10-02', start: '17:00' });
  });

  it('no match and no day/time: asks when instead of making a bare task', () => {
    const s = new Session(makeCtx(WED_2PM));
    s.say('move yoga');
    const out = s.say('yes');
    expect(out.message).toContain('When should "Yoga" happen?');
    expect(out.ops).toEqual([]);
    s.say('saturday at 9am');
    expect(s.one()).toMatchObject({ title: 'Yoga', date: '2026-10-03', start: '09:00' });
  });

  it('a loose verb with no match is just a new item ("take out the trash")', () => {
    const s = new Session(makeCtx(WED_2PM));
    const out = s.say('take out the trash tomorrow');
    expect(out.choices).toEqual([]);
    expect(s.one()).toMatchObject({ title: 'Take out the trash', date: '2026-10-01' });
  });

  it('can\'t shift something without a time', () => {
    const s = withSeed();
    const out = s.say('move essay up one hour');
    expect(out.message).toContain("doesn't have a set time");
  });
});

describe('§4.12 cancel', () => {
  it('cancels a single match', () => {
    const s = withSeed();
    s.say('cancel the design review');
    expect(s.find(/Design review/)).toHaveLength(0);
  });

  it('cancels tasks too', () => {
    const s = withSeed();
    s.say('delete essay');
    expect(s.find(/Essay/)).toHaveLength(0);
  });

  it('no match says so plainly', () => {
    const s = withSeed();
    const out = s.say('cancel yoga');
    expect(out.message).toBe("Couldn't find anything upcoming that matches that to cancel.");
    expect(out.choices).toEqual([]);
  });

  it('"call to cancel gym membership tomorrow" is a reminder, not a cancel', () => {
    const s = withSeed();
    s.say('call to cancel gym membership tomorrow');
    expect(s.one()).toMatchObject({ title: 'Call to cancel gym membership', date: '2026-10-01' });
  });
});

describe('§4.13 dismissal', () => {
  it.each(['cancel', 'never mind', 'nvm', 'no', 'forget it', 'Nope.'])('"%s" clears the prompt silently', (word) => {
    const s = withSeed();
    s.say('move dinner');
    const out = s.say(word);
    expect(out).toMatchObject({ message: '', pending: null, ops: [], choices: [] });
  });
});

describe('§4.14 conflicts', () => {
  it('notes overlaps with existing items', () => {
    const s = withSeed();
    const out = s.say('standup tomorrow at 9:30am');
    expect(out.message).not.toContain('Heads up');
    const out2 = s.say('coffee chat today at 3:45pm');
    expect(out2.message).toContain('Heads up — overlaps with "Call with Mara" (3:30pm–4pm)');
  });

  it('never conflicts with itself (regression)', () => {
    const s = new Session(makeCtx(WED_2PM));
    const out = s.say('solo thing at 5pm');
    expect(out.message).not.toContain('Heads up');
  });

  it('partial overlaps count (1–4:30pm vs 1:30–2pm)', () => {
    const s = new Session(makeCtx(at(2026, 9, 30, 9)));
    s.say('offsite 1-4:30pm');
    const out = s.say('quick sync 1:30-2pm');
    expect(out.message).toContain('overlaps with "Offsite"');
  });

  it('moving into a busy slot notes the overlap', () => {
    const s = withSeed();
    const out = s.say('move dinner to 3:30pm');
    expect(out.message).toContain('overlaps with "Call with Mara"');
  });
});

describe('completing tasks by text', () => {
  it('"done with essay" marks it done', () => {
    const s = withSeed();
    s.say('done with essay');
    expect(s.one()).toMatchObject({ title: 'Essay for English', done: true });
    expect(s.say('mark essay as done').message).toBe("Couldn't find an open task that matches that.");
  });
});
