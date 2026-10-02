import { usePathname } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { font } from '../fonts';
import { useStore, type Message } from '../state/store';
import { Icon, Pill, T } from './ui';

/** The type-anything bar plus its reply area. Same bar on Home, Tasks and Calendar. */
export function InsertBar({ hint = true }: { hint?: boolean }) {
  const { palette, submit, busy, message } = useStore();
  const [text, setText] = useState('');

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    void submit(t);
  };

  return (
    <View>
      <View style={[styles.wrap, { backgroundColor: palette.raised, borderColor: palette.border }]}>
        <Icon name="search" color={palette.faint} size={17} />
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          placeholder="What's on your mind?"
          placeholderTextColor={palette.faint}
          returnKeyType="done"
          submitBehavior="submit"
          autoCorrect={false}
          accessibilityLabel="Add a task, reminder or event"
          style={[styles.input, font(), { color: palette.text }]}
        />
        {busy && <ActivityIndicator size="small" color={palette.faint} />}
      </View>
      {hint ? (
        <T size={12} tone="faint" style={styles.hint}>Type a task, a note, or a time — it'll sort itself out.</T>
      ) : <View style={{ height: 12 }} />}
      {message && <SystemMessage message={message} />}
    </View>
  );
}

/** Confirmation / question shown under the bar, with choices and a jump link. */
export function SystemMessage({ message }: { message: Message }) {
  const { choose, jump, palette, dismissMessage, viewDate, calView } = useStore();
  const pathname = usePathname();
  const j = message.jump;
  // No "View in Tasks" link when you're already looking at it.
  const alreadyThere = !!j && ((j.tab === 'tasks' && pathname === '/tasks')
    || (j.tab === 'calendar' && pathname === '/calendar' && calView === 'day' && j.date === viewDate));
  return (
    <View style={styles.msg}>
      <View style={styles.msgRow}>
        <T size={13.5} tone="dim" style={{ flex: 1, lineHeight: 20 }}>{message.text}</T>
        <Pressable accessibilityLabel="Dismiss" hitSlop={10} onPress={dismissMessage}>
          <Icon name="close" color={palette.faint} size={14} />
        </Pressable>
      </View>
      {j && !alreadyThere && (
        <Pressable onPress={() => jump(j)}>
          <T size={13} tone="blue" style={styles.jump}>
            {j.tab === 'tasks' ? 'View in Tasks →' : 'View on Calendar →'}
          </T>
        </Pressable>
      )}
      {message.choices.length > 0 && (
        <View style={styles.choices}>
          {message.choices.map((c, i) => (
            <Pill key={c.reply + i} label={c.label} variant={i === 0 ? 'primary' : 'default'} onPress={() => void choose(c)} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 999, paddingHorizontal: 16 },
  input: { flex: 1, fontSize: 15, paddingVertical: 14, outlineStyle: 'none' } as object,
  hint: { marginTop: 10, marginHorizontal: 4, marginBottom: 18, lineHeight: 18 },
  msg: { paddingHorizontal: 2, paddingBottom: 14, marginBottom: 6 },
  msgRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  jump: { marginTop: 6, textDecorationLine: 'underline' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
});
