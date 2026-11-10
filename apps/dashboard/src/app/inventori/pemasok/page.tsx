'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { History, Pencil, Plus } from 'lucide-react';
import { formatRp, INVOICE_STATUS_LABEL, supplierProblem, type Supplier } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return { ref, props: { ref, className: 'cg-modal', style: { margin: 'auto' }, onClose } as const };
}
const fmtDate = (d: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${d}T00:00:00Z`));

type Dlg = { kind: 'edit'; supplier?: Supplier } | { kind: 'history'; supplier: Supplier };

export default function SuppliersPage() {
  const data = useData();
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const state = useAsync(() => data.listSuppliers({ includeInactive: showInactive }), [data, showInactive]);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [notice, setNotice] = useState('');
  const rows = useMemo(() => {
    if (state.status !== 'ready') return [];
    const q = search.trim().toLowerCase();
    return state.data.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.code ?? '').toLowerCase().includes(q));
  }, [state, search]);
  return (
    <>
      <PageHeader title="Pemasok" subtitle="Daftar tempat kamu membeli stok, lengkap dengan termin bayar dan riwayat pembelian"
        actions={<button className="cg-btn cg-btn--primary" onClick={() => { setNotice(''); setDlg({ kind: 'edit' }); }}><Plus className="cg-icon" aria-hidden /> Tambah pemasok</button>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      <div className="flex flex-wrap gap-8 mb-12 items-end">
        <div className="cg-field grow" style={{ minWidth: 200 }}><label className="cg-label" htmlFor="sp-cari">Cari pemasok</label>
          <input id="sp-cari" className="cg-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama atau kode" /></div>
        <label className="flex items-center gap-8 pb-8"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Tampilkan yang nonaktif</label>
      </div>
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {state.status === 'ready' && (rows.length === 0 ? (
        <div className="cg-empty"><p><strong>{state.data.length === 0 ? 'Belum ada pemasok.' : 'Tidak ada pemasok yang cocok.'}</strong></p>
          {state.data.length === 0 && <><p className="text-text-muted">Catat pemasok supaya pembelian stok dan hutang bisa dilacak per pemasok.</p>
            <button className="cg-btn cg-btn--primary" onClick={() => setDlg({ kind: 'edit' })}>Tambah pemasok pertama</button></>}</div>
      ) : (
        <div className="cg-data-wrap">
          <table className="cg-data">
            <thead><tr><th>Pemasok</th><th>Kontak</th><th className="text-right">Termin</th><th>Status</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="break-words max-w-[260px]"><strong>{s.name}</strong>{s.code && <span className="block text-sm text-text-muted">{s.code}</span>}</td>
                  <td className="break-words max-w-[240px] text-sm">{[s.phone, s.email].filter(Boolean).join(' · ') || '—'}{s.address && <span className="block text-text-muted">{s.address}</span>}</td>
                  <td className="text-right cg-num whitespace-nowrap">{s.termDays === 0 ? 'Tunai' : `${s.termDays} hari`}</td>
                  <td><span className={`cg-badge ${s.isActive ? 'cg-badge--accent' : ''}`}>{s.isActive ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td className="text-right whitespace-nowrap">
                    <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => setDlg({ kind: 'history', supplier: s })} aria-label={`Riwayat pembelian ${s.name}`}><History className="cg-icon" aria-hidden /> Riwayat</button>
                    <button className="cg-btn cg-btn--ghost cg-btn--sm" onClick={() => { setNotice(''); setDlg({ kind: 'edit', supplier: s }); }} aria-label={`Ubah ${s.name}`}><Pencil className="cg-icon" aria-hidden /> Ubah</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {dlg?.kind === 'edit' && <EditDialog supplier={dlg.supplier} onClose={() => setDlg(null)} onDone={(m) => { setDlg(null); setNotice(m); state.reload(); }} />}
      {dlg?.kind === 'history' && <HistoryDialog supplier={dlg.supplier} onClose={() => setDlg(null)} />}
    </>
  );
}

function EditDialog({ supplier, onClose, onDone }: { supplier?: Supplier; onClose: () => void; onDone: (msg: string) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const [f, setF] = useState({ code: supplier?.code ?? '', name: supplier?.name ?? '', phone: supplier?.phone ?? '', email: supplier?.email ?? '', address: supplier?.address ?? '', term: String(supplier?.termDays ?? 0), active: supplier?.isActive ?? true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => { setF((s) => ({ ...s, ...patch })); setErr(''); };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = { ...(supplier ? { id: supplier.id } : {}), code: f.code, name: f.name, phone: f.phone, email: f.email, address: f.address, termDays: f.term.trim() === '' ? 0 : Number(f.term), isActive: f.active };
    const problem = supplierProblem(input);
    if (problem) return setErr(problem);
    setBusy(true); setErr('');
    try { const s = await data.saveSupplier(input); onDone(supplier ? `Pemasok ${s.name} diperbarui.` : `Pemasok ${s.name} ditambahkan.`); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Pemasok gagal disimpan.'); setBusy(false); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-pemasok">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-pemasok" className="cg-modal__title">{supplier ? 'Ubah pemasok' : 'Tambah pemasok'}</h2>
        <div className="cg-field"><label className="cg-label" htmlFor="sp-nama">Nama pemasok</label><input id="sp-nama" className="cg-input" maxLength={100} value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></div>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="cg-field"><label className="cg-label" htmlFor="sp-kode">Kode (opsional)</label><input id="sp-kode" className="cg-input" maxLength={20} value={f.code} onChange={(e) => set({ code: e.target.value })} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="sp-termin">Termin bayar (hari)</label><input id="sp-termin" className="cg-input" inputMode="numeric" maxLength={4} value={f.term} onChange={(e) => set({ term: e.target.value.replace(/\D/g, '') })} /></div>
        </div>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="cg-field"><label className="cg-label" htmlFor="sp-telp">Telepon</label><input id="sp-telp" className="cg-input" inputMode="tel" maxLength={30} value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="sp-email">Email</label><input id="sp-email" className="cg-input" inputMode="email" maxLength={100} value={f.email} onChange={(e) => set({ email: e.target.value })} /></div>
        </div>
        <div className="cg-field"><label className="cg-label" htmlFor="sp-alamat">Alamat</label><input id="sp-alamat" className="cg-input" maxLength={200} value={f.address} onChange={(e) => set({ address: e.target.value })} /></div>
        <p className="text-sm text-text-muted">Termin bayar dipakai sebagai jatuh tempo bawaan di faktur pembelian. Isi 0 untuk bayar tunai.</p>
        {supplier && <label className="flex items-center gap-8"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Pemasok aktif</label>}
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </dialog>
  );
}

function HistoryDialog({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const inv = useAsync(() => data.listPurchaseInvoices({ supplierId: supplier.id }), [data, supplier.id]);
  const rows = inv.status === 'ready' ? inv.data : [];
  const total = rows.reduce((n, i) => n + i.total, 0);
  const owed = rows.reduce((n, i) => n + i.outstanding, 0);
  return (
    <dialog {...d.props} aria-labelledby="judul-riwayat" style={{ margin: 'auto', maxWidth: 'min(720px, calc(100vw - 16px))' }}>
      <div className="grid gap-12">
        <h2 id="judul-riwayat" className="cg-modal__title break-words">Riwayat pembelian · {supplier.name}</h2>
        {inv.status === 'error' && <ErrorBox message={inv.message} onRetry={inv.reload} />}
        {inv.status === 'loading' && <div className="cg-skeleton" style={{ height: 96 }} aria-busy="true" aria-label="Memuat" />}
        {inv.status === 'ready' && (rows.length === 0 ? <p className="text-text-muted">Belum ada faktur pembelian dari pemasok ini.</p> : (
          <>
            <p className="text-sm text-text-muted">{rows.length} faktur · total <strong className="cg-num">{formatRp(total)}</strong> · belum dibayar <strong className="cg-num">{formatRp(owed)}</strong></p>
            <div className="cg-data-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
              <table className="cg-data" aria-label="Faktur pemasok">
                <thead><tr><th>Faktur</th><th>Tanggal</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Sisa</th></tr></thead>
                <tbody>{rows.map((i) => (
                  <tr key={i.id}><td><strong>{i.number}</strong>{i.supplierInvoiceNo && <span className="block text-sm text-text-muted">{i.supplierInvoiceNo}</span>}</td><td className="text-sm whitespace-nowrap">{fmtDate(i.invoiceDate)}</td>
                    <td><span className="cg-badge">{INVOICE_STATUS_LABEL[i.status]}</span></td><td className="text-right cg-num">{formatRp(i.total)}</td><td className="text-right cg-num">{i.outstanding > 0 ? formatRp(i.outstanding) : '—'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </>
        ))}
        <div className="cg-modal__actions"><button type="button" className="cg-btn cg-btn--secondary" onClick={() => d.ref.current?.close()}>Tutup</button></div>
      </div>
    </dialog>
  );
}
