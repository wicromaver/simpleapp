// Who is using the app. On first launch the user chooses: sign in with email (one-time
// code), or continue without an account, which silently creates an anonymous account.
// Everything still works offline and without a backend configured.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AccountInfo } from '@simpleapp/core';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { setFallbackAuth } from '../state/fallbackClient';
import { supabase } from './supabase';

const ONBOARD_KEY = 'simpleapp:onboarding';

/** The choice made on the welcome screen, remembered on this device. */
type Choice = 'signedIn' | 'anonymous';

export interface AuthState {
  ready: boolean;
  /** null => show the welcome screen. */
  choice: Choice | null;
  email: string | null;
  isAnonymous: boolean;
  /** false when no backend is configured in this build. */
  available: boolean;
  account: AccountInfo;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  /** Attach an email to the current anonymous account (keeps the same data). */
  sendClaimCode: (email: string) => Promise<void>;
  verifyClaimCode: (email: string, code: string) => Promise<void>;
  continueWithoutAccount: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function friendly(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/network|fetch/i.test(msg)) return new Error("You're offline. Try again when you're connected.");
  if (/expired|invalid/i.test(msg)) return new Error('That code is wrong or expired. Request a new one.');
  return new Error(msg);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(true);

  const remember = useCallback(async (c: Choice | null) => {
    setChoice(c);
    if (c) await AsyncStorage.setItem(ONBOARD_KEY, c);
    else await AsyncStorage.removeItem(ONBOARD_KEY);
  }, []);

  useEffect(() => {
    (async () => {
      const saved = (await AsyncStorage.getItem(ONBOARD_KEY).catch(() => null)) as Choice | null;
      setChoice(saved);
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        setEmail(user?.email ?? null);
        setIsAnonymous(!user || !!user.is_anonymous);
        // Chose "no account" but the anonymous sign-in couldn't happen yet (e.g. offline): retry quietly.
        if (saved === 'anonymous' && !user) supabase.auth.signInAnonymously().catch(() => {});
        supabase.auth.onAuthStateChange((_event, session) => {
          setEmail(session?.user?.email ?? null);
          setIsAnonymous(!session?.user || !!session.user.is_anonymous);
        });
        setFallbackAuth(async () => (await supabase!.auth.getSession()).data.session?.access_token ?? null);
      }
      setReady(true);
    })();
  }, []);

  const requireBackend = () => {
    if (!supabase) throw new Error("Sign-in isn't set up in this build yet. You can continue without an account.");
    return supabase;
  };

  const value: AuthState = {
    ready, choice, email, isAnonymous,
    available: !!supabase,
    account: { isAnonymous, email },
    sendCode: async (addr) => {
      const { error } = await requireBackend().auth.signInWithOtp({ email: addr.trim(), options: { shouldCreateUser: true } });
      if (error) throw friendly(error);
    },
    verifyCode: async (addr, code) => {
      const { error } = await requireBackend().auth.verifyOtp({ email: addr.trim(), token: code.trim(), type: 'email' });
      if (error) throw friendly(error);
      await remember('signedIn');
    },
    sendClaimCode: async (addr) => {
      const { error } = await requireBackend().auth.updateUser({ email: addr.trim() });
      if (error) throw friendly(error);
    },
    verifyClaimCode: async (addr, code) => {
      const { error } = await requireBackend().auth.verifyOtp({ email: addr.trim(), token: code.trim(), type: 'email_change' });
      if (error) throw friendly(error);
      await remember('signedIn');
    },
    continueWithoutAccount: async () => {
      // Never block on the network: the anonymous account is created when possible.
      if (supabase) supabase.auth.signInAnonymously().catch(() => {});
      await remember('anonymous');
    },
    signOut: async () => {
      if (supabase) await supabase.auth.signOut().catch(() => {});
      await remember(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const a = useContext(AuthContext);
  if (!a) throw new Error('useAuth outside AuthProvider');
  return a;
}
