// App state: the core engine's items/series + settings + UI state, persisted on-device.
// All scheduling rules live in @simpleapp/core; this file only wires them to React.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyEdit, applyOps, fmtDate, handleInputWithFallback, refreshSeries, requestDelete, toggleTask,
  type Choice, type ClaimMoment, type CoreSettings, type EditFields, type EngineContext, type EngineState,
  type Item, type Jump, type Outcome, type Series,
} from '@simpleapp/core';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { fetchFallbackIntent, isFallbackConfigured } from './fallbackClient';
import { palettes, type Palette } from '../theme';

export type CalView = 'day' | 'week' | 'month';

export interface Settings extends CoreSettings {
  theme: 'system' | 'dark' | 'light';
  colorCode: boolean;
  hideCompletedNextDay: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  defaultDuration: 30,
  eventAlerts: [15],
  colorCode: true,
  hideCompletedNextDay: true,
};

interface Persisted {
  version: 1;
  items: Item[];
  series: Series[];
  settings: Settings;
  dismissed: ClaimMoment[];
}

export interface Message {
  id: number;
  text: string;
  choices: Choice[];
  jump: Jump | null;
}

const STORAGE_KEY = 'simpleapp:v1';

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Ticks every 30s so "today", rollover and greetings stay current. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useStoreValue() {
  const now = useNow();
  const systemScheme = useColorScheme();
  const [loaded, setLoaded] = useState(false);
  const [engine, setEngine] = useState<EngineState>({ items: [], series: [], pending: null });
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [dismissed, setDismissed] = useState<ClaimMoment[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [calView, setCalView] = useState<CalView>('day');
  const [viewDate, setViewDate] = useState(() => fmtDate(new Date()));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingTab, setPendingTab] = useState<Jump['tab'] | null>(null);

  // Latest values for async callbacks.
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const msgSeq = useRef(0);

  const ctx = useCallback((): EngineContext => ({ now: new Date(), settings: settingsRef.current, newId }), []);

  // Load once, then extend recurring series' rolling window.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const p = JSON.parse(raw) as Persisted;
          const loadedState: EngineState = { items: p.items ?? [], series: p.series ?? [], pending: null };
          const c: EngineContext = { now: new Date(), settings: { ...DEFAULT_SETTINGS, ...p.settings }, newId };
          setEngine(applyOps(loadedState, refreshSeries(loadedState, c)));
          const { homeMode: _dropped, ...saved } = p.settings as Settings & { homeMode?: unknown };
          setSettingsState({ ...DEFAULT_SETTINGS, ...saved });
          setDismissed(p.dismissed ?? []);
        }
      } catch {
        // Corrupt or unavailable storage: start fresh rather than crash.
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Persist (debounced) after load.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      const p: Persisted = { version: 1, items: engine.items, series: engine.series, settings, dismissed };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [loaded, engine.items, engine.series, settings, dismissed]);

  const apply = useCallback((o: Outcome) => {
    setEngine((s) => ({ ...applyOps(s, o.ops), pending: o.pending }));
    setMessage(o.message ? { id: ++msgSeq.current, text: o.message, choices: o.choices, jump: o.jump } : null);
  }, []);

  const submit = useCallback(async (text: string) => {
    setBusy(true);
    try {
      const o = await handleInputWithFallback(engineRef.current, text, ctx(), {
        online: isFallbackConfigured(),
        fetchIntent: fetchFallbackIntent,
      });
      apply(o);
    } finally {
      setBusy(false);
    }
  }, [apply, ctx]);

  const choose = useCallback((c: Choice) => submit(c.reply), [submit]);

  const dismissMessage = useCallback(() => {
    setMessage(null);
    setEngine((s) => ({ ...s, pending: null }));
  }, []);

  const toggle = useCallback((id: string) => apply(toggleTask(engineRef.current, id, ctx())), [apply, ctx]);

  const saveEdit = useCallback((id: string, fields: EditFields) => {
    apply(applyEdit(engineRef.current, id, fields, ctx()));
    setEditingId(null);
  }, [apply, ctx]);

  const deleteItem = useCallback((id: string) => {
    apply(requestDelete(engineRef.current, id, ctx()));
    setEditingId(null);
  }, [apply, ctx]);

  const jump = useCallback((j: Jump) => {
    setMessage(null);
    if (j.date) {
      setViewDate(j.date);
      setCalView('day');
    }
    setPendingTab(j.tab);
  }, []);

  const setSettings = useCallback((patch: Partial<Settings>) => setSettingsState((s) => ({ ...s, ...patch })), []);
  const dismissClaim = useCallback((m: ClaimMoment) => setDismissed((d) => (d.includes(m) ? d : [...d, m])), []);

  const scheme: 'dark' | 'light' = settings.theme === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : settings.theme;
  const palette: Palette = palettes[scheme];

  return {
    loaded, now, engine, settings, palette, scheme, message, busy, calView, viewDate, editingId, dismissed, pendingTab,
    submit, choose, dismissMessage, toggle, saveEdit, deleteItem, jump, setSettings, dismissClaim,
    setCalView, setViewDate, setEditingId, clearPendingTab: () => setPendingTab(null),
  };
}

export type Store = ReturnType<typeof useStoreValue>;
const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue();
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
