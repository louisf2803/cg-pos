import { useSyncExternalStore } from 'react';
import { newId, parseDeviceList, type DeviceEntry } from '@cgpos/shared';

/** Daftar perangkat yang dipasangkan ke perangkat kasir ini; disimpan di peramban ini saja (bukan data bisnis). */
const KEY = 'cgpos.devices';
const read = (): DeviceEntry[] => { try { return parseDeviceList(localStorage.getItem(KEY)); } catch { return []; } };
let list: DeviceEntry[] = read();
const listeners = new Set<() => void>();
const commit = (next: DeviceEntry[]) => { list = next; try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* boleh gagal */ } for (const l of listeners) l(); };

export const deviceRegistry = {
  get: () => list,
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  add: (d: Omit<DeviceEntry, 'id' | 'addedAt'>): DeviceEntry => { const e: DeviceEntry = { ...d, id: newId(), addedAt: new Date().toISOString() }; commit([...list, e]); return e; },
  remove: (id: string) => commit(list.filter((d) => d.id !== id)),
};
export const useDeviceRegistry = () => useSyncExternalStore(deviceRegistry.subscribe, deviceRegistry.get, deviceRegistry.get);
