import { addDays, fmtDate, MIN_PER_DAY, parseDate, startOfWeek, type DateStr } from './dates';
import { eventInterval, kindOf } from './items';
import type { Item } from './types';

/** The part of a timed event that falls on one calendar day. */
export interface DaySegment {
  item: Item;
  startMin: number; // 0..1440 within the day
  endMin: number;
  /** Event started on an earlier day (render a "continued" arrow at the top). */
  continuesFromPrev: boolean;
  /** Event runs past midnight into the next day (render an arrow at the bottom). */
  continuesToNext: boolean;
}

export interface PositionedSegment extends DaySegment {
  col: number;
  totalCols: number;
}

/** Timed segments on `date`, splitting overnight events at midnight. */
export function daySegments(items: Item[], date: DateStr): DaySegment[] {
  const out: DaySegment[] = [];
  for (const it of items) {
    const iv = eventInterval(it, date);
    if (!iv) continue;
    const [s, e] = iv;
    if (e <= 0 || s >= MIN_PER_DAY) continue;
    out.push({
      item: it,
      startMin: Math.max(s, 0),
      endMin: Math.min(e, MIN_PER_DAY),
      continuesFromPrev: s < 0,
      continuesToNext: e > MIN_PER_DAY,
    });
  }
  return out;
}

export function remindersOn(items: Item[], date: DateStr): Item[] {
  return items.filter((it) => kindOf(it) === 'reminder' && it.date === date);
}

/**
 * Standard overlap layout (APP_SPEC §7): sort, cluster mutually-overlapping segments,
 * greedily assign columns within each cluster.
 */
export function layoutDay(segments: DaySegment[]): PositionedSegment[] {
  const sorted = [...segments].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const clusters: DaySegment[][] = [];
  let current: DaySegment[] = [];
  let currentEnd = -1;
  for (const seg of sorted) {
    if (current.length === 0 || seg.startMin < currentEnd) {
      current.push(seg);
      currentEnd = Math.max(currentEnd, seg.endMin);
    } else {
      clusters.push(current);
      current = [seg];
      currentEnd = seg.endMin;
    }
  }
  if (current.length) clusters.push(current);

  const out: PositionedSegment[] = [];
  for (const cluster of clusters) {
    const colEnds: number[] = [];
    const cols: number[] = [];
    for (const seg of cluster) {
      let col = colEnds.findIndex((end) => end <= seg.startMin);
      if (col === -1) { col = colEnds.length; colEnds.push(seg.endMin); } else colEnds[col] = seg.endMin;
      cols.push(col);
    }
    cluster.forEach((seg, i) => out.push({ ...seg, col: cols[i]!, totalCols: colEnds.length }));
  }
  return out;
}

/** Pixel geometry for the proportional Day grid. */
export function segmentGeometry(seg: PositionedSegment, hourPx: number, minHeightPx = 22) {
  const widthPct = 100 / seg.totalCols;
  return {
    top: (seg.startMin / 60) * hourPx,
    height: Math.max(((seg.endMin - seg.startMin) / 60) * hourPx - 2, minHeightPx),
    leftPct: seg.col * widthPct,
    widthPct,
  };
}

/** Items to show on a calendar day (reminders + timed segments), in display order. */
export function itemsOnDay(items: Item[], date: DateStr): Item[] {
  const timed = daySegments(items, date).sort((a, b) => a.startMin - b.startMin).map((s) => s.item);
  return [...remindersOn(items, date), ...timed];
}

/** Seven days starting Sunday for the week containing `date`. */
export function weekDays(date: DateStr): DateStr[] {
  const sun = startOfWeek(parseDate(date));
  return Array.from({ length: 7 }, (_, i) => fmtDate(addDays(sun, i)));
}

/** 6x7 month grid (Sunday first) with a has-items flag per cell. */
export function monthGrid(items: Item[], date: DateStr): { date: DateStr; inMonth: boolean; hasItems: boolean }[] {
  const d = parseDate(date);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const day = fmtDate(addDays(gridStart, i));
    return { date: day, inMonth: parseDate(day).getMonth() === d.getMonth(), hasItems: itemsOnDay(items, day).length > 0 };
  });
}
