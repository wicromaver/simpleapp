// The one edit sheet for Tasks, Reminders and Events (APP_SPEC §6). Kind switching and the
// duration guard live in core's applyEdit; this is just the form.
import { kindOf, type Item } from '@simpleapp/core';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../state/store';
import { PickerField } from './PickerField';
import { MAX_WIDTH, Pill, T } from './ui';

export function EditSheet() {
  const { engine, editingId, setEditingId, palette } = useStore();
  const item = editingId ? engine.items.find((i) => i.id === editingId) : undefined;
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={() => setEditingId(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={[styles.overlay, { backgroundColor: palette.overlay }]} onPress={() => setEditingId(null)}>
          {item && <SheetBody key={item.id} item={item} />}
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function hintFor(item: Item): string {
  const kind = kindOf(item);
  if (kind === 'task') return 'This is a task with no date. Add a day below to schedule it, or leave it blank to keep it as a task.';
  if (kind === 'reminder') return 'This is an all-day reminder. Add a start time to turn it into a timed event, or clear the date to send it back to Tasks.';
  return 'Clear the date to send this back to Tasks.';
}

function SheetBody({ item }: { item: Item }) {
  const { palette, saveEdit, deleteItem, setEditingId } = useStore();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(item.title);
  const [date, setDate] = useState(item.date ?? '');
  const [start, setStart] = useState(item.start ?? '');
  const [end, setEnd] = useState(item.end ?? '');

  const input = [styles.input, { backgroundColor: palette.raised2, borderColor: palette.border, color: palette.text }];

  return (
    // Stop taps inside the card from closing the sheet.
    <Pressable
      onPress={(e) => e.stopPropagation()}
      style={[styles.card, { backgroundColor: palette.raised, borderTopColor: palette.border, paddingBottom: 26 + insets.bottom }]}>
      <T size={19} weight="500" serifFont style={{ marginBottom: 12 }}>Edit</T>
      {item.seriesId && <T size={12} tone="faint" style={styles.hint}>Part of a repeating series — this only edits this occurrence.</T>}
      <T size={12} tone="faint" style={styles.hint}>{hintFor(item)}</T>

      <T size={11.5} tone="faint" style={styles.label}>Title</T>
      <TextInput value={title} onChangeText={setTitle} style={input} accessibilityLabel="Title" />

      <T size={11.5} tone="faint" style={styles.label}>Date</T>
      <PickerField mode="date" value={date} onChange={setDate} placeholder="No date (task)" />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <T size={11.5} tone="faint" style={styles.label}>Start</T>
          <PickerField mode="time" value={start} onChange={setStart} placeholder="No time" />
        </View>
        <View style={{ flex: 1 }}>
          <T size={11.5} tone="faint" style={styles.label}>End</T>
          <PickerField mode="time" value={end} onChange={setEnd} placeholder="—" />
        </View>
      </View>

      <View style={styles.actions}>
        <Pill label="Delete" variant="danger" style={{ flex: 1 }} onPress={() => deleteItem(item.id)} />
        <Pill label="Cancel" style={{ flex: 1 }} onPress={() => setEditingId(null)} />
        <Pill label="Save" variant="primary" style={{ flex: 1 }} onPress={() => saveEdit(item.id, { title, date, start, end })} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  card: { width: '100%', maxWidth: MAX_WIDTH, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, padding: 22 },
  hint: { marginBottom: 10, lineHeight: 17 },
  label: { marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, outlineStyle: 'none' } as object,
  row: { flexDirection: 'row', gap: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
});
