'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createFakeData, createSupabaseData, type DataLayer } from '@cgpos/shared';
import { supabase } from './backend';
import { AuthCtx, type AuthInfo } from './auth';
import { SignIn } from '@/components/sign-in';

const Ctx = createContext<DataLayer | null>(null);
let fake: DataLayer | null = null;

/**
 * Sumber data dashboard. Dengan env Supabase terisi: wajib masuk akun, lalu data nyata (schema `pos`,
 * dijaga RLS sesuai peran akun). Tanpa env: data palsu di memori.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  if (!supabase) {
    const data = (fake ??= createFakeData({ kitchenDemo: true }));
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
  const data = useMemo(() => (userId ? createSupabaseData(client) : null), [client, userId]);
  const email = session?.user.email ?? '';
  const auth = useMemo<AuthInfo | null>(
    () => (userId ? { email, signOut: async () => { await client.auth.signOut(); } } : null),
    [client, userId, email],
  );

  if (session === undefined) {
    return <div className="min-h-screen grid place-items-center" aria-busy="true"><div className="cg-skeleton" style={{ width: 220, height: 24 }} /></div>;
  }
  if (!data || !auth) return <SignIn client={client} />;
  return <AuthCtx.Provider value={auth}><Ctx.Provider value={data}>{children}</Ctx.Provider></AuthCtx.Provider>;
}

export function useData(): DataLayer {
  const d = useContext(Ctx);
  if (!d) throw new Error('useData dipakai di luar DataProvider');
  return d;
}
