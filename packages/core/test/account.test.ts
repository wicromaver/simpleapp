import { describe, expect, it } from 'vitest';
import { claimPrompt, mergeAnonymousInto, newItem } from '../src';
import { WED_2PM } from './helpers';

const anon = { isAnonymous: true, email: null };
const claimed = { isAnonymous: false, email: 'a@b.co' };

describe('invisible account: when to ask for an email', () => {
  it('never asks someone who already added an email', () => {
    for (const m of ['emptyFirstLaunch', 'enableCalendarSync', 'upgradeToPro', 'settings'] as const) {
      expect(claimPrompt(m, claimed, { itemCount: 0, dismissed: [] })).toBeNull();
    }
  });

  it('empty first launch: a dismissible sign-in note, gone once used or dismissed', () => {
    expect(claimPrompt('emptyFirstLaunch', anon, { itemCount: 0, dismissed: [] })).toMatchObject({ style: 'inline', mode: 'signIn' });
    expect(claimPrompt('emptyFirstLaunch', anon, { itemCount: 1, dismissed: [] })).toBeNull();
    expect(claimPrompt('emptyFirstLaunch', anon, { itemCount: 0, dismissed: ['emptyFirstLaunch'] })).toBeNull();
  });

  it('sync and upgrade are gated on adding an email; dismissing elsewhere does not skip it', () => {
    expect(claimPrompt('enableCalendarSync', anon, { itemCount: 5, dismissed: ['emptyFirstLaunch'] })).toMatchObject({ style: 'gate', mode: 'claim' });
    expect(claimPrompt('upgradeToPro', anon, { itemCount: 5, dismissed: [] })).toMatchObject({ style: 'gate', mode: 'claim' });
  });

  it('settings always offers a passive "Add email" row', () => {
    expect(claimPrompt('settings', anon, { itemCount: 50, dismissed: ['emptyFirstLaunch'] })).toMatchObject({ style: 'row' });
  });
});

describe('signing an anonymous install into an existing account', () => {
  it('keeps both sides and drops exact duplicates', () => {
    const mk = (id: string, title: string, date: string | null = null) => newItem({ id, title, date }, WED_2PM);
    const account = { items: [mk('a1', 'Gym', '2026-10-05'), mk('a2', 'Essay')], series: [] };
    const local = { items: [mk('l1', 'gym ', '2026-10-05'), mk('l2', 'Dentist', '2026-10-09')], series: [] };
    const merged = mergeAnonymousInto(account, local);
    expect(merged.items.map((i) => i.id)).toEqual(['a1', 'a2', 'l2']);
  });
});
