'use client';

import { useEffect, type ReactNode } from 'react';
import { DASHBOARD_PREF_KEYS, DASHBOARD_PREFS_DOC, hydrateTableLayout } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { startPrefsSync, stopPrefsSync } from '@/lib/prefs-sync';

/**
 * Ambil preferensi bisnis dari server sebelum halaman membacanya dari localStorage (grup komisi, fasilitas, loyalti, kolom kustom pelanggan, dll.).
 * Server menang; server kosong dan akun pengelola = isi lama peramban ini dikirim sebagai dokumen pertama; server tak terjangkau = salinan lokal dipakai.
 */
export function PrefsGate({ children }: { children: ReactNode }) {
  const data = useData();
  const hyd = useAsync(async () => {
    startPrefsSync(data);
    return hydrateTableLayout(
      { getTableLayout: () => data.getOrgDoc(DASHBOARD_PREFS_DOC), saveTableLayout: (doc) => data.saveOrgDoc(DASHBOARD_PREFS_DOC, doc) },
      localStorage, true, DASHBOARD_PREF_KEYS,
    );
  }, [data]);
  useEffect(() => () => stopPrefsSync(), []);
  if (hyd.status === 'loading') return <div className="grid gap-8" aria-busy="true" aria-label="Memuat"><div className="cg-skeleton" style={{ height: 48 }} /><div className="cg-skeleton" style={{ height: 120 }} /></div>;
  return <>{children}</>;
}
