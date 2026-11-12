import { useCallback, useEffect, useState } from 'react';
import {
  canSwitchPosAppMode,
  createIdleCustomerDisplaySnapshot,
  isCustomerDisplayUrl,
  resolvePosAppMode,
  type Employee,
  type PosAppMode,
  type Shift,
} from '@cgpos/shared';
import { DataProvider, useData } from './lib/app-data';
import { publishCustomerDisplay } from './lib/customer-display';
import { useAsync } from './lib/use-async';
import { SessionCtx, type Session } from './lib/session';
import { useAuth } from './lib/auth';
import { Login } from './screens/Login';
import { Attendance } from './screens/Attendance';
import { clearTickets } from './lib/stations';
import { NoDevice } from './screens/NoDevice';
import { OpenShift } from './screens/OpenShift';
import { Register } from './screens/Register';
import { KitchenDisplay } from './screens/KitchenDisplay';
import { CustomerDisplay } from './screens/CustomerDisplay';
import { CloseShift } from './screens/CloseShift';
import { LockScreen } from './screens/LockScreen';
import { useDevicePrefs } from './lib/device-prefs';
import { useIdleLock } from './lib/idle';

type View = 'register' | 'close' | 'kitchen';

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
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const prefs = useDevicePrefs();

  const login = useCallback(
    async (employee: Employee, requestedMode?: PosAppMode) => {
      const targetMode = resolvePosAppMode(employee.role, prefs.appMode, requestedMode);
      const shift = await data.currentShift();
      setSession({ employee, shift });
      setLock(null);
      setView(targetMode === 'kitchen' ? 'kitchen' : 'register');
    },
    [data, prefs.appMode],
  );
  const logout = useCallback(() => {
    setSession(null);
    setLock(null);
    setAttendanceOpen(false);
    clearTickets();
    if (ctx.status === 'ready') {
      publishCustomerDisplay(
        createIdleCustomerDisplaySnapshot(ctx.data.outletName, {
          outletAddress: ctx.data.address,
          welcomeMessage: ctx.data.receiptHeader,
        }),
      );
    }
  }, [ctx]);
  const lockNow = useCallback(() => setLock('manual'), []);
  useIdleLock({ minutes: prefs.idleLockMinutes, enabled: !!session && !lock, onIdle: () => setLock('idle') });
  const setShift = useCallback((shift: Shift | null) => setSession((s) => (s ? { ...s, shift } : s)), []);

  const isCustomerScreen = typeof window !== 'undefined' && isCustomerDisplayUrl(window.location.search);

  useEffect(() => {
    if (ctx.status === 'ready' && !isCustomerScreen) {
      document.title = `${view === 'kitchen' ? 'Layar Dapur' : 'Kasir'} · ${ctx.data.outletName}`;
    }
  }, [ctx, view, isCustomerScreen]);

  if (ctx.status === 'loading') return <div className="min-h-full grid place-items-center" aria-busy="true"><div className="cg-skeleton" style={{ width: 220, height: 24 }} /></div>;
  if (ctx.status === 'error') return (
    <div className="min-h-full grid place-items-center p-16"><div className="cg-banner cg-banner--danger" role="alert"><span>Data outlet belum bisa dimuat. {ctx.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={ctx.reload}>Coba lagi</button>{auth && <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => void auth.signOut()}>Keluar akun</button>}</div></div>
  );

  if (isCustomerScreen) return <CustomerDisplay ctx={ctx.data} />;

  // data nyata tetapi akun belum punya perangkat kasir: PIN tidak bisa diperiksa tanpa perangkat
  if (ctx.data.deviceCode === '-') return <NoDevice outletName={ctx.data.outletName} />;
  if (!session) {
    return (
      <>
        <Login
          onSuccess={(e, requestedMode) => void login(e, requestedMode)}
          onOpenAttendance={() => setAttendanceOpen(true)}
        />
        {attendanceOpen && <Attendance ctx={ctx.data} onClose={() => setAttendanceOpen(false)} />}
      </>
    );
  }

  const canSwitch = canSwitchPosAppMode(session.employee.role);

  return (
    <SessionCtx.Provider value={{ session, setShift, logout, lock: lockNow }}>
      <div className="min-h-full" inert={!!lock} aria-hidden={!!lock}>
        {view === 'close' ? (
          <CloseShift onCancel={() => setView('register')} onClosed={logout} />
        ) : view === 'kitchen' ? (
          <KitchenDisplay
            ctx={ctx.data}
            canSwitchToRegister={canSwitch}
            onSwitchToRegister={() => setView('register')}
            onOpenAttendance={() => setAttendanceOpen(true)}
            onLock={lockNow}
          />
        ) : !session.shift ? (
          <OpenShift
            employee={session.employee}
            onOpened={setShift}
            onLogout={logout}
            onOpenAttendance={() => setAttendanceOpen(true)}
            defaultCash={ctx.data.settings.defaultOpeningCash}
          />
        ) : (
          <Register
            ctx={ctx.data}
            canOpenKitchen={canSwitch}
            onOpenKitchen={() => setView('kitchen')}
            onOpenAttendance={() => setAttendanceOpen(true)}
            onCloseShift={() => setView('close')}
            onLock={lockNow}
          />
        )}
        {attendanceOpen && <Attendance ctx={ctx.data} onClose={() => setAttendanceOpen(false)} />}
      </div>
      {lock && <LockScreen reason={lock} onUnlock={() => setLock(null)} onSwitch={logout} />}
    </SessionCtx.Provider>
  );
}
