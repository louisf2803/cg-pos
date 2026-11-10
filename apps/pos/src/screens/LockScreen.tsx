import { useCallback, useState } from 'react';
import { Lock } from 'lucide-react';
import { ROLE_LABEL } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { useSession } from '../lib/session';
import { useOnline } from '../lib/online';
import { PinPad } from './PinPad';

/** Menutup seluruh layar; isi di bawahnya (termasuk pesanan yang belum disimpan) tetap ada sampai PIN benar. */
export function LockScreen({ onUnlock, onSwitch, reason }: { onUnlock: () => void; onSwitch: () => void; reason: 'manual' | 'idle' }) {
  const data = useData();
  const { session } = useSession();
  const online = useOnline();
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const verify = useCallback((pin: string) => data.verifyPin(session.employee.id, pin), [data, session.employee.id]);

  return (
    <div className="cg-lock" role="dialog" aria-modal="true" aria-labelledby="lock-title">
      <main className="min-h-full w-full grid place-items-center p-16">
        <div className="w-full max-w-[420px] grid gap-24">
          <header className="text-center grid gap-8 justify-items-center">
            <Lock className="cg-icon" aria-hidden />
            <h1 id="lock-title" className="text-xl">Layar terkunci</h1>
            <p className="text-text-muted">
              {reason === 'idle' ? 'Terkunci otomatis karena tidak dipakai. ' : ''}Masukkan PIN {session.employee.name} ({ROLE_LABEL[session.employee.role]}) untuk melanjutkan.
            </p>
          </header>
          {!online && <p className="cg-banner cg-banner--warning" role="status">Tidak ada koneksi, jadi PIN belum bisa diperiksa. Sambungkan internet lalu coba lagi.</p>}
          {!confirmSwitch ? (
            <>
              <PinPad verify={verify} onSuccess={onUnlock} onBack={() => setConfirmSwitch(true)} backLabel="Ganti kasir" />
            </>
          ) : (
            <div className="grid gap-16">
              <p className="cg-modal__body">Ganti kasir akan keluar dari sesi {session.employee.name}. <strong>Pesanan di layar yang belum disimpan ikut hilang.</strong> Pesanan yang sudah disimpan tetap ada di Daftar Order.</p>
              <div className="cg-modal__actions">
                <button className="cg-btn cg-btn--ghost" onClick={() => setConfirmSwitch(false)}>Kembali</button>
                <button className="cg-btn cg-btn--primary" onClick={onSwitch}>Ganti kasir</button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
