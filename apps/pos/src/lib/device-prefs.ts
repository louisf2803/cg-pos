import { useSyncExternalStore } from 'react';
import {
  DEFAULT_IDLE_LOCK_MINUTES,
  normalizeIdleLock,
  normalizePosAppMode,
  type PosAppMode,
} from '@cgpos/shared';

/** Pengaturan milik perangkat kasir ini (disimpan di perangkat, bukan di server). */
/** Cara produk ditampilkan di kasir: kartu bergambar, daftar ringkas, mode meja, atau mode jasa. Mode SKU dibuang. */
export type ViewMode = 'grid' | 'list' | 'table' | 'service' | 'sku';
export const VIEW_MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'grid', label: 'Kartu bergambar', hint: 'Cocok untuk kafe dan restoran: foto, harga, dan stok di tiap kartu.' },
  { id: 'list', label: 'Daftar ringkas', hint: 'Satu produk satu baris; muat lebih banyak di layar kecil.' },
  { id: 'table', label: 'Mode Meja', hint: 'Alur kasir berbasis meja makan di tempat.' },
  { id: 'service', label: 'Mode Jasa', hint: 'Alur kasir berbasis layanan jasa: otomatis mengarahkan ke jenis pesanan Jasa.' },
];
export const APP_MODES: { id: PosAppMode; label: string; hint: string }[] = [
  { id: 'register', label: 'Kasir (POS)', hint: 'Masuk ke kasir penjualan dan manajemen meja (perlu buka shift).' },
  { id: 'kitchen', label: 'Layar Dapur (KDS)', hint: 'Tablet khusus dapur/bar: langsung membuka papan tiket per stasiun tanpa buka laci kas.' },
];
export const normalizeViewMode = (v: unknown): ViewMode => {
  if (v === 'list' || v === 'table' || v === 'service') return v;
  return 'grid';
};

export type LocalServerRole = 'cloud' | 'master' | 'client';
export const LOCAL_SERVER_ROLES: { id: LocalServerRole; label: string; hint: string }[] = [
  { id: 'cloud', label: 'Cloud Langsung', hint: 'Perangkat terhubung langsung ke server pusat (Supabase) via internet.' },
  { id: 'master', label: 'Master Server Lokal', hint: 'Perangkat ini bertindak sebagai server utama di outlet untuk melayani kasir/KDS lain saat internet offline.' },
  { id: 'client', label: 'Klien Server Lokal', hint: 'Perangkat ini terhubung ke kasir master di outlet via jaringan lokal (Wi-Fi/LAN).' },
];
export const normalizeLocalServerRole = (v: unknown): LocalServerRole => (v === 'master' || v === 'client' ? v : 'cloud');

export interface DevicePrefs {
  idleLockMinutes: number;
  viewMode: ViewMode;
  appMode: PosAppMode;
  kitchenStationId: string;
  localServerRole: LocalServerRole;
  localServerHost: string;
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
      localServerRole: normalizeLocalServerRole(v.localServerRole),
      localServerHost: typeof v.localServerHost === 'string' ? v.localServerHost : '',
    };
  } catch {
    return {
      idleLockMinutes: DEFAULT_IDLE_LOCK_MINUTES,
      viewMode: 'grid',
      appMode: 'register',
      kitchenStationId: 'all',
      localServerRole: 'cloud',
      localServerHost: '',
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
      localServerRole: normalizeLocalServerRole(patch.localServerRole ?? state.localServerRole),
      localServerHost: typeof (patch.localServerHost ?? state.localServerHost) === 'string' ? (patch.localServerHost ?? state.localServerHost).trim() : '',
    };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* penyimpanan boleh gagal */ }
    for (const l of listeners) l();
  },
};
export const useDevicePrefs = () => useSyncExternalStore(devicePrefs.subscribe, devicePrefs.get, devicePrefs.get);
