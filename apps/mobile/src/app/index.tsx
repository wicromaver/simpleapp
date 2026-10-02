import { fmtDate, parseDate, DOW, MONTH_NAMES } from '@simpleapp/core';
import { StyleSheet, View } from 'react-native';

import { InsertBar } from '../components/InsertBar';
import { Screen, T } from '../components/ui';
import { useStore } from '../state/store';

function greeting(h: number) {
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Home is just the greeting and the bar, centered on screen. */
export default function Home() {
  const { now } = useStore();
  const d = parseDate(fmtDate(now));
  const dayName = DOW[d.getDay()]!;

  return (
    <Screen>
      <View style={styles.center}>
        <T size={13} tone="dim">
          {dayName.charAt(0).toUpperCase() + dayName.slice(1)}, {d.getDate()} {MONTH_NAMES[d.getMonth()]}
        </T>
        <T size={30} serifFont style={{ marginTop: 2, marginBottom: 22 }}>{greeting(now.getHours())}</T>
        <InsertBar />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Nudged a little above true center so the keyboard doesn't cover the reply area.
  center: { flex: 1, justifyContent: 'center', paddingBottom: '12%' },
});
