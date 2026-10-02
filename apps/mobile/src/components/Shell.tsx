import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { StatusBar } from 'expo-status-bar';
import { forwardRef, useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/auth';
import { FONT_FILES } from '../fonts';
import { useStore } from '../state/store';
import { EditSheet } from './EditSheet';
import { Welcome } from './Welcome';
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

export function Shell() {
  const store = useStore();
  const router = useRouter();
  const auth = useAuth();
  // Bundled font files: loads from the app package, so it works offline. If it ever
  // fails we still render with system fonts rather than a blank screen.
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const { pendingTab, clearPendingTab, palette, scheme, loaded } = store;

  useEffect(() => {
    if (!pendingTab) return;
    router.navigate(pendingTab === 'tasks' ? '/tasks' : '/calendar');
    clearPendingTab();
  }, [pendingTab, router, clearPendingTab]);

  if (!loaded || !auth.ready || (!fontsLoaded && !fontError)) return <View style={{ flex: 1, backgroundColor: palette.bg }} />;
  if (!auth.choice) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Welcome />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Tabs style={{ flex: 1 }}>
        <TabSlot style={{ flex: 1 }} />
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
});
