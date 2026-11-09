import { useCallback, useEffect, useState } from 'react';
import type { Employee, Shift } from '@cgpos/shared';
import { DataProvider, useData } from './lib/app-data';
import { useAsync } from './lib/use-async';
import { SessionCtx, type Session } from './lib/session';
import { Login } from './screens/Login';
import { OpenShift } from './screens/OpenShift';
import { Register } from './screens/Register';
import { CloseShift } from './screens/CloseShift';

type View = 'register' | 'close';

export function App() {
  return <DataProvider><Shell /></DataProvider>;
}

function Shell() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>('register');

  const login = useCallback(async (employee: Employee) => {
    const shift = await data.currentShift();
    setSession({ employee, shift });
    setView('register');
  }, [data]);
  const logout = useCallback(() => setSession(null), []);
  const setShift = useCallback((shift: Shift | null) => setSession((s) => (s ? { ...s, shift } : s)), []);

  useEffect(() => { if (ctx.status === 'ready') document.title = `Kasir · ${ctx.data.outletName}`; }, [ctx]);

  if (ctx.status === 'loading') return <div className="min-h-full grid place-items-center" aria-busy="true"><div className="cg-skeleton" style={{ width: 220, height: 24 }} /></div>;
  if (ctx.status === 'error') return (
    <div className="min-h-full grid place-items-center p-16"><div className="cg-banner cg-banner--danger" role="alert"><span>Data outlet belum bisa dimuat. {ctx.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={ctx.reload}>Coba lagi</button></div></div>
  );

  if (!session) return <Login onSuccess={(e) => void login(e)} />;
  return (
    <SessionCtx.Provider value={{ session, setShift, logout }}>
      {view === 'close'
        ? <CloseShift onCancel={() => setView('register')} onClosed={logout} />
        : !session.shift
          ? <OpenShift employee={session.employee} onOpened={setShift} onLogout={logout} />
          : <Register ctx={ctx.data} onCloseShift={() => setView('close')} onLock={logout} />}
    </SessionCtx.Provider>
  );
}
