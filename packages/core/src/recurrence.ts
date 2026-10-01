// Recurring series are stored as a rule (Series) plus materialized occurrences on a
// rolling window. The app calls refreshSeries() on launch/daily to extend the window.

import { addDaysStr, fmtDate, minutesOfDay, parseDate, timeToMin, type DateStr } from './dates';
import { newItem } from './items';
import type { EngineContext, EngineState, Item, Op, Series } from './types';

export const SERIES_HORIZON_DAYS = 56; // 8 weeks ahead

/** New occurrence items for `series` that don't exist yet within the horizon. */
export function materializeSeries(series: Series, existing: Item[], ctx: EngineContext, horizonDays = SERIES_HORIZON_DAYS): Item[] {
  const today = fmtDate(ctx.now);
  const nowMin = minutesOfDay(ctx.now);
  const have = new Set(existing.filter((i) => i.seriesId === series.id).map((i) => i.occurrenceDate));
  const skip = new Set(series.exceptions);
  const from: DateStr = series.startDate > today ? series.startDate : today;
  let to: DateStr = addDaysStr(today, horizonDays);
  if (series.until && series.until < to) to = series.until;

  const out: Item[] = [];
  for (let d = from; d <= to; d = addDaysStr(d, 1)) {
    if (!series.days.includes(parseDate(d).getDay())) continue;
    if (have.has(d) || skip.has(d)) continue;
    // Don't create an occurrence today that has already started.
    if (d === today && series.start && timeToMin(series.start) <= nowMin) continue;
    out.push(newItem({
      id: ctx.newId(), title: series.title, date: d, start: series.start, end: series.end,
      recurring: { days: series.days }, seriesId: series.id, occurrenceDate: d,
    }, ctx.now));
  }
  return out;
}

/** Ops that extend every series' rolling window. */
export function refreshSeries(state: EngineState, ctx: EngineContext, horizonDays = SERIES_HORIZON_DAYS): Op[] {
  return state.series.flatMap((s) => materializeSeries(s, state.items, ctx, horizonDays).map((item): Op => ({ op: 'putItem', item })));
}
