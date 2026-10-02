import { claimPrompt, fmtDate, parseDate, DOW, MONTH_NAMES } from '@simpleapp/core';
import { View } from 'react-native';

import { TodayAgenda } from '../components/Calendar';
import { InsertBar, SystemMessage } from '../components/InsertBar';
import { TaskList } from '../components/TaskList';
import { Pill, Screen, SectionLabel, T } from '../components/ui';
import { useStore } from '../state/store';

function greeting(h: number) {
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const { now, message, settings, engine, dismissed, dismissClaim, palette } = useStore();
  const d = parseDate(fmtDate(now));
  const dayName = DOW[d.getDay()]!;
  // Accounts aren't wired yet: everyone is an anonymous, on-device user for now.
  const claim = claimPrompt('emptyFirstLaunch', { isAnonymous: true, email: null }, { itemCount: engine.items.length, dismissed });

  return (
    <Screen>
      <T size={13} tone="dim" style={{ marginTop: 6 }}>
        {dayName.charAt(0).toUpperCase() + dayName.slice(1)}, {d.getDate()} {MONTH_NAMES[d.getMonth()]}
      </T>
      <T size={30} weight="500" serifFont style={{ marginTop: 2, marginBottom: 22 }}>{greeting(now.getHours())}</T>

      <InsertBar />
      {message && <SystemMessage message={message} />}

      {claim && (
        <View style={{ borderWidth: 1, borderColor: palette.border, borderRadius: 14, padding: 14, marginBottom: 18 }}>
          <T size={13.5} weight="500">{claim.title}</T>
          <T size={12.5} tone="dim" style={{ marginTop: 4, lineHeight: 18 }}>{claim.body}</T>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pill label={claim.secondary ?? 'Not now'} onPress={() => dismissClaim('emptyFirstLaunch')} />
          </View>
        </View>
      )}

      {settings.homeMode === 'tasks' && (<><SectionLabel>Tasks</SectionLabel><TaskList /></>)}
      {settings.homeMode === 'calendar' && (<><SectionLabel>Today</SectionLabel><TodayAgenda /></>)}
    </Screen>
  );
}
