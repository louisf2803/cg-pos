import { useCallback, useState } from 'react';
import { UserRound } from 'lucide-react';
import { ROLE_LABEL, type Employee } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useAsync } from '../lib/use-async';
import { useAuth } from '../lib/auth';
import { PinPad } from './PinPad';



export function Login({ onSuccess }: { onSuccess: (e: Employee) => void }) {
  const data = useData();
  const auth = useAuth();
  const emps = useAsync(() => data.listEmployees(), [data]);
  const [who, setWho] = useState<Employee | null>(null);
  const verify = useCallback((pin: string) => data.verifyPin(who!.id, pin), [data, who]);

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
                      <small>{ROLE_LABEL[e.role]}</small>
                    </button>
                  </li>
                ))}
              </ul>)}
            {auth && (
              <button className="cg-btn cg-btn--ghost cg-btn--sm justify-self-center" onClick={() => void auth.signOut()}>
                Keluar akun perangkat{auth.email ? ` (${auth.email})` : ''}
              </button>
            )}
          </>
        )}

        {who && <PinPad verify={verify} onSuccess={() => onSuccess(who)} onBack={() => setWho(null)} />}
      </div>
    </main>
  );
}
