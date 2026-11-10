import { useSyncExternalStore } from 'react';
import { DEFAULT_IDLE_LOCK_MINUTES, normalizeIdleLock } from '@cgpos/shared';

/** Pengaturan milik perangkat kasir ini (disimpan di perangkat, bukan di server). */
/** Cara produk ditampilkan di kasir: kartu bergambar, daftar ringkas, atau mode SKU untuk ritel (cari/scan dulu). */
export type ViewMode = 'grid' | 'list' | 'sku';
export const VIEW_MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'grid', label: 'Kartu bergambar', hint: 'Cocok untuk kafe dan restoran: foto, harga, dan stok di tiap kartu.' },
  { id: 'list', label: 'Daftar ringkas', hint: 'Satu produk satu baris; muat lebih banyak di layar kecil.' },
  { id: 'sku', label: 'Mode SKU (ritel)', hint: 'Produk muncul setelah kode SKU atau nama diketik/dipindai; kolom cari selalu siap.' },
];
export const normalizeViewMode = (v: unknown): ViewMode => (v === 'list' || v === 'sku' ? v : 'grid');
export interface DevicePrefs { idleLockMinutes: number; viewMode: ViewMode }

const KEY = 'cgpos.device';
const read = (): DevicePrefs => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return { idleLockMinutes: v.idleLockMinutes === undefined ? DEFAULT_IDLE_LOCK_MINUTES : normalizeIdleLock(v.idleLockMinutes), viewMode: normalizeViewMode(v.viewMode) }; }
  catch { return { idleLockMinutes: DEFAULT_IDLE_LOCK_MINUTES, viewMode: 'grid' }; }
};
let state: DevicePrefs = read();
const listeners = new Set<() => void>();

export const devicePrefs = {
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => state,
  set(patch: Partial<DevicePrefs>) {
    state = { ...state, ...patch, idleLockMinutes: normalizeIdleLock(patch.idleLockMinutes ?? state.idleLockMinutes), viewMode: normalizeViewMode(patch.viewMode ?? state.viewMode) };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* penyimpanan boleh gagal */ }
    for (const l of listeners) l();
  },
};
export const useDevicePrefs = () => useSyncExternalStore(devicePrefs.subscribe, devicePrefs.get, devicePrefs.get);
