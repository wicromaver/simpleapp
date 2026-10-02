// Web date/time field: the browser's native <input type="date|time">.
import type { CSSProperties } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStore } from '../state/store';
import type { PickerFieldProps } from './PickerField';
import { Icon } from './ui';

export function PickerField({ mode, value, onChange, placeholder }: PickerFieldProps) {
  const { palette, scheme } = useStore();
  const input: CSSProperties = {
    flex: 1, background: 'transparent', border: 'none', outline: 'none', color: value ? palette.text : palette.faint,
    fontSize: 14, padding: '10px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', colorScheme: scheme, minWidth: 0,
  };
  return (
    <View style={[styles.field, { backgroundColor: palette.raised2, borderColor: palette.border }]}>
      <input
        aria-label={placeholder}
        type={mode}
        value={value}
        step={mode === 'time' ? 300 : undefined}
        onChange={(e) => onChange(e.currentTarget.value)}
        style={input}
      />
      {!!value && (
        <Pressable hitSlop={10} accessibilityLabel={`Clear ${mode}`} onPress={() => onChange('')}>
          <Icon name="close" color={palette.faint} size={14} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
});
