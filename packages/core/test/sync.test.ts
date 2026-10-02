import { describe, expect, it } from 'vitest';
import { collectPush, markAllDirty, markChanges, markPushed, mergeRemote, newItem, hasDirty, type SyncMeta } from '../src';
import { WED_2PM } from './helpers';

const mk = (id: string, title: string) => newItem({ id, title }, WED_2PM);
const T1 = '2026-10-02T10:00:00.000Z', T2 = '2026-10-02T11:00:00.000Z', T3 = '2026-10-02T12:00:00.000Z';

describe('offline-first sync', () => {
  it('local creates, edits and deletes become dirty, and push clears them', () => {
    const a = mk('a', 'A'), b = mk('b', 'B');
    const prev = { items: [a, b], series: [] };
    const a2 = { ...a, title: 'A2' };
    const next = { items: [a2, mk('c', 'C')], series: [] };
    const meta = markChanges(prev, next, {}, T1);
    expect(Object.keys(meta).sort()).toEqual(['item:a', 'item:b', 'item:c']);
    expect(meta['item:b']).toMatchObject({ deleted: true, dirty: true });
    const batch = collectPush(next, meta);
    expect(batch.items.find((r) => r.id === 'b')).toMatchObject({ data: null, deleted: true });
    expect(batch.items.find((r) => r.id === 'a')!.data).toBe(a2);
    expect(hasDirty(markPushed(meta, batch))).toBe(false);
  });

  it('an edit made while a push was in flight stays dirty', () => {
    const a = mk('a', 'A');
    const meta: SyncMeta = { 'item:a': { updatedAt: T1, dirty: true, deleted: false } };
    const batch = collectPush({ items: [a], series: [] }, meta);
    const edited: SyncMeta = { 'item:a': { updatedAt: T2, dirty: true, deleted: false } };
    expect(markPushed(edited, batch)['item:a']!.dirty).toBe(true);
  });

  it('remote changes apply; newer unpushed local edits win; deletes remove', () => {
    const a = mk('a', 'Local A'), b = mk('b', 'B');
    const meta: SyncMeta = {
      'item:a': { updatedAt: T3, dirty: true, deleted: false },
      'item:b': { updatedAt: T1, dirty: false, deleted: false },
    };
    const r = mergeRemote({ items: [a, b], series: [] }, meta, [
      { kind: 'item', row: { id: 'a', data: { ...a, title: 'Remote A' }, updated_at: T2, deleted: false } },
      { kind: 'item', row: { id: 'b', data: null, updated_at: T2, deleted: true } },
      { kind: 'item', row: { id: 'c', data: mk('c', 'From phone'), updated_at: T2, deleted: false } },
    ]);
    expect(r.data.items.map((i) => i.title).sort()).toEqual(['From phone', 'Local A']);
    expect(r.meta['item:b']).toMatchObject({ deleted: true, dirty: false });
    expect(r.meta['item:a']!.dirty).toBe(true);
  });

  it('a clean local record takes the server version', () => {
    const a = mk('a', 'A');
    const meta: SyncMeta = { 'item:a': { updatedAt: T3, dirty: false, deleted: false } };
    const r = mergeRemote({ items: [a], series: [] }, meta, [
      { kind: 'item', row: { id: 'a', data: { ...a, title: 'Server says' }, updated_at: T2, deleted: false } },
    ]);
    // Clean local = server is authoritative for what it sent.
    expect(r.data.items[0]!.title).toBe('Server says');
  });

  it('first sync for an account uploads everything (incl. pending deletes)', () => {
    const meta = markAllDirty({ items: [mk('a', 'A')], series: [] }, { 'item:z': { updatedAt: T1, dirty: false, deleted: true } }, T2);
    expect(meta['item:a']).toMatchObject({ dirty: true, deleted: false });
    expect(meta['item:z']).toMatchObject({ dirty: true, deleted: true });
  });
});
