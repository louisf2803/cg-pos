import { createContext, useContext } from 'react';

export interface AuthInfo { email: string; signOut: () => Promise<void> }

/** Null saat memakai data palsu (tanpa akun). */
export const AuthCtx = createContext<AuthInfo | null>(null);
export const useAuth = () => useContext(AuthCtx);
