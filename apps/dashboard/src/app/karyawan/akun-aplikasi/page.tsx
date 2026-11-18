'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { KeyRound, Link2Off, Smartphone, UserPlus } from 'lucide-react';
import { ROLE_LABEL, staffAccountProblem, staffUsername, type ManagedEmployee } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';

export default function AkunAplikasiPage() {
  const data = useData();
  const [linking, setLinking] = useState<ManagedEmployee | null>(null);
  const [notice, setNotice] = useState('');
  const [err, setErr] = useState('');

  const state = useAsync(async () => {
    const [employees, accounts] = await Promise.all([data.listManagedEmployees(), data.listStaffAccounts().catch(() => [])]);
    return { employees, byEmployee: new Map(accounts.map((a) => [a.employeeId, a.email])) };
  }, [data]);

  const rows = useMemo(() => (state.status === 'ready' ? state.data.employees.filter((e) => e.isActive) : []), [state]);

  async function unlink(e: ManagedEmployee) {
    setErr('');
    try { await data.unlinkStaffAccount(e.id); setNotice(`Tautan akun ${e.name} dilepas. Karyawan itu tidak bisa lagi masuk aplikasi.`); state.reload(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal melepas tautan.'); }
  }

  return (
    <div className="space-y-24 max-w-full">
      <PageHeader
        title="Akun aplikasi karyawan"
        subtitle="Buat akun login (username dan kata sandi) untuk karyawan supaya bisa masuk aplikasi HP karyawan. Akun dibuat langsung di sini dan otomatis tertaut; bisa juga menautkan akun Supabase yang sudah ada. Kata sandi tidak bisa dilihat lagi, hanya diganti."
      />
      {notice && <div role="status" className="cg-banner cg-banner--success flex items-center justify-between"><span>{notice}</span><button type="button" className="text-xs font-semibold underline ml-12" onClick={() => setNotice('')}>Tutup</button></div>}
      {err && <div role="alert" className="cg-banner cg-banner--danger"><span>{err}</span></div>}
      {state.status === 'error' && <div role="alert" className="cg-banner cg-banner--danger"><span>{state.message}</span><button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={state.reload}>Coba lagi</button></div>}
      {state.status === 'loading' && <div className="cg-card p-24 space-y-12" aria-busy="true"><div className="cg-skeleton h-40 w-full" /><div className="cg-skeleton h-40 w-full" /></div>}
      {state.status === 'ready' && (rows.length === 0 ? (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border"><Smartphone className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden /><p className="font-bold m-0">Belum ada karyawan aktif</p></div>
      ) : (
        <div className="cg-card overflow-hidden">
          <div className="overflow-x-auto min-w-0">
            <table className="cg-data w-full">
              <thead>
                <tr className="border-b border-border bg-surface text-xs font-semibold text-text-muted">
                  <th className="py-12 px-16 text-left">Karyawan</th>
                  <th className="py-12 px-16 text-left">Peran</th>
                  <th className="py-12 px-16 text-left">Akun aplikasi</th>
                  <th className="py-12 px-16 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const email = state.data.byEmployee.get(e.id);
                  return (
                    <tr key={e.id} className="border-b border-border last:border-0">
                      <td className="py-12 px-16 font-medium">{e.name}</td>
                      <td className="py-12 px-16 text-sm">{ROLE_LABEL[e.role] ?? e.role}</td>
                      <td className="py-12 px-16 text-sm">{email ? <span className="cg-badge cg-badge--accent">{staffUsername(email)}</span> : <span className="text-text-muted">Belum ditautkan</span>}</td>
                      <td className="py-12 px-16 text-right whitespace-nowrap">
                        {email
                          ? <>
                              <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setLinking(e)} aria-label={`Ganti kata sandi ${e.name}`}><KeyRound className="cg-icon cg-icon--sm" aria-hidden /> Ganti sandi</button>
                              <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => void unlink(e)} aria-label={`Lepas akun ${e.name}`}><Link2Off className="cg-icon cg-icon--sm" aria-hidden /> Lepas</button>
                            </>
                          : <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => setLinking(e)} aria-label={`Buat akun ${e.name}`}><UserPlus className="cg-icon cg-icon--sm" aria-hidden /> Buat akun</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {linking && <LinkDialog employee={linking} hasAccount={state.status === 'ready' && state.data.byEmployee.has(linking.id)} onClose={() => setLinking(null)} onDone={(m) => { setLinking(null); setNotice(m); state.reload(); }} />}
    </div>
  );
}

function LinkDialog({ employee, hasAccount, onClose, onDone }: { employee: ManagedEmployee; hasAccount: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const data = useData();
  const dlg = useDialog(onClose);
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const linkMode = mode === 'link' && !hasAccount;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');
    try {
      if (linkMode) {
        await data.linkStaffAccount(employee.id, email);
        onDone(`${employee.name} ditautkan ke ${email.trim()}. Karyawan bisa masuk aplikasi dengan email dan kata sandi akun itu.`);
      } else {
        const bad = staffAccountProblem({ username, password, reset: hasAccount });
        if (bad) { setErr(bad); setBusy(false); return; }
        const r = await data.createStaffAccount(employee.id, username, password);
        onDone(r.mode === 'reset' ? `Kata sandi ${employee.name} diganti.` : `Akun ${employee.name} dibuat dengan username ${staffUsername(r.email)}. Sampaikan username dan kata sandi itu langsung ke karyawan.`);
      }
    } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal.'); setBusy(false); }
  }
  return (
    <dialog {...dlg.props} aria-labelledby="tautan-title" className="cg-modal w-full">
      <form onSubmit={(e) => void submit(e)} className="space-y-16">
        <h2 id="tautan-title" className="cg-modal__title">{hasAccount ? `Ganti kata sandi ${employee.name}` : `Akun aplikasi ${employee.name}`}</h2>
        {err && <div role="alert" className="cg-banner cg-banner--danger"><span>{err}</span></div>}
        {!hasAccount && (
          <div className="flex gap-8" role="tablist" aria-label="Cara menyiapkan akun">
            <button type="button" role="tab" aria-selected={mode === 'create'} className={`cg-btn cg-btn--sm ${mode === 'create' ? 'cg-btn--primary' : 'cg-btn--secondary'}`} onClick={() => { setMode('create'); setErr(''); }}>Buat akun baru</button>
            <button type="button" role="tab" aria-selected={mode === 'link'} className={`cg-btn cg-btn--sm ${mode === 'link' ? 'cg-btn--primary' : 'cg-btn--secondary'}`} onClick={() => { setMode('link'); setErr(''); }}>Tautkan akun yang sudah ada</button>
          </div>
        )}
        {!linkMode ? (
          <>
            {!hasAccount && (
              <div className="cg-field">
                <label className="cg-label" htmlFor="tl-user">Username</label>
                <input id="tl-user" className="cg-input" required autoFocus autoCapitalize="none" autoComplete="off" placeholder="mis. sari.barista" value={username} onChange={(e) => { setUsername(e.target.value); setErr(''); }} />
                <p className="text-xs text-text-muted m-0">Huruf kecil, angka, titik, garis bawah, atau strip. Dipakai karyawan untuk masuk.</p>
              </div>
            )}
            <div className="cg-field">
              <label className="cg-label" htmlFor="tl-pass">{hasAccount ? 'Kata sandi baru' : 'Kata sandi awal'}</label>
              <input id="tl-pass" className="cg-input" type="password" required autoComplete="new-password" minLength={8} value={password} onChange={(e) => { setPassword(e.target.value); setErr(''); }} />
              <p className="text-xs text-text-muted m-0">Minimal 8 karakter. Tidak disimpan di dashboard dan tidak bisa dilihat lagi.</p>
            </div>
          </>
        ) : (
          <div className="cg-field">
            <label className="cg-label" htmlFor="tl-email">Email akun</label>
            <input id="tl-email" className="cg-input" type="email" required autoFocus placeholder="nama@usaha.com" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} />
            <p className="text-xs text-text-muted m-0">Akun harus sudah ada di Supabase. Akun perangkat kasir tidak bisa dipakai di sini.</p>
          </div>
        )}
        <div className="cg-modal__actions flex items-center justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose} disabled={busy}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy || (linkMode ? !email.trim() : !password || (!hasAccount && !username.trim()))}>{busy ? 'Memproses…' : hasAccount ? 'Ganti sandi' : linkMode ? 'Tautkan' : 'Buat akun'}</button>
        </div>
      </form>
    </dialog>
  );
}
