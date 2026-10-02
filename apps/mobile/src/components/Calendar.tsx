import {
  addDaysStr, daySegments, DOW_SHORT, fmtClock, fmtDate, itemsOnDay, layoutDay, monthGrid, MONTH_NAMES, parseDate,
  remindersOn, segmentGeometry, timeLabel, weekDays, type DateStr, type Item,
} from '@simpleapp/core';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useStore, type CalView } from '../state/store';
import { blockColors } from '../theme';
import { Icon, Segmented, T } from './ui';

const HOUR_PX = 56;

function shortDate(d: DateStr) {
  const x = parseDate(d);
  return `${x.getMonth() + 1}/${x.getDate()}`;
}

export function calendarTitle(view: CalView, date: DateStr, today: DateStr): string {
  const d = parseDate(date);
  if (view === 'day') return date === today ? 'Today' : `${DOW_SHORT[d.getDay()]}, ${shortDate(date)}`;
  if (view === 'week') {
    const days = weekDays(date);
    return `${shortDate(days[0]!)} – ${shortDate(days[6]!)}`;
  }
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function step(view: CalView, date: DateStr, dir: 1 | -1): DateStr {
  if (view === 'day') return addDaysStr(date, dir);
  if (view === 'week') return addDaysStr(date, 7 * dir);
  const d = parseDate(date);
  return fmtDate(new Date(d.getFullYear(), d.getMonth() + dir, 1));
}

export function CalendarHeader() {
  const { palette, calView, setCalView, viewDate, setViewDate, now } = useStore();
  const today = fmtDate(now);
  const navBtn = [styles.navBtn, { backgroundColor: palette.raised, borderColor: palette.border }];
  return (
    <View>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Previous" style={navBtn} onPress={() => setViewDate(step(calView, viewDate, -1))}>
          <Icon name="chevron-left" color={palette.text} size={16} />
        </Pressable>
        <T size={17} weight="500" serifFont>{calendarTitle(calView, viewDate, today)}</T>
        <Pressable accessibilityLabel="Next" style={navBtn} onPress={() => setViewDate(step(calView, viewDate, 1))}>
          <Icon name="chevron-right" color={palette.text} size={16} />
        </Pressable>
      </View>
      <View style={styles.controls}>
        <Segmented
          style={{ flex: 1 }}
          value={calView}
          onChange={setCalView}
          options={[{ label: 'Day', value: 'day' }, { label: 'Week', value: 'week' }, { label: 'Month', value: 'month' }]}
        />
        {/* One tap back to today, however far the user has navigated. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => setViewDate(today)}
          style={[styles.todayBtn, { backgroundColor: palette.raised, borderColor: palette.border }]}>
          <T size={12} tone="blue">Today</T>
        </Pressable>
      </View>
    </View>
  );
}

function ReminderBlock({ item }: { item: Item }) {
  const { palette, settings, setEditingId } = useStore();
  const c = blockColors(palette, item.color, settings.colorCode);
  const at = item.reminderAt ? new Date(item.reminderAt) : null;
  return (
    <Pressable onPress={() => setEditingId(item.id)} style={[styles.block, { backgroundColor: c.bg, borderLeftColor: c.border }]}>
      <T size={13} weight="600" style={{ color: c.fg }}>{item.title}</T>
      <View style={[styles.badge, { borderColor: palette.border }]}>
        <T size={10.5} tone="faint">{at ? `reminder ${fmtClock(at.getHours() * 60 + at.getMinutes())}` : 'all day'}{item.seriesId ? ' · repeats' : ''}</T>
      </View>
    </Pressable>
  );
}

export function DayView({ date }: { date: DateStr }) {
  const { engine, palette, settings, setEditingId, now } = useStore();
  const scrollRef = useRef<ScrollView>(null);
  const reminders = remindersOn(engine.items, date);
  const laid = layoutDay(daySegments(engine.items, date));
  const isToday = date === fmtDate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Open near the action: current time for today, else the first event (or 7am).
  useEffect(() => {
    const first = laid.length ? Math.min(...laid.map((s) => s.startMin)) : 7 * 60;
    const target = isToday ? Math.max(0, nowMin - 90) : Math.max(0, first - 30);
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y: (target / 60) * HOUR_PX, animated: false }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <View style={{ flex: 1 }}>
      {reminders.map((r) => <ReminderBlock key={r.id} item={r} />)}
      <ScrollView ref={scrollRef} style={{ flex: 1 }}>
        <View style={styles.grid}>
          <View style={styles.labels}>
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} style={{ height: HOUR_PX }}>
                <T size={11} tone="faint" style={{ marginTop: -7 }}>{h === 0 ? '' : fmtClock(h * 60)}</T>
              </View>
            ))}
          </View>
          <View style={[styles.events, { height: 24 * HOUR_PX }]}>
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} style={[styles.line, { top: h * HOUR_PX, borderTopColor: palette.border }]} />
            ))}
            {laid.map((seg) => {
              const g = segmentGeometry(seg, HOUR_PX);
              const c = blockColors(palette, seg.item.color, settings.colorCode);
              return (
                <Pressable
                  key={seg.item.id}
                  onPress={() => setEditingId(seg.item.id)}
                  accessibilityLabel={`${seg.item.title}, ${timeLabel(seg.item)}`}
                  style={[styles.gridBlock, {
                    top: g.top, height: g.height, left: `${g.leftPct}%`, width: `${g.widthPct}%`,
                    backgroundColor: c.bg, borderLeftColor: c.border,
                  }]}>
                  {seg.continuesFromPrev && <Icon name="arrow-up" color={c.fg} size={11} />}
                  <T size={12.5} weight="600" numberOfLines={1} style={{ color: c.fg }}>{seg.item.title}</T>
                  {g.height > 34 && <T size={11} numberOfLines={1} style={{ color: c.fg, opacity: 0.75 }}>{timeLabel(seg.item)}</T>}
                  {seg.continuesToNext && (
                    <View style={styles.continues}>
                      <Icon name="arrow-down" color={c.fg} size={11} />
                      <T size={10.5} style={{ color: c.fg, opacity: 0.75 }}>continues</T>
                    </View>
                  )}
                </Pressable>
              );
            })}
            {isToday && <View style={[styles.nowLine, { top: (nowMin / 60) * HOUR_PX, backgroundColor: palette.danger }]} />}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export function WeekView({ date }: { date: DateStr }) {
  const { engine, palette, settings, now, setViewDate, setCalView } = useStore();
  const today = fmtDate(now);
  return (
    <View>
      {weekDays(date).map((d, i) => {
        const items = itemsOnDay(engine.items, d);
        const x = parseDate(d);
        return (
          <Pressable
            key={d}
            onPress={() => { setViewDate(d); setCalView('day'); }}
            style={[styles.weekRow, { borderBottomColor: palette.border }, i === 6 && { borderBottomWidth: 0 }]}>
            <T size={13.5} tone={d === today ? 'blue' : 'dim'} weight={d === today ? '600' : '400'} style={{ minWidth: 74 }}>
              {DOW_SHORT[x.getDay()]} {shortDate(d)}
            </T>
            <View style={styles.chips}>
              {!items.length && <T size={12} tone="faint">Free</T>}
              {items.slice(0, 3).map((it) => {
                const c = blockColors(palette, it.color, settings.colorCode);
                return (
                  <View key={it.id} style={[styles.chip, { backgroundColor: c.bg, borderLeftColor: c.border }]}>
                    <T size={11} numberOfLines={1} style={{ color: c.fg, maxWidth: 110 }}>{it.title}</T>
                  </View>
                );
              })}
              {items.length > 3 && <T size={12} tone="faint">+{items.length - 3}</T>}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MonthView({ date }: { date: DateStr }) {
  const { engine, palette, now, setViewDate, setCalView } = useStore();
  const today = fmtDate(now);
  return (
    <View style={styles.month}>
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => (
        <View key={i} style={styles.monthCellWrap}><T size={10.5} tone="faint" style={{ textAlign: 'center', paddingBottom: 6 }}>{l}</T></View>
      ))}
      {monthGrid(engine.items, date).map((c) => (
        <View key={c.date} style={styles.monthCellWrap}>
          <Pressable
            onPress={() => { setViewDate(c.date); setCalView('day'); }}
            accessibilityLabel={c.date}
            style={[styles.monthCell, c.date === today && { backgroundColor: palette.raised2 }, !c.inMonth && { opacity: 0.35 }]}>
            <T size={12.5} tone={c.date === today ? 'text' : c.inMonth ? 'dim' : 'faint'} weight={c.date === today ? '600' : '400'}>
              {parseDate(c.date).getDate()}
            </T>
            <View style={[styles.dot, { backgroundColor: c.hasItems ? palette.blue : 'transparent' }]} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** Compact list of today's items for the Home embed. */
export function TodayAgenda() {
  const { engine, now, palette, settings, setEditingId } = useStore();
  const today = fmtDate(now);
  const items = itemsOnDay(engine.items, today);
  if (!items.length) return <T size={13.5} tone="faint" style={{ paddingVertical: 12 }}>Nothing scheduled today.</T>;
  return (
    <View>
      {items.map((it) => {
        const c = blockColors(palette, it.color, settings.colorCode);
        return (
          <Pressable key={it.id} onPress={() => setEditingId(it.id)} style={[styles.block, { backgroundColor: c.bg, borderLeftColor: c.border }]}>
            <T size={13} weight="600" style={{ color: c.fg }}>{it.title}</T>
            <T size={11.5} style={{ color: c.fg, opacity: 0.75 }}>{it.start ? timeLabel(it) : 'All day'}</T>
          </Pressable>
        );
      })}
    </View>
  );
}


const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, marginBottom: 10, gap: 8 },
  navBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  todayBtn: { borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  block: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 8, borderLeftWidth: 3 },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, marginTop: 4 },
  grid: { flexDirection: 'row', marginTop: 10 },
  labels: { width: 46 },
  events: { flex: 1, position: 'relative' },
  line: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1 },
  gridBlock: { position: 'absolute', borderRadius: 8, borderLeftWidth: 3, paddingVertical: 4, paddingHorizontal: 8, overflow: 'hidden', marginRight: 4 },
  continues: { position: 'absolute', bottom: 3, right: 6, flexDirection: 'row', alignItems: 'center', gap: 2 },
  nowLine: { position: 'absolute', left: -4, right: 0, height: 1.5 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1, justifyContent: 'flex-end' },
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, borderLeftWidth: 2 },
  month: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  monthCellWrap: { width: `${100 / 7}%`, padding: 1.5 },
  monthCell: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
