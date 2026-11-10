import { useCallback, useEffect, useState } from 'react';
import type { Employee, Shift } from '@cgpos/shared';
import { DataProvider, useData } from './lib/app-data';
import { useAsync } from './lib/use-async';
import { SessionCtx, type Session } from './lib/session';
import { useAuth } from './lib/auth';
import { Login } from './screens/Login';
import { clearTickets } from './lib/stations';
import { NoDevice } from './screens/NoDevice';
import { OpenShift } from './screens/OpenShift';
import { Register } from './screens/Register';
import { CloseShift } from './screens/CloseShift';
import { LockScreen } from './screens/LockScreen';
import { useDevicePrefs } from './lib/device-prefs';
import { useIdleLock } from './lib/idle';

type View = 'register' | 'close';

export function App() {
  return <DataProvider><Shell /></DataProvider>;
}

function Shell() {
  const data = useData();
  const auth = useAuth();
  const ctx = useAsync(() => data.getContext(), [data]);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>('register');
  const [lock, setLock] = useState<null | 'manual' | 'idle'>(null);
  const prefs = useDevicePrefs();

  const login = useCallback(async (employee: Employee) => {
    const shift = await data.currentShift();
    setSession({ employee, shift });
    setLock(null);
    setView('register');
  }, [data]);
  const logout = useCallback(() => { setSession(null); setLock(null); clearTickets(); }, []);
  const lockNow = useCallback(() => setLock('manual'), []);
  useIdleLock({ minutes: prefs.idleLockMinutes, enabled: !!session && !lock, onIdle: () => setLock('idle') });
  const setShift = useCallback((shift: Shift | null) => setSession((s) => (s ? { ...s, shift } : s)), []);

  useEffect(() => { if (ctx.status === 'ready') document.title = `Kasir · ${ctx.data.outletName}`; }, [ctx]);

  if (ctx.status === 'loading') return <div className="min-h-full grid place-items-center" aria-busy="true"><div className="cg-skeleton" style={{ width: 220, height: 24 }} /></div>;
  if (ctx.status === 'error') return (
    <div className="min-h-full grid place-items-center p-16"><div className="cg-banner cg-banner--danger" role="alert"><span>Data outlet belum bisa dimuat. {ctx.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={ctx.reload}>Coba lagi</button>{auth && <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => void auth.signOut()}>Keluar akun</button>}</div></div>
  );

  // data nyata tetapi akun belum punya perangkat kasir: PIN tidak bisa diperiksa tanpa perangkat
  if (ctx.data.deviceCode === '-') return <NoDevice outletName={ctx.data.outletName} />;
  if (!session) return <Login onSuccess={(e) => void login(e)} />;
  return (
    <SessionCtx.Provider value={{ session, setShift, logout, lock: lockNow }}>
      <div className="min-h-full" inert={!!lock} aria-hidden={!!lock}>
        {view === 'close'
          ? <CloseShift onCancel={() => setView('register')} onClosed={logout} />
          : !session.shift
            ? <OpenShift employee={session.employee} onOpened={setShift} onLogout={logout} defaultCash={ctx.data.settings.defaultOpeningCash} />
            : <Register ctx={ctx.data} onCloseShift={() => setView('close')} onLock={lockNow} />}
      </div>
      {lock && <LockScreen reason={lock} onUnlock={() => setLock(null)} onSwitch={logout} />}
    </SessionCtx.Provider>
  );
}
