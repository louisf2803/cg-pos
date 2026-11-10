'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { BookOpen, Pencil, Plus } from 'lucide-react';
import { accountProblem, ACCOUNT_CATEGORIES, CATEGORY_LABEL, type Account, type AccountCategory } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';

export default function AccountsPage() {
  const data = useData();
  const state = useAsync(() => data.listAccounts(), [data]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [dlg, setDlg] = useState<{ account?: Account } | null>(null);
  const [notice, setNotice] = useState('');
  const groups = useMemo(() => {
    if (state.status !== 'ready') return [];
    const q = search.trim().toLowerCase();
    const rows = state.data.filter((a) => (showInactive || a.isActive) && (!q || a.name.toLowerCase().includes(q) || a.code.includes(q)));
    return ACCOUNT_CATEGORIES.map((c) => ({ ...c, rows: rows.filter((a) => a.category === c.value) })).filter((g) => g.rows.length > 0);
  }, [state, search, showInactive]);
  return (
    <>
      <PageHeader title="Daftar akun" subtitle="Rekening pembukuan tempat semua transaksi dicatat. Akun sistem dipakai pembukuan otomatis."
        actions={<button className="cg-btn cg-btn--primary" onClick={() => { setNotice(''); setDlg({}); }}><Plus className="cg-icon" aria-hidden /> Tambah akun</button>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      <div className="flex flex-wrap gap-8 mb-12 items-end">
        <div className="cg-field grow" style={{ minWidth: 200 }}><label className="cg-label" htmlFor="ak-cari">Cari akun</label>
          <input id="ak-cari" className="cg-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Kode atau nama" /></div>
        <label className="flex items-center gap-8 pb-8"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Tampilkan yang nonaktif</label>
      </div>
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {state.status === 'ready' && (groups.length === 0 ? (
        <div className="cg-empty"><p><strong>Tidak ada akun yang cocok.</strong></p></div>
      ) : (
        <div className="grid gap-16">
          {groups.map((g) => (
            <section key={g.value} aria-label={g.label} className="min-w-0">
              <h2 className="text-base mb-8">{g.label}</h2>
              <div className="cg-data-wrap">
                <table className="cg-data">
                  <thead><tr><th>Kode</th><th>Nama akun</th><th>Jenis</th><th>Status</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
                  <tbody>
                    {g.rows.map((a) => (
                      <tr key={a.id}>
                        <td className="cg-num whitespace-nowrap">{a.code}</td>
                        <td className="break-words max-w-[280px]"><strong>{a.name}</strong>{a.systemKey && <span className="cg-badge ml-8">Akun sistem</span>}</td>
                        <td className="text-sm">{a.kind === 'header' ? 'Induk (tidak menerima jurnal)' : 'Rinci'}</td>
                        <td><span className={`cg-badge ${a.isActive ? 'cg-badge--accent' : ''}`}>{a.isActive ? 'Aktif' : 'Nonaktif'}</span></td>
                        <td className="text-right whitespace-nowrap">
                          {a.kind === 'detail' && <a className="cg-btn cg-btn--ghost cg-btn--sm" href={`/keuangan/buku-besar?akun=${a.id}`} aria-label={`Buku besar ${a.name}`}><BookOpen className="cg-icon" aria-hidden /> Buku besar</a>}
                          <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => { setNotice(''); setDlg({ account: a }); }} aria-label={`Ubah ${a.name}`}><Pencil className="cg-icon" aria-hidden /> Ubah</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      ))}
      {dlg && <EditDialog account={dlg.account} onClose={() => setDlg(null)} onDone={(m) => { setDlg(null); setNotice(m); state.reload(); }} />}
    </>
  );
}

function EditDialog({ account, onClose, onDone }: { account?: Account; onClose: () => void; onDone: (msg: string) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const locked = !!account?.systemKey;
  const [f, setF] = useState({ code: account?.code ?? '', name: account?.name ?? '', category: (account?.category ?? 'expense') as AccountCategory, kind: account?.kind ?? 'detail', active: account?.isActive ?? true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => { setF((s) => ({ ...s, ...patch })); setErr(''); };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = { ...(account ? { id: account.id } : {}), code: f.code.trim(), name: f.name, kind: f.kind, category: f.category, isActive: f.active };
    const problem = accountProblem(input);
    if (problem) return setErr(problem);
    setBusy(true); setErr('');
    try { const a = await data.saveAccount(input); onDone(account ? `Akun ${a.name} diperbarui.` : `Akun ${a.code} ${a.name} ditambahkan.`); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Akun gagal disimpan.'); setBusy(false); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-akun">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-akun" className="cg-modal__title">{account ? 'Ubah akun' : 'Tambah akun'}</h2>
        {locked && <p className="cg-banner cg-banner--info">Akun sistem dipakai pembukuan otomatis, jadi hanya namanya yang bisa diubah.</p>}
        <div className="cg-field"><label className="cg-label" htmlFor="ak-nama">Nama akun</label><input id="ak-nama" className="cg-input" maxLength={100} value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></div>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="cg-field"><label className="cg-label" htmlFor="ak-kode">Kode (contoh 6-1300)</label><input id="ak-kode" className="cg-input" maxLength={6} inputMode="numeric" value={f.code} onChange={(e) => set({ code: e.target.value })} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="ak-kelompok">Kelompok</label>
            <select id="ak-kelompok" className="cg-input" value={f.category} disabled={locked} onChange={(e) => set({ category: e.target.value as AccountCategory })}>
              {ACCOUNT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label} (kode {c.digit}-)</option>)}</select></div>
          <div className="cg-field"><label className="cg-label" htmlFor="ak-jenis">Jenis</label>
            <select id="ak-jenis" className="cg-input" value={f.kind} disabled={locked} onChange={(e) => set({ kind: e.target.value as 'header' | 'detail' })}>
              <option value="detail">Rinci (menerima jurnal)</option><option value="header">Induk (pengelompok)</option></select></div>
        </div>
        <p className="text-sm text-text-muted">Kelompok {CATEGORY_LABEL[f.category].toLowerCase()} memakai kode berawalan {ACCOUNT_CATEGORIES.find((c) => c.value === f.category)?.digit}. Akun yang sudah punya jurnal tidak bisa pindah kelompok.</p>
        {account && !locked && <label className="flex items-center gap-8"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Akun aktif</label>}
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </dialog>
  );
}
