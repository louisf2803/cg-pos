import { createContext, useContext } from 'react';
import type { Employee, Shift } from '@cgpos/shared';

export interface Session { employee: Employee; shift: Shift | null }
export const SessionCtx = createContext<{ session: Session; setShift: (s: Shift | null) => void; logout: () => void } | null>(null);
export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useSession dipakai di luar sesi');
  return c;
}
