import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChefHat, Monitor, UserCheck } from 'lucide-react';
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

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';

/** Jam dan tanggal di panel kiri; diperbarui tiap detik, mengikuti zona waktu outlet. */
function useClock(timezone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  let time = ''; let date = '';
  try {
    time = new Intl.DateTimeFormat('id-ID', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now).replace('.', ':');
    date = new Intl.DateTimeFormat('id-ID', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  } catch { time = now.toTimeString().slice(0, 5); date = now.toDateString(); }
  return { time, date };
}

/** Layar masuk kasir: pilih karyawan, lalu PIN 6 digit. Masuk = membuka kasir. Hak akses dan setelan perangkat menentukan mode kasir atau layar dapur. */
export function Login({
  onSuccess,
  onOpenAttendance,
  outletName,
  outletCode,
  timezone = 'Asia/Jakarta',
}: {
  onSuccess: (e: Employee, requestedMode?: PosAppMode) => void;
  onOpenAttendance?: () => void;
  outletName?: string;
  outletCode?: string;
  timezone?: string;
}) {
  const data = useData();
  const auth = useAuth();
  const prefs = useDevicePrefs();
  const clock = useClock(timezone);
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
  useEffect(() => {
    if (!who) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setWho(null); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [who]);

  const effectiveMode = who
    ? resolvePosAppMode(who.role, prefs.appMode, requestedMode)
    : requestedMode;

  return (
    <div className="cg-auth">
      <aside className="cg-auth__hero cg-auth__hero--pos" aria-label="Outlet dan waktu">
        {outletName && <p className="cg-auth__outlet">{outletName}</p>}
        <p className="cg-auth__clock" aria-live="off">{clock.time}</p>
        <p className="cg-auth__date">{clock.date}</p>
        <p className="cg-auth__meta">CG POS{outletCode ? ` · ${outletCode}` : ''}</p>
      </aside>

      <main className="cg-auth__panel">
        <div className="cg-auth__box">
          {!who && (
            <>
              <header className="cg-auth__head">
                <h1>Siapa yang bertugas?</h1>
                <p>Pilih namamu, lalu masukkan PIN untuk membuka kasir.</p>
              </header>

              <div className="cg-tabs grid grid-cols-2" role="tablist" aria-label="Mode tampilan">
                <button type="button" role="tab" className="cg-tab flex items-center justify-center gap-8" aria-selected={requestedMode === 'register'} onClick={() => setRequestedMode('register')}>
                  <Monitor className="cg-icon cg-icon--xs" aria-hidden />
                  <span>Kasir (POS)</span>
                </button>
                <button type="button" role="tab" className="cg-tab flex items-center justify-center gap-8" aria-selected={requestedMode === 'kitchen'} onClick={() => setRequestedMode('kitchen')}>
                  <ChefHat className="cg-icon cg-icon--xs" aria-hidden />
                  <span>Layar Dapur</span>
                </button>
              </div>

              {emps.status === 'loading' && (
                <div className="cg-staff" aria-busy="true" aria-label="Memuat karyawan">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 118, borderRadius: 12 }} />)}
                </div>
              )}
              {emps.status === 'error' && (
                <div className="cg-banner cg-banner--danger" role="alert">
                  <span>Daftar karyawan gagal dimuat. {emps.message}</span>
                  <button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={emps.reload}>Coba lagi</button>
                </div>
              )}
              {emps.status === 'ready' && (emps.data.length === 0 ? (
                <div className="cg-empty">
                  <h3>Belum ada karyawan</h3>
                  <p>Tambahkan karyawan dari dashboard, lalu sinkronkan perangkat ini.</p>
                </div>
              ) : (
                <ul className="cg-staff" aria-label="Daftar karyawan">
                  {emps.data.map((e) => (
                    <li key={e.id}>
                      <button type="button" onClick={() => setWho(e)} aria-label={`${e.name}, ${ROLE_LABEL[e.role]}`}>
                        <span className="cg-staff__avatar" aria-hidden>{initials(e.name)}</span>
                        <span className="cg-staff__name">{e.name}</span>
                        <span className="cg-staff__role">{ROLE_LABEL[e.role]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ))}

              <div className="grid gap-8">
                {onOpenAttendance && (
                  <button type="button" className="cg-btn cg-btn--secondary w-full flex items-center justify-center gap-8" onClick={onOpenAttendance}>
                    <UserCheck className="cg-icon cg-icon--sm" aria-hidden />
                    <span>Absensi karyawan</span>
                  </button>
                )}
                {auth && (
                  <button className="cg-btn cg-btn--ghost cg-btn--sm justify-self-center" onClick={() => void auth.signOut()}>
                    Keluar akun
                  </button>
                )}
              </div>
            </>
          )}

          {who && (
            <div className="grid gap-16">
              <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm justify-self-start flex items-center gap-8" onClick={() => setWho(null)}>
                <ArrowLeft className="cg-icon cg-icon--sm" aria-hidden /> Ganti karyawan
              </button>
              <div className="cg-who">
                <span className="cg-staff__avatar" aria-hidden>{initials(who.name)}</span>
                <div className="min-w-0">
                  <h1 className="text-lg break-words" style={{ margin: 0 }}>{who.name}</h1>
                  <p className="text-text-muted" style={{ margin: 0 }}>{ROLE_LABEL[who.role]} · masukkan PIN</p>
                </div>
              </div>
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
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
