import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, Settings } from '../data/Settings';

const STORAGE_KEY = 'appSettings';

/* ------------ helpers ----------------- */
function readStorage(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}
function writeStorage(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/* ------------ reactive store ------------ */
// naive pub-sub
let current = readStorage();
let listeners: (() => void)[] = [];

function setSettings(partial: Partial<Settings>) {
  current = { ...current, ...partial };
  writeStorage(current);
  listeners.forEach((fn) => fn());
}

/* ------------ React hook ---------------- */
export function useSettings() {
  // subscribe/unsubscribe
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.push(cb);
      return () => (listeners = listeners.filter((l) => l !== cb));
    },
    () => current,
  );

  return {
    settings: snapshot,
    setSettings,            // partial updater
  };
}
