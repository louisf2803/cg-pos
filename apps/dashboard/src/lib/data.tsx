'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createFakeData, type DataLayer } from '@cgpos/shared';

const Ctx = createContext<DataLayer | null>(null);
let singleton: DataLayer | null = null;

/** Sementara memakai data palsu di memori. /replica-backend menggantinya dengan createSupabaseData(). */
export function DataProvider({ children }: { children: ReactNode }) {
  const data = useMemo(() => (singleton ??= createFakeData()), []);
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function useData(): DataLayer {
  const d = useContext(Ctx);
  if (!d) throw new Error('useData dipakai di luar DataProvider');
  return d;
}
