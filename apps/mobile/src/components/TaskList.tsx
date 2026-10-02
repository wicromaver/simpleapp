import { visibleTasks } from '@simpleapp/core';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStore } from '../state/store';
import { T } from './ui';

export function TaskList() {
  const { engine, now, settings, palette, toggle, setEditingId } = useStore();
  const tasks = visibleTasks(engine.items, now, settings.hideCompletedNextDay);

  if (!tasks.length) {
    return <T size={13.5} tone="faint" style={{ paddingVertical: 12 }}>Nothing on your list. Type anything above.</T>;
  }

  return (
    <View>
      {tasks.map((t, i) => (
        <Pressable
          key={t.id}
          onPress={() => setEditingId(t.id)}
          accessibilityLabel={`Edit ${t.title}`}
          style={[styles.row, { borderBottomColor: palette.border }, i === tasks.length - 1 && { borderBottomWidth: 0 }]}>
          {/* Separate tap target: toggles done, never opens the editor. */}
          <Pressable
            onPress={() => toggle(t.id)}
            hitSlop={12}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: t.done }}
            accessibilityLabel={t.done ? `Mark ${t.title} not done` : `Mark ${t.title} done`}
            style={[styles.check, { borderColor: t.done ? palette.green : palette.faint, backgroundColor: t.done ? palette.green : 'transparent' }]}
          />
          <View style={{ flex: 1 }}>
            <T size={14.5} tone={t.done ? 'faint' : 'text'} style={t.done && { textDecorationLine: 'line-through' }}>{t.title}</T>
            <T size={12} tone="faint" style={{ marginTop: 2 }}>{t.done ? 'Done' : 'No date yet'}</T>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  check: { width: 18, height: 18, borderRadius: 6, borderWidth: 1.5, marginTop: 2 },
});
