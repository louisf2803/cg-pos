'use client';

import { createTableLayoutSync, DASHBOARD_PREF_KEYS, DASHBOARD_PREFS_DOC, type DataLayer } from '@cgpos/shared';

/**
 * Penyinkron preferensi bisnis dashboard ke server (dokumen organisasi 'dashboard-prefs', migrasi 0144). Perpustakaan penyimpanan
 * (a58/a59/a60-preview, commission-store) tetap menulis ke localStorage; setiap tulisan memanggil `notifyPrefsChanged()` dan isinya
 * dikirim ke server setelah jeda singkat. `PrefsGate` mengambil isi server lebih dulu sebelum halaman membaca localStorage.
 */
let sync: ReturnType<typeof createTableLayoutSync> | null = null;

export function startPrefsSync(data: DataLayer, onState?: (s: 'saving' | 'saved' | 'error') => void) {
  sync = createTableLayoutSync(
    { getTableLayout: () => data.getOrgDoc(DASHBOARD_PREFS_DOC), saveTableLayout: (doc) => data.saveOrgDoc(DASHBOARD_PREFS_DOC, doc) },
    localStorage,
    { keys: DASHBOARD_PREF_KEYS, onState },
  );
}

export function stopPrefsSync() { void sync?.flush(); sync = null; }
export function notifyPrefsChanged() { sync?.push(); }
