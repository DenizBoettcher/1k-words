import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, Settings } from '../data/Settings';
import { RequestApi } from './apiUtils';

const STORAGE_KEY = 'appSettings';

/* ---------- helpers: local cache ----------------------- */
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

/* ---------- store + pub-sub ----------------------------- */
let current: Settings = cacheRead() ?? DEFAULT_SETTINGS;
let listeners: (() => void)[] = [];

function notify() {
  listeners.forEach((fn) => fn());
}

/* ---------- API sync ------------------------------------ */
async function fetchFromServer() {
  try {
    const res = await RequestApi(`settings`);

    current = { ...DEFAULT_SETTINGS, ...(await res.json()) };
    cacheWrite(current);
    notify();
  } catch (err) {
    console.warn('settings: fetch failed → using cache', err);
  }
}
fetchFromServer(); // fire once at module load

export async function setSettings(partial: Partial<Settings>) {
  const next = { ...current, ...partial };

  /* 1. persist to backend */
  try {
    await RequestApi(`settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });

  } catch (err) {
    console.warn('settings: PUT failed → keeping local change', err);
  }

  /* 2. update in-memory + cache + notify */
  current = next;
  cacheWrite(current);
  notify();
}

/* ---------- export: live proxy -------------------------- */
export const settings: Settings = new Proxy({} as Settings, {
  get(_, prop) {
    return (current as any)[prop];
  },
}) as Settings;

/* ---------- React hook ---------------------------------- */
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