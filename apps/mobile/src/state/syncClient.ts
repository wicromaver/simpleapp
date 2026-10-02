// Network half of sync: push dirty rows, pull rows changed since our cursor.
import type { PushBatch, RecordKind, SyncRow } from '@simpleapp/core';

import { supabase } from '../auth/supabase';

const TABLE: Record<RecordKind, string> = { item: 'items', series: 'series' };
const PAGE = 500;

export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function push(batch: PushBatch): Promise<void> {
  if (!supabase) return;
  for (const kind of ['item', 'series'] as const) {
    const rows = kind === 'item' ? batch.items : batch.series;
    for (let i = 0; i < rows.length; i += PAGE) {
      const { error } = await supabase.from(TABLE[kind]).upsert(rows.slice(i, i + PAGE), { onConflict: 'id' });
      if (error) throw error;
    }
  }
}

/** Everything that changed on the server after `cursor` (server time), oldest first. */
export async function pull(cursor: string | null): Promise<{ rows: { kind: RecordKind; row: SyncRow }[]; cursor: string | null }> {
  if (!supabase) return { rows: [], cursor };
  const rows: { kind: RecordKind; row: SyncRow }[] = [];
  let next = cursor;
  // Re-read a minute of overlap: a write committing while we read could carry a slightly
  // older synced_at. Re-applying a row we already have is a no-op.
  const start = cursor ? new Date(Date.parse(cursor) - 60_000).toISOString() : null;
  for (const kind of ['series', 'item'] as const) {
    let from = start;
    for (;;) {
      let q = supabase.from(TABLE[kind]).select('id,data,updated_at,deleted,synced_at').order('synced_at', { ascending: true }).limit(PAGE);
      if (from) q = q.gt('synced_at', from);
      const { data, error } = await q;
      if (error) throw error;
      // Normalize Postgres timestamps to the app's ISO format so comparisons are exact.
      for (const r of data ?? []) {
        rows.push({ kind, row: { id: r.id, data: r.data, updated_at: new Date(r.updated_at).toISOString(), deleted: r.deleted } });
      }
      const lastRaw = data?.[data.length - 1]?.synced_at as string | undefined;
      const last = lastRaw ? new Date(lastRaw).toISOString() : undefined;
      if (last && (!next || last > next)) next = last;
      if (!data || data.length < PAGE) break;
      if (!lastRaw || lastRaw === from) break; // page by the exact server value; never loop
      from = lastRaw;
    }
  }
  return { rows, cursor: next };
}
