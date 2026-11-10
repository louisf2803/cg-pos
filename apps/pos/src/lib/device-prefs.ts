import { useSyncExternalStore } from 'react';
import { DEFAULT_IDLE_LOCK_MINUTES, normalizeIdleLock } from '@cgpos/shared';

/** Pengaturan milik perangkat kasir ini (disimpan di perangkat, bukan di server). */
export interface DevicePrefs { idleLockMinutes: number }

const KEY = 'cgpos.device';
const read = (): DevicePrefs => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return { idleLockMinutes: v.idleLockMinutes === undefined ? DEFAULT_IDLE_LOCK_MINUTES : normalizeIdleLock(v.idleLockMinutes) }; }
  catch { return { idleLockMinutes: DEFAULT_IDLE_LOCK_MINUTES }; }
};
let state: DevicePrefs = read();
const listeners = new Set<() => void>();

export const devicePrefs = {
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => state,
  set(patch: Partial<DevicePrefs>) {
    state = { ...state, ...patch, idleLockMinutes: normalizeIdleLock(patch.idleLockMinutes ?? state.idleLockMinutes) };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* penyimpanan boleh gagal */ }
    for (const l of listeners) l();
  },
};
export const useDevicePrefs = () => useSyncExternalStore(devicePrefs.subscribe, devicePrefs.get, devicePrefs.get);
