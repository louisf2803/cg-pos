import { useSyncExternalStore } from 'react';
import {
  DEFAULT_IDLE_LOCK_MINUTES,
  normalizeIdleLock,
  normalizePosAppMode,
  type PosAppMode,
} from '@cgpos/shared';

/** Pengaturan milik perangkat kasir ini (disimpan di perangkat, bukan di server). */
/** Cara produk ditampilkan di kasir: kartu bergambar, daftar ringkas, atau mode SKU untuk ritel (cari/scan dulu). */
export type ViewMode = 'grid' | 'list' | 'sku';
export const VIEW_MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'grid', label: 'Kartu bergambar', hint: 'Cocok untuk kafe dan restoran: foto, harga, dan stok di tiap kartu.' },
  { id: 'list', label: 'Daftar ringkas', hint: 'Satu produk satu baris; muat lebih banyak di layar kecil.' },
  { id: 'sku', label: 'Mode SKU (ritel)', hint: 'Produk muncul setelah kode SKU atau nama diketik/dipindai; kolom cari selalu siap.' },
];
export const APP_MODES: { id: PosAppMode; label: string; hint: string }[] = [
  { id: 'register', label: 'Kasir (POS)', hint: 'Masuk ke kasir penjualan dan manajemen meja (perlu buka shift).' },
  { id: 'kitchen', label: 'Layar Dapur (KDS)', hint: 'Tablet khusus dapur/bar: langsung membuka papan tiket per stasiun tanpa buka laci kas.' },
];
export const normalizeViewMode = (v: unknown): ViewMode => (v === 'list' || v === 'sku' ? v : 'grid');
export interface DevicePrefs {
  idleLockMinutes: number;
  viewMode: ViewMode;
  appMode: PosAppMode;
  kitchenStationId: string;
}

const KEY = 'cgpos.device';
const normalizeStation = (v: unknown): string => (typeof v === 'string' && v.trim() ? v.trim() : 'all');
const read = (): DevicePrefs => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      idleLockMinutes: v.idleLockMinutes === undefined ? DEFAULT_IDLE_LOCK_MINUTES : normalizeIdleLock(v.idleLockMinutes),
      viewMode: normalizeViewMode(v.viewMode),
      appMode: normalizePosAppMode(v.appMode),
      kitchenStationId: normalizeStation(v.kitchenStationId),
    };
  } catch {
    return {
      idleLockMinutes: DEFAULT_IDLE_LOCK_MINUTES,
      viewMode: 'grid',
      appMode: 'register',
      kitchenStationId: 'all',
    };
  }
};
let state: DevicePrefs = read();
const listeners = new Set<() => void>();

export const devicePrefs = {
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => state,
  set(patch: Partial<DevicePrefs>) {
    state = {
      ...state,
      ...patch,
      idleLockMinutes: normalizeIdleLock(patch.idleLockMinutes ?? state.idleLockMinutes),
      viewMode: normalizeViewMode(patch.viewMode ?? state.viewMode),
      appMode: normalizePosAppMode(patch.appMode ?? state.appMode),
      kitchenStationId: normalizeStation(patch.kitchenStationId ?? state.kitchenStationId),
    };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* penyimpanan boleh gagal */ }
    for (const l of listeners) l();
  },
};
export const useDevicePrefs = () => useSyncExternalStore(devicePrefs.subscribe, devicePrefs.get, devicePrefs.get);
