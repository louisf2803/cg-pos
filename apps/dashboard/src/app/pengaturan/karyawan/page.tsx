'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { pinProblem, type Employee, type ManagedEmployee } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

const ROLE: Record<Employee['role'], string> = { owner: 'Pemilik', manager: 'Manajer', cashier: 'Kasir' };

export default function KaryawanDanAkses() {
  const data = useData();
  const list = useAsync(() => data.listManagedEmployees(), [data]);
  const [target, setTarget] = useState<Employee | null>(null);
  const [edit, setEdit] = useState<ManagedEmployee | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  async function toggle(e: ManagedEmployee) {
    setBusy(e.id); setErr('');
    try { await data.saveEmployee({ id: e.id, name: e.name, role: e.role === 'manager' ? 'manager' : 'cashier', isActive: !e.isActive }); list.reload(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal mengubah status.'); }
    finally { setBusy(null); }
  }
  const [done, setDone] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Karyawan dan akses" subtitle="Tambah karyawan, atur peran, dan atur PIN 6 digit untuk masuk ke kasir"
        actions={<button className="cg-btn cg-btn--primary" onClick={() => setEdit('new')}><Plus className="cg-icon" aria-hidden /> Tambah karyawan</button>} />
      {err && <p role="alert" className="cg-banner cg-banner--danger mb-16">{err}</p>}
      {done && <p role="status" className="cg-banner cg-banner--info mb-16">PIN {done} berhasil diatur. Beri tahu PIN barunya langsung ke yang bersangkutan.</p>}
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {list.status === 'ready' && (list.data.length === 0 ? (
        <div className="cg-empty"><p><strong>Belum ada karyawan.</strong></p><button className="cg-btn cg-btn--primary" onClick={() => setEdit('new')}>Tambah karyawan pertama</button></div>
      ) : (
        <div className="cg-data-wrap">
          <table className="cg-data">
            <thead><tr><th>Nama</th><th>Peran</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
            <tbody>
              {list.data.map((e) => (
                <tr key={e.id} className={e.isActive ? undefined : 'text-text-muted'}>
                  <td className="break-words max-w-[320px]">{e.name} {!e.isActive && <span className="cg-badge">Nonaktif</span>}</td>
                  <td>{ROLE[e.role]}</td>
                  <td className="text-right whitespace-nowrap">
                    {e.role !== 'owner' && <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setEdit(e)} aria-label={`Ubah ${e.name}`}>Ubah</button>}
                    {e.isActive && <button className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => { setDone(null); setTarget(e); }} aria-label={`Atur PIN ${e.name}`}>
                      <KeyRound className="cg-icon cg-icon--sm" aria-hidden /> Atur PIN
                    </button>}
                    {e.role !== 'owner' && <button className="cg-btn cg-btn--ghost cg-btn--sm" disabled={busy === e.id} onClick={() => void toggle(e)} aria-label={`${e.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${e.name}`}>{e.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {edit && <EmployeeDialog employee={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
      {target && <PinDialog employee={target} onClose={() => setTarget(null)} onSaved={() => { setDone(target.name); setTarget(null); }} />}
    </>
  );
}

function PinDialog({ employee, onClose, onSaved }: { employee: Employee; onClose: () => void; onSaved: () => void }) {
  const data = useData();
  const ref = useRef<HTMLDialogElement>(null);
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = pinProblem(pin);
    if (problem) return setError(problem);
    if (pin !== again) return setError('Kedua isian PIN tidak sama.');
    setBusy(true); setError(null);
    try { await data.setEmployeePin(employee.id, pin); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'PIN gagal disimpan.'); setBusy(false); }
  }

  return (
    <dialog ref={ref} className="cg-modal" aria-labelledby="judul-pin" onClose={onClose} style={{ margin: 'auto' }}>
      <form onSubmit={submit} className="grid gap-16">
        <h2 id="judul-pin" className="cg-modal__title">Atur PIN: {employee.name}</h2>
        <p className="cg-modal__body">PIN lama (kalau ada) akan diganti. PIN tidak bisa dilihat lagi setelah disimpan, hanya bisa diganti.</p>
        <div className="cg-field">
          <label className="cg-label" htmlFor="pin-baru">PIN baru (6 digit)</label>
          <input id="pin-baru" className="cg-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} autoFocus required
            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="pin-ulang">Ulangi PIN</label>
          <input id="pin-ulang" className="cg-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} required
            value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))} />
        </div>
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy || pin.length !== 6 || again.length !== 6}>{busy ? 'Menyimpan…' : 'Simpan PIN'}</button>
        </div>
      </form>
    </dialog>
  );
}

function EmployeeDialog({ employee, onClose, onSaved }: { employee?: ManagedEmployee; onClose: () => void; onSaved: () => void }) {
  const data = useData();
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(employee?.name ?? '');
  const [role, setRole] = useState<'manager' | 'cashier'>(employee?.role === 'manager' ? 'manager' : 'cashier');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError('Nama karyawan wajib diisi.');
    setBusy(true); setError(null);
    try { await data.saveEmployee({ id: employee?.id, name, role }); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Gagal menyimpan.'); setBusy(false); }
  }

  return (
    <dialog ref={ref} className="cg-modal" aria-labelledby="judul-karyawan" onClose={onClose} style={{ margin: 'auto' }}>
      <form onSubmit={submit} className="grid gap-16" noValidate>
        <h2 id="judul-karyawan" className="cg-modal__title">{employee ? 'Ubah karyawan' : 'Tambah karyawan'}</h2>
        <div className="cg-field">
          <label className="cg-label" htmlFor="nama-karyawan">Nama</label>
          <input id="nama-karyawan" className="cg-input" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="cg-field">
          <label className="cg-label" htmlFor="peran-karyawan">Peran</label>
          <select id="peran-karyawan" className="cg-input" value={role} onChange={(e) => setRole(e.target.value as 'manager' | 'cashier')}>
            <option value="cashier">Kasir: menjual dan menerima pembayaran</option>
            <option value="manager">Manajer: juga menyetujui pembatalan dan mengelola data</option>
          </select>
        </div>
        {!employee && <p className="text-text-muted text-sm">Setelah disimpan, atur PIN 6 digitnya lewat tombol “Atur PIN” agar bisa masuk ke kasir.</p>}
        <p role="alert" className="min-h-[24px] text-danger-strong">{error}</p>
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </dialog>
  );
}
