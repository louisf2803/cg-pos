import { useState, type FormEvent } from 'react';
import { DataError, formatRp, newId, parseRp, type Employee, type Shift } from '@cgpos/shared';
import { useData } from '../lib/app-data';
import { Modal } from '../ui';

const PRESETS = [0, 100_000, 200_000, 500_000];

export function OpenShift({ employee, onOpened, onLogout, onOpenAttendance, defaultCash }: { employee: Employee; onOpened: (s: Shift) => void; onLogout: () => void; onOpenAttendance?: () => void; defaultCash?: number | null }) {
  const data = useData();
  const [raw, setRaw] = useState(defaultCash != null ? String(defaultCash) : '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/\d/.test(raw)) { setErr('Isi modal awal. Kalau laci kosong, isi 0.'); return; }
    setSaving(true); setErr('');
    try { onOpened(await data.openShift({ id: newId(), cashierId: employee.id, openingCash: parseRp(raw) })); }
    catch (x) { setErr(x instanceof DataError || x instanceof Error ? x.message : 'Gagal membuka kasir.'); setSaving(false); }
  }

  return (
    <Modal title="Buka kasir" labelledBy="buka-kasir-title">
      <form onSubmit={submit} noValidate className="grid gap-16">
        <p className="text-text-muted">Halo, {employee.name}. Hitung uang di laci, lalu isi sebagai modal awal.</p>
        <div className="cg-field">
          <label className="cg-label" htmlFor="modal">Modal awal (Rp)</label>
          <input id="modal" className="cg-input" inputMode="numeric" data-autofocus value={raw} onChange={(e) => { setRaw(e.target.value); setErr(''); }} aria-invalid={!!err} aria-describedby={err ? 'e-modal' : undefined} />
          {defaultCash != null && <p className="text-text-muted text-sm">Terisi dari pengaturan outlet ({formatRp(defaultCash)}). Hitung laci, ubah bila berbeda.</p>}
          {err && <p id="e-modal" className="cg-error" role="alert">{err}</p>}
        </div>
        <div className="flex flex-wrap gap-8" role="group" aria-label="Nominal cepat">
          {PRESETS.map((p) => <button type="button" key={p} className="cg-chip" aria-pressed={parseRp(raw) === p && raw !== ''} onClick={() => { setRaw(String(p)); setErr(''); }}>{p === 0 ? 'Rp 0' : formatRp(p)}</button>)}
        </div>
        <button className="cg-btn cg-btn--primary cg-btn--lg cg-btn--block" disabled={saving}>{saving ? 'Membuka…' : 'Buka kasir'}</button>
        {onOpenAttendance && (
          <button type="button" className="cg-btn cg-btn--secondary cg-btn--block" onClick={onOpenAttendance}>
            Absensi karyawan
          </button>
        )}
        <button type="button" className="cg-btn cg-btn--ghost cg-btn--block" onClick={onLogout}>Bukan saya, ganti karyawan</button>
      </form>
    </Modal>
  );
}
