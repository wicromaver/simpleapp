import { usePathname, useRouter } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { StatusBar } from 'expo-status-bar';
import { forwardRef, useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../state/store';
import { EditSheet } from './EditSheet';
import { SystemMessage } from './InsertBar';
import { Icon, MAX_WIDTH, T, type IconName } from './ui';

const TabButton = forwardRef<RNView, TabTriggerSlotProps & { icon: IconName; label: string }>(
  ({ icon, label, isFocused, ...props }, ref) => {
    const { palette } = useStore();
    const color = isFocused ? palette.text : palette.faint;
    return (
      <Pressable ref={ref} {...props} accessibilityRole="tab" accessibilityLabel={label} style={styles.tab}>
        <Icon name={icon} color={color} size={20} />
        <T size={10.5} style={{ color }}>{label}</T>
      </Pressable>
    );
  },
);

function TabBar({ children, ...props }: { children?: ReactNode }) {
  const { palette } = useStore();
  const insets = useSafeAreaInsets();
  return (
    <View {...props} style={[styles.tabbar, { borderTopColor: palette.border, backgroundColor: palette.bg, paddingBottom: 10 + insets.bottom }]}>
      <View style={styles.tabbarInner}>{children}</View>
    </View>
  );
}

/** Messages triggered away from Home (edit sheet, checkbox, jumps) float above the tab bar. */
function FloatingMessage() {
  const { message, palette } = useStore();
  const pathname = usePathname();
  // Home's own messages render inline under the bar; only show ones raised elsewhere.
  if (!message || message.origin === 'home' || pathname === '/') return null; // Home shows every message inline
  return (
    <View pointerEvents="box-none" style={styles.floatWrap}>
      <View style={[styles.float, { backgroundColor: palette.raised, borderColor: palette.border }]}>
        <SystemMessage message={message} compact />
      </View>
    </View>
  );
}

export function Shell() {
  const store = useStore();
  const router = useRouter();
  const { pendingTab, clearPendingTab, palette, scheme, loaded } = store;

  useEffect(() => {
    if (!pendingTab) return;
    router.navigate(pendingTab === 'tasks' ? '/tasks' : '/calendar');
    clearPendingTab();
  }, [pendingTab, router, clearPendingTab]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: palette.bg }} />;

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Tabs style={{ flex: 1 }}>
        <TabSlot style={{ flex: 1 }} />
        <FloatingMessage />
        <TabList asChild>
          <TabBar>
            <TabTrigger name="index" href="/" asChild><TabButton icon="home" label="Home" /></TabTrigger>
            <TabTrigger name="tasks" href="/tasks" asChild><TabButton icon="tasks" label="Tasks" /></TabTrigger>
            <TabTrigger name="calendar" href="/calendar" asChild><TabButton icon="calendar" label="Calendar" /></TabTrigger>
            <TabTrigger name="settings" href="/settings" asChild><TabButton icon="settings" label="Settings" /></TabTrigger>
          </TabBar>
        </TabList>
      </Tabs>
      <EditSheet />
    </View>
  );
}

const styles = StyleSheet.create({
  tabbar: { borderTopWidth: 1, paddingTop: 10, paddingHorizontal: 6 },
  tabbarInner: { flexDirection: 'row', width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  floatWrap: { paddingHorizontal: 16, paddingBottom: 10, alignItems: 'center' },
  float: { width: '100%', maxWidth: MAX_WIDTH - 32, borderWidth: 1, borderRadius: 16, padding: 14 },
});
