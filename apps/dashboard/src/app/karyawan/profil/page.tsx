'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { IdCard, Landmark, Pencil, Search, UserCheck } from 'lucide-react';
import {
  EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABEL, employeeProfileProblem, profileCompleteness,
  type EmployeeProfile, type EmployeeProfileInput, type EmploymentType, type ManagedEmployee,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import { useDialog, fmtDate } from '@/components/fin-common';

const BANKS = ['BCA', 'BRI', 'BNI', 'Mandiri', 'BSI', 'CIMB Niaga', 'Permata', 'Danamon', 'Jago', 'SeaBank', 'DANA', 'GoPay', 'OVO'];
const maskAccount = (n?: string) => (n ? `••••${n.slice(-4)}` : '');

export default function ProfilKepegawaianPage() {
  const data = useData();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<ManagedEmployee | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const state = useAsync(async () => {
    const [employees, profiles] = await Promise.all([data.listManagedEmployees(), data.listEmployeeProfiles()]);
    return { employees, profiles: new Map(profiles.map((p) => [p.employeeId, p])) };
  }, [data]);

  const rows = useMemo(() => {
    if (state.status !== 'ready') return [];
    const needle = q.trim().toLowerCase();
    return state.data.employees.filter((e) => !needle || e.name.toLowerCase().includes(needle));
  }, [state, q]);

  const stats = useMemo(() => {
    if (state.status !== 'ready') return { total: 0, complete: 0, noBank: 0 };
    const all = state.data.employees;
    return {
      total: all.length,
      complete: all.filter((e) => { const c = profileCompleteness(state.data.profiles.get(e.id)); return c.done === c.total; }).length,
      noBank: all.filter((e) => !state.data.profiles.get(e.id)?.bankAccountNumber).length,
    };
  }, [state]);

  return (
    <div className="space-y-24 max-w-full">
      <PageHeader
        title="Profil kepegawaian"
        subtitle="Data diri, tanggal bergabung, tipe pekerjaan, dan rekening bank untuk transfer gaji. Hanya pemilik dan manajer yang dapat melihatnya."
      />

      {notice && <div role="status" className="cg-banner cg-banner--success flex items-center justify-between"><span>{notice}</span><button type="button" className="text-xs font-semibold underline ml-12" onClick={() => setNotice(null)}>Tutup</button></div>}
      {state.status === 'error' && <div role="alert" className="cg-banner cg-banner--danger"><span>{state.message}</span><button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={state.reload}>Coba lagi</button></div>}

      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-16">
        <div className="cg-card p-16 flex items-center gap-16">
          <div className="w-48 h-48 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0"><IdCard className="cg-icon" aria-hidden /></div>
          <div className="min-w-0"><p className="text-xs text-text-muted m-0">Karyawan</p><p className="text-xl font-bold cg-num m-0">{stats.total}</p></div>
        </div>
        <div className="cg-card p-16 flex items-center gap-16">
          <div className="w-48 h-48 rounded-xl bg-success/10 flex items-center justify-center text-success shrink-0"><UserCheck className="cg-icon" aria-hidden /></div>
          <div className="min-w-0"><p className="text-xs text-text-muted m-0">Profil lengkap</p><p className="text-xl font-bold cg-num m-0">{stats.complete}</p></div>
        </div>
        <div className="cg-card p-16 flex items-center gap-16">
          <div className="w-48 h-48 rounded-xl bg-warning/10 flex items-center justify-center text-warning shrink-0"><Landmark className="cg-icon" aria-hidden /></div>
          <div className="min-w-0"><p className="text-xs text-text-muted m-0">Belum ada rekening</p><p className="text-xl font-bold cg-num m-0">{stats.noBank}</p></div>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="cg-icon cg-icon--sm absolute left-12 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
        <input type="search" className="cg-input pl-[36px] text-sm w-full" placeholder="Cari nama karyawan..." aria-label="Cari nama karyawan" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {state.status === 'loading' && <div className="cg-card p-24 space-y-12" aria-busy="true"><div className="cg-skeleton h-40 w-full" /><div className="cg-skeleton h-40 w-full" /><div className="cg-skeleton h-40 w-full" /></div>}

      {state.status === 'ready' && (rows.length === 0 ? (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
          <p className="font-bold m-0">{state.data.employees.length === 0 ? 'Belum ada karyawan' : 'Tidak ada karyawan yang cocok'}</p>
          <p className="text-sm text-text-muted m-0">{state.data.employees.length === 0 ? 'Tambahkan karyawan di Daftar karyawan.' : 'Coba kata kunci lain.'}</p>
        </div>
      ) : (
        <div className="cg-card overflow-hidden">
          <div className="overflow-x-auto min-w-0">
            <table className="cg-data w-full">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs font-semibold text-text-muted">
                  <th className="py-12 px-16">Karyawan</th>
                  <th className="py-12 px-16">Tipe</th>
                  <th className="py-12 px-16">Bergabung</th>
                  <th className="py-12 px-16">Telepon</th>
                  <th className="py-12 px-16">Rekening</th>
                  <th className="py-12 px-16">Kelengkapan</th>
                  <th className="py-12 px-16 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const p = state.data.profiles.get(e.id);
                  const c = profileCompleteness(p);
                  return (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-surface/50">
                      <td className="py-12 px-16 font-medium">{e.name}</td>
                      <td className="py-12 px-16 text-sm">{p?.employmentType ? EMPLOYMENT_TYPE_LABEL[p.employmentType] : <span className="text-text-muted">-</span>}</td>
                      <td className="py-12 px-16 text-sm">{p?.joinDate ? fmtDate(p.joinDate) : <span className="text-text-muted">-</span>}</td>
                      <td className="py-12 px-16 text-sm">{p?.phone ?? <span className="text-text-muted">-</span>}</td>
                      <td className="py-12 px-16 text-sm">{p?.bankAccountNumber ? `${p.bankName} ${maskAccount(p.bankAccountNumber)}` : <span className="text-text-muted">Belum diisi</span>}</td>
                      <td className="py-12 px-16"><span className={`cg-badge ${c.done === c.total ? 'cg-badge--accent' : ''} cg-num`}>{c.done}/{c.total}</span></td>
                      <td className="py-12 px-16 text-right">
                        <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Ubah profil ${e.name}`} onClick={() => setEditing(e)}>
                          <Pencil className="cg-icon cg-icon--sm" aria-hidden /> Ubah
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {editing && state.status === 'ready' && (
        <ProfileDialog
          employee={editing}
          profile={state.data.profiles.get(editing.id)}
          onClose={() => setEditing(null)}
          onSaved={() => { const n = editing.name; setEditing(null); setNotice(`Profil ${n} tersimpan.`); state.reload(); }}
        />
      )}
    </div>
  );
}

function ProfileDialog({ employee, profile, onClose, onSaved }: { employee: ManagedEmployee; profile?: EmployeeProfile; onClose: () => void; onSaved: () => void }) {
  const data = useData();
  const dlg = useDialog(onClose);
  const [f, setF] = useState({
    nik: profile?.nik ?? '', phone: profile?.phone ?? '', email: profile?.email ?? '', address: profile?.address ?? '', joinDate: profile?.joinDate ?? '',
    employmentType: (profile?.employmentType ?? '') as EmploymentType | '', bankName: profile?.bankName ?? '', bankAccountNumber: profile?.bankAccountNumber ?? '', bankAccountHolder: profile?.bankAccountHolder ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setErr(null); setF((s) => ({ ...s, [k]: e.target.value })); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const input: EmployeeProfileInput = {
      employeeId: employee.id, nik: f.nik || null, phone: f.phone || null, email: f.email || null, address: f.address || null, joinDate: f.joinDate || null,
      employmentType: f.employmentType || null, bankName: f.bankName || null, bankAccountNumber: f.bankAccountNumber || null, bankAccountHolder: f.bankAccountHolder || null,
    };
    const problem = employeeProfileProblem(input);
    if (problem) { setErr(problem); return; }
    setSaving(true);
    try { await data.saveEmployeeProfile(input); onSaved(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan profil.'); setSaving(false); }
  }

  const field = (id: string, label: string, el: React.ReactNode) => (<div className="cg-field"><label className="cg-label" htmlFor={id}>{label}</label>{el}</div>);

  return (
    <dialog {...dlg.props} aria-labelledby="profil-title" className="cg-modal w-full">
      <form onSubmit={(e) => void submit(e)} className="space-y-16">
        <h2 id="profil-title" className="cg-modal__title">Profil {employee.name}</h2>
        {err && <div role="alert" className="cg-banner cg-banner--danger"><span>{err}</span></div>}

        <fieldset className="grid grid-cols-1 tablet:grid-cols-2 gap-16 border-0 p-0 m-0 min-w-0">
          <legend className="text-xs font-semibold text-text-muted mb-8">Data diri</legend>
          {field('pf-nik', 'NIK / No. KTP', <input id="pf-nik" className="cg-input" inputMode="numeric" maxLength={32} value={f.nik} onChange={set('nik')} />)}
          {field('pf-hp', 'Telepon / WhatsApp', <input id="pf-hp" className="cg-input" inputMode="tel" maxLength={24} value={f.phone} onChange={set('phone')} />)}
          {field('pf-email', 'Email', <input id="pf-email" className="cg-input" type="email" maxLength={120} value={f.email} onChange={set('email')} />)}
          {field('pf-join', 'Tanggal bergabung', <input id="pf-join" className="cg-input" type="date" value={f.joinDate} onChange={set('joinDate')} />)}
          {field('pf-type', 'Tipe pekerjaan', (
            <select id="pf-type" className="cg-input" value={f.employmentType} onChange={set('employmentType')}>
              <option value="">Belum dipilih</option>
              {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{EMPLOYMENT_TYPE_LABEL[t]}</option>)}
            </select>
          ))}
          {field('pf-alamat', 'Alamat', <input id="pf-alamat" className="cg-input" maxLength={300} value={f.address} onChange={set('address')} />)}
        </fieldset>

        <fieldset className="grid grid-cols-1 tablet:grid-cols-2 gap-16 border-0 p-0 m-0 min-w-0">
          <legend className="text-xs font-semibold text-text-muted mb-8">Rekening gaji (isi lengkap atau kosongkan semua)</legend>
          {field('pf-bank', 'Bank / dompet digital', (<><input id="pf-bank" className="cg-input" list="pf-banks" maxLength={60} value={f.bankName} onChange={set('bankName')} /><datalist id="pf-banks">{BANKS.map((b) => <option key={b} value={b} />)}</datalist></>))}
          {field('pf-rek', 'Nomor rekening', <input id="pf-rek" className="cg-input" inputMode="numeric" maxLength={32} value={f.bankAccountNumber} onChange={set('bankAccountNumber')} />)}
          <div className="tablet:col-span-2">{field('pf-an', 'Atas nama rekening', <input id="pf-an" className="cg-input" maxLength={80} value={f.bankAccountHolder} onChange={set('bankAccountHolder')} />)}</div>
        </fieldset>

        <div className="cg-modal__actions flex items-center justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan profil'}</button>
        </div>
      </form>
    </dialog>
  );
}
