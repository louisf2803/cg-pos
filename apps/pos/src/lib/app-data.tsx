import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createFakeData, createOfflineData, createSupabaseData, type KV, type OfflineData, type PendingEntry } from '@cgpos/shared';
import { supabase } from './backend';
import { AuthCtx, type AuthInfo } from './auth';
import { SignIn } from '../screens/SignIn';

const Ctx = createContext<OfflineData | null>(null);
let fake: OfflineData | null = null;

/** localStorage dengan awalan per akun, supaya antrean milik satu akun tidak terkirim lewat akun lain. */
function storageFor(scope: string): KV {
  return {
    get: (k) => { try { return localStorage.getItem(`${scope}:${k}`); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(`${scope}:${k}`, v); } catch { /* penuh/diblokir */ } },
  };
}

/**
 * Sumber data aplikasi. Dengan env Supabase terisi: wajib masuk akun, lalu data nyata (schema `pos`).
 * Tanpa env: data palsu di memori. Tablet offline-first (antrean lokal + sync_pull) menyusul di Expo.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  if (!supabase) {
    const data = (fake ??= createOfflineData(createFakeData(), { storage: storageFor('fake') }));
    useAutoFlush(data);
    return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
  }
  return <SupabaseGate>{children}</SupabaseGate>;
}

function SupabaseGate({ children }: { children: ReactNode }) {
  const client = supabase!;
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void client.auth.getSession().then(({ data }) => { if (alive) setSession(data.session); });
    const { data: sub } = client.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [client]);

  const userId = session?.user.id;
  const data = useMemo(() => (userId ? createOfflineData(createSupabaseData(client), { storage: storageFor(userId) }) : null), [client, userId]);
  useAutoFlush(data);
  const email = session?.user.email ?? '';
  const auth = useMemo<AuthInfo | null>(
    () => (userId ? { email, signOut: async () => { await client.auth.signOut(); } } : null),
    [client, userId, email],
  );

  if (session === undefined) {
    return <div className="min-h-full grid place-items-center" aria-busy="true"><div className="cg-skeleton" style={{ width: 220, height: 24 }} /></div>;
  }
  if (!data || !auth) return <SignIn client={client} />;
  return <AuthCtx.Provider value={auth}><Ctx.Provider value={data}>{children}</Ctx.Provider></AuthCtx.Provider>;
}

/** Kirim antrean saat koneksi kembali dan secara berkala selama aplikasi terbuka. */
function useAutoFlush(data: OfflineData | null) {
  useEffect(() => {
    if (!data) return;
    const go = () => void data.pending.flush();
    go();
    addEventListener('online', go);
    const t = setInterval(go, 20_000);
    return () => { removeEventListener('online', go); clearInterval(t); };
  }, [data]);
}

export function usePending() {
  const data = useData();
  const [entries, setEntries] = useState<PendingEntry[]>(() => data.pending.list());
  useEffect(() => { setEntries(data.pending.list()); return data.pending.subscribe(() => setEntries(data.pending.list())); }, [data]);
  return { entries, flush: () => data.pending.flush(), retry: (id: string) => data.pending.retry(id), discard: (id: string) => data.pending.discard(id) };
}

export function useData(): OfflineData {
  const d = useContext(Ctx);
  if (!d) throw new Error('useData dipakai di luar DataProvider');
  return d;
}
