import { useCallback, useEffect, useRef, useState } from 'react';
import { Delete, UserRound } from 'lucide-react';
import type { Employee } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';

const PIN_LEN = 6;
const MAX_TRIES = 5;
const LOCK_SECONDS = 30;

const ROLE: Record<Employee['role'], string> = { owner: 'Pemilik', manager: 'Manajer', cashier: 'Kasir' };

export function Login({ onSuccess }: { onSuccess: (e: Employee) => void }) {
  const data = useData();
  const emps = useAsync(() => data.listEmployees(), [data]);
  const [who, setWho] = useState<Employee | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [tries, setTries] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);

  const locked = lockedUntil > now;
  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [locked]);

  const submit = useCallback(async (value: string) => {
    if (!who || busy.current) return;
    busy.current = true; setChecking(true);
    try {
      const ok = await data.verifyPin(who.id, value);
      if (ok) { onSuccess(who); return; }
      const n = tries + 1;
      setTries(n); setError(true); setPin('');
      if (n >= MAX_TRIES) { setLockedUntil(Date.now() + LOCK_SECONDS * 1000); setNow(Date.now()); setTries(0); }
    } finally { busy.current = false; setChecking(false); }
  }, [who, data, onSuccess, tries]);

  const press = useCallback((d: string) => {
    if (locked || checking) return;
    setError(false);
    setPin((p) => {
      if (p.length >= PIN_LEN) return p;
      const next = p + d;
      if (next.length === PIN_LEN) queueMicrotask(() => submit(next));
      return next;
    });
  }, [locked, checking, submit]);
  const back = useCallback(() => { setError(false); setPin((p) => p.slice(0, -1)); }, []);

  useEffect(() => {
    if (!who) return;
    const k = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); } // cegah digit terakhir 'bocor' ke isian layar berikutnya
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Escape') { setWho(null); setPin(''); setError(false); }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [who, press, back]);

  return (
    <main className="min-h-full grid place-items-center p-16">
      <div className="w-full max-w-[420px] grid gap-24">
        <header className="text-center">
          <h1 className="text-xl">CG POS</h1>
          <p className="text-text-muted">{who ? `Masukkan PIN ${who.name}` : 'Siapa yang bertugas sekarang?'}</p>
        </header>

        {!who && (
          <>
            {emps.status === 'loading' && <div className="grid gap-8" aria-busy="true"><div className="cg-skeleton" style={{ height: 56 }} /><div className="cg-skeleton" style={{ height: 56 }} /></div>}
            {emps.status === 'error' && <div className="cg-banner cg-banner--danger" role="alert"><span>Daftar karyawan gagal dimuat. {emps.message}</span><button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={emps.reload}>Coba lagi</button></div>}
            {emps.status === 'ready' && (emps.data.length === 0
              ? <div className="cg-empty"><h3>Belum ada karyawan</h3><p>Tambahkan karyawan dari dashboard, lalu sinkronkan perangkat ini.</p></div>
              : <ul className="grid gap-8">
                {emps.data.map((e) => (
                  <li key={e.id}>
                    <button className="cg-method w-full" onClick={() => setWho(e)}>
                      <UserRound className="cg-icon" aria-hidden />
                      <span className="break-words min-w-0 text-left">{e.name}</span>
                      <small>{ROLE[e.role]}</small>
                    </button>
                  </li>
                ))}
              </ul>)}
          </>
        )}

        {who && (
          <section aria-label="Keypad PIN" className="grid gap-16">
            <div className="cg-pin" data-error={error} role="img" aria-label={`${pin.length} dari ${PIN_LEN} digit terisi`}>
              {Array.from({ length: PIN_LEN }, (_, i) => <i key={i} data-filled={i < pin.length} />)}
            </div>
            <p role="status" className="text-center min-h-[24px]">
              {locked
                ? <span className="text-danger-strong">Terlalu banyak salah. Coba lagi dalam {Math.ceil((lockedUntil - now) / 1000)} detik.</span>
                : error ? <span className="text-danger-strong">PIN salah. Coba lagi.</span> : null}
            </p>
            <div className="cg-keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)} disabled={locked}>{d}</button>)}
              <button onClick={() => { setWho(null); setPin(''); setError(false); }} className="text-sm" aria-label="Ganti karyawan">Ganti</button>
              <button onClick={() => press('0')} disabled={locked}>0</button>
              <button onClick={back} aria-label="Hapus digit terakhir" disabled={locked}><Delete className="cg-icon" aria-hidden /></button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
