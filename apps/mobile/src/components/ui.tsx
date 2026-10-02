import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useStore } from '../state/store';
import { font, type Weight } from '../fonts';

export const MAX_WIDTH = 560;

export function T({ children, style, tone = 'text', size = 14, weight, serifFont, numberOfLines }: {
  children: ReactNode; style?: StyleProp<TextStyle>; tone?: 'text' | 'dim' | 'faint' | 'blue' | 'danger';
  size?: number; weight?: Weight; serifFont?: boolean; numberOfLines?: number;
}) {
  const { palette } = useStore();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color: palette[tone], fontSize: size }, font(weight, serifFont), style]}>
      {children}
    </Text>
  );
}

/** Scrollable screen body, centered and width-capped on wide (web) screens. */
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { palette } = useStore();
  const insets = useSafeAreaInsets();
  const inner = <View style={[styles.inner, { paddingTop: insets.top + 12 }]}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>{inner}</ScrollView>
      ) : inner}
    </View>
  );
}

export function Segmented<V extends string | number>({ options, value, onChange, style }: {
  options: { label: string; value: V }[]; value: V; onChange: (v: V) => void; style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useStore();
  return (
    <View style={[styles.seg, { backgroundColor: palette.raised, borderColor: palette.border }, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segBtn, active && { backgroundColor: palette.raised2 }]}>
            <T size={12.5} tone={active ? 'text' : 'dim'} weight={active ? '600' : '400'} numberOfLines={1}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Pill({ label, onPress, variant = 'default', style }: {
  label: string; onPress: () => void; variant?: 'default' | 'primary' | 'danger'; style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useStore();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: primary ? palette.blue : palette.raised2, borderColor: primary ? 'transparent' : palette.border },
        pressed && { opacity: 0.7 },
        style,
      ]}>
      <Text style={[{ fontSize: 13, color: primary ? palette.onAccent : variant === 'danger' ? palette.danger : palette.text }, font(primary ? '600' : '400')]}>
        {label}
      </Text>
    </Pressable>
  );
}

export type IconName = 'home' | 'tasks' | 'calendar' | 'settings' | 'search' | 'chevron-left' | 'chevron-right' | 'close' | 'arrow-down' | 'arrow-up';

export function Icon({ name, color, size = 20 }: { name: IconName; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && (<><Path d="M4 11.5 12 4l8 7.5" {...p} /><Path d="M6 10v9h12v-9" {...p} /></>)}
      {name === 'tasks' && (<><Rect x="4" y="4" width="16" height="16" rx="4" {...p} /><Path d="M8.5 12.5l2.2 2.2L16 9.5" {...p} /></>)}
      {name === 'calendar' && (<><Rect x="4" y="5" width="16" height="15" rx="3" {...p} /><Path d="M8 3v4M16 3v4M4 10h16" {...p} /></>)}
      {name === 'settings' && (<><Circle cx="12" cy="12" r="3.2" {...p} /><Path d="M12 3v2.4M12 18.6V21M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M3 12h2.4M18.6 12H21M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" {...p} /></>)}
      {name === 'search' && (<><Circle cx="11" cy="11" r="6" {...p} /><Path d="M20 20l-4.5-4.5" {...p} /></>)}
      {name === 'chevron-left' && <Path d="M15 5l-7 7 7 7" {...p} />}
      {name === 'chevron-right' && <Path d="M9 5l7 7-7 7" {...p} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...p} />}
      {name === 'arrow-down' && <Path d="M12 5v14M6 13l6 6 6-6" {...p} />}
      {name === 'arrow-up' && <Path d="M12 19V5M6 11l6-6 6 6" {...p} />}
    </Svg>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <T size={12} tone="faint" style={{ marginTop: 6, marginBottom: 10 }}>{children}</T>;
}

export const styles = StyleSheet.create({
  inner: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 24 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 3, gap: 3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 4, borderRadius: 999 },
  pill: { borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
});
