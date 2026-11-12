import { useCallback, useState } from 'react';
import { ChefHat, Monitor, UserCheck, UserRound } from 'lucide-react';
import {
  canSwitchPosAppMode,
  resolvePosAppMode,
  ROLE_LABEL,
  type Employee,
  type PosAppMode,
} from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAuth } from '../lib/auth';
import { useDevicePrefs } from '../lib/device-prefs';
import { useAsync } from '../lib/use-async';
import { PinPad } from './PinPad';

/** Layar pilih karyawan dengan PIN 6 digit; hak akses dan setelan perangkat menentukan mode kasir atau layar dapur. */
export function Login({
  onSuccess,
  onOpenAttendance,
}: {
  onSuccess: (e: Employee, requestedMode?: PosAppMode) => void;
  onOpenAttendance?: () => void;
}) {
  const data = useData();
  const auth = useAuth();
  const prefs = useDevicePrefs();
  const emps = useAsync(async () => {
    try {
      return await data.listEmployees();
    } catch (err) {
      try {
        const cached = localStorage.getItem('cgpos.offline.cache.listEmployees:[]');
        if (cached) return JSON.parse(cached) as Employee[];
      } catch {
        // abaikan error parsing
      }
      throw err;
    }
  }, [data]);
  const [who, setWho] = useState<Employee | null>(null);
  const [requestedMode, setRequestedMode] = useState<PosAppMode>(() => prefs.appMode);
  const verify = useCallback((pin: string) => data.verifyPin(who!.id, pin), [data, who]);

  const effectiveMode = who
    ? resolvePosAppMode(who.role, prefs.appMode, requestedMode)
    : requestedMode;

  return (
    <main className="min-h-full grid place-items-center p-16">
      <div className="w-full max-w-[420px] grid gap-24">
        <header className="text-center">
          <h1 className="text-xl">CG POS</h1>
          <p className="text-text-muted">{who ? `Masukkan PIN ${who.name}` : 'Siapa yang bertugas sekarang?'}</p>
        </header>

        {!who && (
          <section className="grid gap-12" aria-label="Pilih mode tampilan dan karyawan">
            <div className="cg-tabs grid grid-cols-2" role="tablist" aria-label="Mode tampilan">
              <button
                type="button"
                role="tab"
                className="cg-tab flex items-center justify-center gap-6"
                aria-selected={requestedMode === 'register'}
                onClick={() => setRequestedMode('register')}
              >
                <Monitor className="cg-icon cg-icon--xs" aria-hidden />
                <span>Kasir (POS)</span>
              </button>
              <button
                type="button"
                role="tab"
                className="cg-tab flex items-center justify-center gap-6"
                aria-selected={requestedMode === 'kitchen'}
                onClick={() => setRequestedMode('kitchen')}
              >
                <ChefHat className="cg-icon cg-icon--xs" aria-hidden />
                <span>Layar Dapur</span>
              </button>
            </div>

            {emps.status === 'loading' && (
              <div className="grid gap-8" aria-busy="true">
                <div className="cg-skeleton" style={{ height: 56 }} />
                <div className="cg-skeleton" style={{ height: 56 }} />
              </div>
            )}
            {emps.status === 'error' && (
              <div className="cg-banner cg-banner--danger" role="alert">
                <span>Daftar karyawan gagal dimuat. {emps.message}</span>
                <button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={emps.reload}>
                  Coba lagi
                </button>
              </div>
            )}
            {emps.status === 'ready' && (emps.data.length === 0 ? (
              <div className="cg-empty">
                <h3>Belum ada karyawan</h3>
                <p>Tambahkan karyawan dari dashboard, lalu sinkronkan perangkat ini.</p>
              </div>
            ) : (
              <ul className="grid gap-8">
                {emps.data.map((e) => (
                  <li key={e.id}>
                    <button className="cg-method w-full" onClick={() => setWho(e)}>
                      <UserRound className="cg-icon" aria-hidden />
                      <span className="break-words min-w-0 text-left">{e.name}</span>
                      <small>{ROLE_LABEL[e.role]}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ))}
            {onOpenAttendance && (
              <button
                type="button"
                className="cg-btn cg-btn--secondary w-full flex items-center justify-center gap-8"
                onClick={onOpenAttendance}
              >
                <UserCheck className="cg-icon cg-icon--sm" aria-hidden />
                <span>Absensi karyawan</span>
              </button>
            )}
            {auth && (
              <button
                className="cg-btn cg-btn--ghost cg-btn--sm justify-self-center"
                onClick={() => void auth.signOut()}
              >
                Keluar akun
              </button>
            )}
          </section>
        )}

        {who && (
          <div className="grid gap-12">
            <div className="flex flex-col items-center gap-4 text-xs text-text-muted text-center">
              <span className={`cg-badge ${effectiveMode === 'kitchen' ? 'cg-badge--info' : 'cg-badge--accent'}`}>
                {effectiveMode === 'kitchen' ? 'Masuk ke Layar Dapur (KDS)' : 'Masuk ke Kasir (POS)'}
              </span>
              {!canSwitchPosAppMode(who.role) && requestedMode !== prefs.appMode && (
                <span>
                  Hak akses {ROLE_LABEL[who.role]} mengikuti setelan perangkat (
                  {prefs.appMode === 'kitchen' ? 'Layar Dapur' : 'Kasir POS'}).
                </span>
              )}
            </div>
            <PinPad
              verify={verify}
              onSuccess={() => onSuccess(who, effectiveMode)}
              onBack={() => setWho(null)}
            />
          </div>
        )}
      </div>
    </main>
  );
}
