// First-launch choice: sign in, or just start (silent anonymous account).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/auth';
import { useStore } from '../state/store';
import { EmailCodeForm } from './EmailCodeForm';
import { MAX_WIDTH, Pill, T } from './ui';

export function Welcome() {
  const { palette } = useStore();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [signingIn, setSigningIn] = useState(false);

  return (
    <View style={[styles.page, { backgroundColor: palette.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.inner}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <T size={34} serifFont>Simple</T>
          <T size={15} tone="dim" style={{ marginTop: 10, lineHeight: 22 }}>
            Type anything. It becomes a task, a reminder, or an event.
          </T>
        </View>

        {signingIn ? (
          <View>
            <T size={15} weight="500" style={{ marginBottom: 12 }}>Sign in with your email</T>
            {auth.available ? (
              <EmailCodeForm sendCode={auth.sendCode} verifyCode={auth.verifyCode} onCancel={() => setSigningIn(false)} />
            ) : (
              <>
                <T size={13} tone="dim" style={{ lineHeight: 19 }}>
                  Sign-in isn't set up in this build yet. You can start now and add your email later in Settings.
                </T>
                <View style={styles.actions}>
                  <Pill label="Back" style={{ flex: 1 }} onPress={() => setSigningIn(false)} />
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Pill label="Sign in" variant="primary" onPress={() => setSigningIn(true)} style={styles.big} />
            <Pill label="Continue without an account" onPress={() => void auth.continueWithoutAccount()} style={styles.big} />
            <T size={12} tone="faint" style={{ textAlign: 'center', marginTop: 6, lineHeight: 17 }}>
              No account needed. Your schedule stays on this device, and you can add an email any time in Settings.
            </T>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  inner: { flex: 1, width: '100%', maxWidth: MAX_WIDTH - 120, alignSelf: 'center', paddingHorizontal: 24 },
  big: { paddingVertical: 14 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
});
