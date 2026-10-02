// Offline-first sync bookkeeping (pure). The device is the source of truth for the UI;
// changes are recorded locally as "dirty" and pushed when online. Conflicts resolve per
// record with last-write-wins on the client's edit time.

import type { Item, Series } from './types';

export type RecordKind = 'item' | 'series';

export interface RecordMeta {
  /** When this record was last changed (ISO), locally or remotely. */
  updatedAt: string;
  /** Changed locally and not yet confirmed by the server. */
  dirty: boolean;
  deleted: boolean;
}

/** Keyed by `${kind}:${id}`. Tombstones of deleted records stay so deletes can sync. */
export type SyncMeta = Record<string, RecordMeta>;

export interface SyncData {
  items: Item[];
  series: Series[];
}

/** A row as stored on the server. */
export interface SyncRow {
  id: string;
  data: unknown;
  updated_at: string;
  deleted: boolean;
}

const key = (kind: RecordKind, id: string) => `${kind}:${id}`;

function byId<T extends { id: string }>(xs: T[]): Map<string, T> {
  return new Map(xs.map((x) => [x.id, x]));
}

/**
 * Compare two snapshots and mark what changed as dirty. Records are compared by object
 * identity (the engine always replaces an object when it changes it).
 */
export function markChanges(prev: SyncData, next: SyncData, meta: SyncMeta, nowIso: string): SyncMeta {
  const out = { ...meta };
  const scan = <T extends { id: string }>(kind: RecordKind, a: T[], b: T[]) => {
    const before = byId(a);
    const after = byId(b);
    for (const [id, obj] of after) {
      if (before.get(id) !== obj) out[key(kind, id)] = { updatedAt: nowIso, dirty: true, deleted: false };
    }
    for (const id of before.keys()) {
      if (!after.has(id)) out[key(kind, id)] = { updatedAt: nowIso, dirty: true, deleted: true };
    }
  };
  scan('item', prev.items, next.items);
  scan('series', prev.series, next.series);
  return out;
}

/** First sync for an account on this device: everything local should be uploaded. */
export function markAllDirty(data: SyncData, meta: SyncMeta, nowIso: string): SyncMeta {
  const out: SyncMeta = {};
  for (const [k, m] of Object.entries(meta)) if (m.deleted) out[k] = { ...m, dirty: true };
  for (const it of data.items) out[key('item', it.id)] = { updatedAt: meta[key('item', it.id)]?.updatedAt ?? nowIso, dirty: true, deleted: false };
  for (const s of data.series) out[key('series', s.id)] = { updatedAt: meta[key('series', s.id)]?.updatedAt ?? nowIso, dirty: true, deleted: false };
  return out;
}

export interface PushBatch {
  items: SyncRow[];
  series: SyncRow[];
}

export function collectPush(data: SyncData, meta: SyncMeta): PushBatch {
  const items = byId(data.items);
  const series = byId(data.series);
  const batch: PushBatch = { items: [], series: [] };
  for (const [k, m] of Object.entries(meta)) {
    if (!m.dirty) continue;
    const [kind, id] = k.split(/:(.*)/s) as [RecordKind, string];
    const obj = kind === 'item' ? items.get(id) : series.get(id);
    if (!m.deleted && !obj) continue; // vanished without a tombstone; nothing to send
    const row: SyncRow = { id, data: m.deleted ? null : obj, updated_at: m.updatedAt, deleted: m.deleted };
    (kind === 'item' ? batch.items : batch.series).push(row);
  }
  return batch;
}

/** After a successful push: clear dirty flags, unless the record changed again meanwhile. */
export function markPushed(meta: SyncMeta, batch: PushBatch): SyncMeta {
  const out = { ...meta };
  const clear = (kind: RecordKind, rows: SyncRow[]) => {
    for (const r of rows) {
      const m = out[key(kind, r.id)];
      if (m && m.updatedAt === r.updated_at) out[key(kind, r.id)] = { ...m, dirty: false };
    }
  };
  clear('item', batch.items);
  clear('series', batch.series);
  return out;
}

/**
 * Apply rows pulled from the server. A local edit that is newer and not yet pushed wins;
 * otherwise the server's version replaces the local one (or removes it if deleted).
 */
export function mergeRemote(
  data: SyncData,
  meta: SyncMeta,
  rows: { kind: RecordKind; row: SyncRow }[],
): { data: SyncData; meta: SyncMeta; changed: boolean } {
  const items = byId(data.items);
  const series = byId(data.series);
  const out = { ...meta };
  let changed = false;
  for (const { kind, row } of rows) {
    const k = key(kind, row.id);
    const local = out[k];
    if (local && local.dirty && local.updatedAt > row.updated_at) continue;
    if (local && !local.dirty && local.updatedAt === row.updated_at && local.deleted === row.deleted) continue;
    const map = (kind === 'item' ? items : series) as Map<string, Item | Series>;
    if (row.deleted) {
      if (map.delete(row.id)) changed = true;
    } else if (row.data && typeof row.data === 'object') {
      map.set(row.id, row.data as Item | Series);
      changed = true;
    }
    out[k] = { updatedAt: row.updated_at, dirty: false, deleted: row.deleted };
  }
  return {
    data: changed ? { items: [...items.values()] as Item[], series: [...series.values()] as Series[] } : data,
    meta: out,
    changed,
  };
}

export function hasDirty(meta: SyncMeta): boolean {
  return Object.values(meta).some((m) => m.dirty);
}
