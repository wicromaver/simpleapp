import { claimPrompt, FREE_AI_PARSES_PER_MONTH, PRO_PRICING } from '@simpleapp/core';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '../auth/auth';
import { EmailCodeForm } from '../components/EmailCodeForm';
import { Pill, Screen, Segmented, SectionLabel, T } from '../components/ui';
import { useStore } from '../state/store';

function Row({ label, sub, children, last }: { label: string; sub?: string; children?: React.ReactNode; last?: boolean }) {
  const { palette } = useStore();
  return (
    <View style={[styles.row, { borderBottomColor: palette.border }, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <T size={14.5}>{label}</T>
        {sub && <T size={12} tone="faint" style={{ marginTop: 2 }}>{sub}</T>}
      </View>
      {children}
    </View>
  );
}

function syncLine(lastSyncedAt: Date | null, syncError: string | null): string {
  if (syncError) return 'Offline — changes will sync when you reconnect.';
  if (!lastSyncedAt) return 'Not synced yet.';
  return `Synced at ${lastSyncedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`;
}

function AccountSection() {
  const auth = useAuth();
  const { lastSyncedAt, syncError, syncNow, clearLocalData } = useStore();
  const [adding, setAdding] = useState(false);
  const prompt = claimPrompt('settings', auth.account, { itemCount: 0, dismissed: [] });

  if (!auth.isAnonymous && auth.email) {
    const signOut = async () => {
      await syncNow(); // last chance to upload anything pending
      await auth.signOut();
      clearLocalData();
    };
    return (
      <Row label="Signed in" sub={`${auth.email}\n${syncLine(lastSyncedAt, syncError)}`}>
        <Pill label="Sign out" onPress={() => void signOut()} />
      </Row>
    );
  }
  if (!prompt) return null;
  if (adding) {
    return (
      <View style={{ paddingVertical: 14 }}>
        {auth.available ? (
          <EmailCodeForm sendCode={auth.sendClaimCode} verifyCode={auth.verifyClaimCode} onCancel={() => setAdding(false)} submitLabel="Send code" />
        ) : (
          <>
            <T size={13} tone="dim">Accounts aren't set up in this build yet. Your schedule is saved on this device.</T>
            <Pill label="OK" style={{ marginTop: 12 }} onPress={() => setAdding(false)} />
          </>
        )}
      </View>
    );
  }
  return (
    <Row label={prompt.title} sub={auth.available ? `${prompt.body}\n${syncLine(lastSyncedAt, syncError)}` : prompt.body}>
      <Pill label={prompt.primary} onPress={() => setAdding(true)} />
    </Row>
  );
}

export default function Settings() {
  const { settings, setSettings, palette, notificationPermission } = useStore();
  const toggleAlert = (m: number) => {
    const has = settings.eventAlerts.includes(m);
    setSettings({ eventAlerts: has ? settings.eventAlerts.filter((x) => x !== m) : [...settings.eventAlerts, m].sort((a, b) => a - b) });
  };

  return (
    <Screen>
      <T size={22} weight="500" serifFont style={{ marginTop: 10, marginBottom: 18 }}>Settings</T>

      <View style={styles.group}>
        <SectionLabel>Appearance</SectionLabel>
        <Segmented
          value={settings.theme}
          onChange={(theme) => setSettings({ theme })}
          options={[{ label: 'System', value: 'system' }, { label: 'Dark', value: 'dark' }, { label: 'Light', value: 'light' }]}
        />
      </View>

      <View style={styles.group}>
        <SectionLabel>Default event length</SectionLabel>
        <Segmented
          value={settings.defaultDuration}
          onChange={(defaultDuration) => setSettings({ defaultDuration })}
          options={[{ label: '30 min', value: 30 as const }, { label: '60 min', value: 60 as const }]}
        />
      </View>

      <View style={styles.group}>
        <SectionLabel>Event alerts (pick any)</SectionLabel>
        <View style={[styles.seg, { backgroundColor: palette.raised, borderColor: palette.border }]}>
          {[15, 30, 60].map((m) => {
            const on = settings.eventAlerts.includes(m);
            return (
              <Pressable
                key={m}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => toggleAlert(m)}
                style={[styles.segBtn, on && { backgroundColor: palette.raised2 }]}>
                <T size={12.5} tone={on ? 'text' : 'dim'} weight={on ? '600' : '400'}>{m === 60 ? '1 hr' : `${m} min`} before</T>
              </Pressable>
            );
          })}
        </View>
        {Platform.OS === 'web' ? (
          <T size={12} tone="faint" style={{ marginTop: 8 }}>Alerts and reminders are delivered by the phone app.</T>
        ) : notificationPermission === 'denied' ? (
          <T size={12} tone="danger" style={{ marginTop: 8 }}>Notifications are turned off for this app. Turn them on in your phone's Settings to get alerts.</T>
        ) : null}
      </View>

      <View style={styles.group}>
        <SectionLabel>Color-code events</SectionLabel>
        <Segmented
          value={settings.colorCode ? 'on' : 'off'}
          onChange={(v) => setSettings({ colorCode: v === 'on' })}
          options={[{ label: 'On', value: 'on' }, { label: 'Off (neutral)', value: 'off' }]}
        />
      </View>

      <View style={styles.group}>
        <SectionLabel>Completed tasks</SectionLabel>
        <Segmented
          value={settings.hideCompletedNextDay ? 'hide' : 'keep'}
          onChange={(v) => setSettings({ hideCompletedNextDay: v === 'hide' })}
          options={[{ label: 'Clear each new day', value: 'hide' }, { label: 'Keep them', value: 'keep' }]}
        />
      </View>

      <View style={styles.group}>
        <SectionLabel>Account</SectionLabel>
        <AccountSection />
        <Row
          label="Plan: Free"
          sub={`Everything on this device, plus ${FREE_AI_PARSES_PER_MONTH} AI-assisted entries a month. Pro ($${PRO_PRICING.monthly.perMonth}/mo, or $${PRO_PRICING.annual.perMonth}/mo yearly) adds Google/Outlook sync and unlimited AI.`}
          last
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, gap: 14 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 3, gap: 3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999 },
});
