import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, Settings } from '../data/Settings';
import { RequestApi } from './apiUtils';

const STORAGE_KEY = 'appSettings';

function cacheRead(): Settings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function cacheWrite(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

let current: Settings = cacheRead() ?? DEFAULT_SETTINGS;
let listeners: (() => void)[] = [];
function notify() {
  listeners.forEach((fn) => fn());
}

let loadedThisSession = false;

/** Fetch settings from the server once per app session (called after login /
 *  on first page needing them). Later reads use the local cache only. */
export async function ensureSettingsLoaded() {
  if (loadedThisSession) return;
  await refreshSettings();
}

export async function refreshSettings() {
  loadedThisSession = true;
  try {
    const res = await RequestApi('settings');
    if (!res.ok) return;
    current = { ...DEFAULT_SETTINGS, ...(await res.json()) };
    cacheWrite(current);
    notify();
  } catch (err) {
    console.warn('settings: fetch failed → using cache', err);
  }
}

export async function setSettings(partial: Partial<Settings>) {
  const next = { ...current, ...partial };
  try {
    await RequestApi('settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
  } catch (err) {
    console.warn('settings: PUT failed → keeping local change', err);
  }
  current = next;
  cacheWrite(current);
  notify();
}

export const settings: Settings = new Proxy({} as Settings, {
  get(_, prop) {
    return (current as any)[prop];
  },
}) as Settings;

export function useSettings() {
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.push(cb);
      return () => (listeners = listeners.filter((l) => l !== cb));
    },
    () => current,
  );
  return { settings: snapshot, setSettings };
}
