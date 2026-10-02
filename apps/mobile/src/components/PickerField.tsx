// Native date/time field. Value is 'YYYY-MM-DD' (date) or 'HH:MM' (time), '' when empty.
import DateTimePicker from '@react-native-community/datetimepicker';
import { fmtDate, minToTime, parseDate, timeToMin, fmtClock } from '@simpleapp/core';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useStore } from '../state/store';
import { Icon, T } from './ui';

export interface PickerFieldProps {
  mode: 'date' | 'time';
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}

function toDate(mode: 'date' | 'time', v: string): Date {
  if (!v) return new Date();
  if (mode === 'date') return parseDate(v);
  const d = new Date();
  d.setHours(0, timeToMin(v), 0, 0);
  return d;
}

function fromDate(mode: 'date' | 'time', d: Date): string {
  return mode === 'date' ? fmtDate(d) : minToTime(d.getHours() * 60 + d.getMinutes());
}

export function display(mode: 'date' | 'time', v: string): string {
  if (!v) return '';
  if (mode === 'time') return fmtClock(timeToMin(v));
  const d = parseDate(v);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function PickerField({ mode, value, onChange, placeholder }: PickerFieldProps) {
  const { palette, scheme } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <View style={[styles.field, { backgroundColor: palette.raised2, borderColor: palette.border }]}>
        <Pressable style={{ flex: 1, paddingVertical: 10 }} onPress={() => setOpen((o) => !o)} accessibilityLabel={placeholder}>
          <T size={14} tone={value ? 'text' : 'faint'}>{value ? display(mode, value) : placeholder}</T>
        </Pressable>
        {!!value && (
          <Pressable hitSlop={10} accessibilityLabel={`Clear ${mode}`} onPress={() => onChange('')}>
            <Icon name="close" color={palette.faint} size={14} />
          </Pressable>
        )}
      </View>
      {open && (
        <DateTimePicker
          value={toDate(mode, value)}
          mode={mode}
          display={Platform.OS === 'ios' ? (mode === 'date' ? 'inline' : 'spinner') : 'default'}
          themeVariant={scheme}
          minuteInterval={5}
          onChange={(e, d) => {
            if (Platform.OS !== 'ios') setOpen(false);
            if (e.type === 'set' && d) onChange(fromDate(mode, d));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
});
