import { useCallback, useEffect, useRef, useState } from 'react';
import { Delete } from 'lucide-react';

export const PIN_LEN = 6;
const MAX_TRIES = 5;
const LOCK_SECONDS = 30;

/**
 * Keypad PIN 6 digit dengan papan ketik, batas salah 5 kali lalu tunggu 30 detik.
 * Dipakai layar masuk dan layar kunci. `verify` boleh melempar galat (mis. tak ada koneksi): pesannya ditampilkan.
 */
export function PinPad({ verify, onSuccess, onBack, backLabel = 'Ganti', badPinMessage = 'PIN salah. Coba lagi.', formatError }: {
  verify: (pin: string) => Promise<boolean>; onSuccess: () => void; onBack?: () => void; backLabel?: string;
  badPinMessage?: string; formatError?: (err: unknown) => string;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
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
    if (busy.current) return;
    busy.current = true; setChecking(true);
    try {
      if (await verify(value)) { onSuccess(); return; }
      const n = tries + 1;
      setTries(n); setError(badPinMessage); setPin('');
      if (n >= MAX_TRIES) { setLockedUntil(Date.now() + LOCK_SECONDS * 1000); setNow(Date.now()); setTries(0); setError(''); }
    } catch (e) {
      setPin('');
      setError(formatError ? formatError(e) : `PIN belum bisa diperiksa. ${e instanceof Error ? e.message : ''}`.trim());
    } finally { busy.current = false; setChecking(false); }
  }, [verify, onSuccess, tries, badPinMessage, formatError]);

  const press = useCallback((d: string) => {
    if (locked || checking) return;
    setError('');
    setPin((p) => {
      if (p.length >= PIN_LEN) return p;
      const next = p + d;
      if (next.length === PIN_LEN) queueMicrotask(() => submit(next));
      return next;
    });
  }, [locked, checking, submit]);
  const back = useCallback(() => { setError(''); setPin((p) => p.slice(0, -1)); }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); } // cegah digit terakhir 'bocor' ke isian layar berikutnya
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Escape' && onBack) onBack();
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [press, back, onBack]);

  return (
    <section aria-label="Keypad PIN" className="grid gap-16">
      <div className="cg-pin" data-error={!!error} role="img" aria-label={`${pin.length} dari ${PIN_LEN} digit terisi`}>
        {Array.from({ length: PIN_LEN }, (_, i) => <i key={i} data-filled={i < pin.length} />)}
      </div>
      <p role="status" className="text-center min-h-[24px]">
        {locked
          ? <span className="text-danger-strong">Terlalu banyak salah. Coba lagi dalam {Math.ceil((lockedUntil - now) / 1000)} detik.</span>
          : error ? <span className="text-danger-strong">{error}</span> : null}
      </p>
      <div className="cg-keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)} disabled={locked}>{d}</button>)}
        {onBack ? <button onClick={onBack} className="text-sm" aria-label={backLabel === 'Ganti' ? 'Ganti karyawan' : backLabel}>{backLabel}</button> : <span />}
        <button onClick={() => press('0')} disabled={locked}>0</button>
        <button onClick={back} aria-label="Hapus digit terakhir" disabled={locked}><Delete className="cg-icon" aria-hidden /></button>
      </div>
    </section>
  );
}
