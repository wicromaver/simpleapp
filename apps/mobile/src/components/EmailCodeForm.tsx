// Two-step email sign-in: enter email -> get a 6-digit code -> enter code. Used on the
// welcome screen (sign in) and in Settings (add email to an anonymous account).
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { font } from '../fonts';
import { useStore } from '../state/store';
import { Pill, T } from './ui';

export function EmailCodeForm({ sendCode, verifyCode, onCancel, submitLabel = 'Send code' }: {
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const { palette } = useStore();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const input = [styles.input, font(), { backgroundColor: palette.raised, borderColor: palette.border, color: palette.text }];
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <View>
      {step === 'email' ? (
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={palette.faint}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          accessibilityLabel="Email"
          onSubmitEditing={() => validEmail && run(async () => { await sendCode(email); setStep('code'); })}
          style={input}
        />
      ) : (
        <>
          <T size={13} tone="dim" style={{ marginBottom: 8 }}>We sent a code to {email.trim()}.</T>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit code"
            placeholderTextColor={palette.faint}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            accessibilityLabel="Code"
            onSubmitEditing={() => code.length === 6 && run(() => verifyCode(email, code))}
            style={input}
          />
        </>
      )}
      {error && <T size={12.5} tone="danger" style={{ marginTop: 8 }}>{error}</T>}
      <View style={styles.actions}>
        {onCancel && <Pill label="Back" style={{ flex: 1 }} onPress={step === 'code' ? () => { setStep('email'); setCode(''); } : onCancel} />}
        {busy ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={palette.dim} /></View>
        ) : step === 'email' ? (
          <Pill label={submitLabel} variant="primary" style={{ flex: 1, opacity: validEmail ? 1 : 0.5 }}
            onPress={() => validEmail && run(async () => { await sendCode(email); setStep('code'); })} />
        ) : (
          <Pill label="Verify" variant="primary" style={{ flex: 1, opacity: code.length === 6 ? 1 : 0.5 }}
            onPress={() => code.length === 6 && run(() => verifyCode(email, code))} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, outlineStyle: 'none' } as object,
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
});
