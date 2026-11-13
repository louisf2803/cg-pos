'use client';

import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { FilePlus2, Plus, Trash2 } from 'lucide-react';
import {
  CAN_INVOICE, NEXT_SALES_DOC, SALES_DOC_LABEL, SALES_DOC_PLURAL, SALES_DOC_STATUS_LABEL, formatRp, newId, salesDocumentProblem,
  type SalesDocType, type SalesDocument,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { fmtDate, todayKey, useDialog } from '@/components/fin-common';
import { InvoiceDialog, type InvoicePrefill } from '@/components/faktur-penjualan/invoice-dialog';

interface Row { key: string; name: string; qty: string; price: string }
const blank = (): Row => ({ key: newId(), name: '', qty: '1', price: '' });
const digits = (s: string) => s.replace(/[^\d]/g, '');

function NewDialog({ type, customers, onClose, onDone }: {
  type: SalesDocType; customers: { id: string; name: string }[]; onClose: () => void; onDone: (d: SalesDocument) => void;
}) {
  const data = useData();
  const d = useDialog(onClose);
  const [id] = useState(() => newId());
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setRow = (key: string, p: Partial<Row>) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r))); setErr(''); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const lines = rows.filter((r) => r.name.trim() || r.price).map((r) => ({ name: r.name, qty: Number(r.qty.replace(',', '.')) || 0, unitPrice: Number(digits(r.price)) || 0 }));
    const input = { id, type, date, lines, ...(customerId ? { customerId } : {}), ...(note.trim() ? { note } : {}) };
    const problem = salesDocumentProblem(input);
    if (problem) return setErr(problem);
    setBusy(true);
    try { onDone(await data.createSalesDocument(input)); } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.'); setBusy(false); }
  }

  return (
    <dialog {...d.props} aria-labelledby="judul-dok">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-dok" className="cg-modal__title">{SALES_DOC_LABEL[type]} baru</h2>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="cg-field"><label className="cg-label" htmlFor="dk-pelanggan">Pelanggan</label>
            <select id="dk-pelanggan" className="cg-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Tanpa pelanggan</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="cg-field"><label className="cg-label" htmlFor="dk-tgl">Tanggal</label><input id="dk-tgl" type="date" className="cg-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <fieldset className="grid gap-8" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="cg-label">Barang atau jasa</legend>
          {rows.map((r, i) => (
            <div key={r.key} className="grid gap-8" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1.5fr) auto' }}>
              <input aria-label={`Nama baris ${i + 1}`} className="cg-input" placeholder="Nama barang atau jasa" maxLength={120} value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} />
              <input aria-label={`Jumlah baris ${i + 1}`} className="cg-input cg-num" inputMode="decimal" value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value.replace(/[^\d.,]/g, '') })} />
              <input aria-label={`Harga satuan baris ${i + 1}`} className="cg-input cg-num" inputMode="numeric" placeholder="Harga (Rp)" value={r.price} onChange={(e) => setRow(r.key, { price: digits(e.target.value) })} />
              <button type="button" className="cg-btn cg-btn--ghost" aria-label={`Hapus baris ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 className="cg-icon" aria-hidden /></button>
            </div>
          ))}
          <div><button type="button" className="cg-btn cg-btn--secondary" onClick={() => setRows((rs) => [...rs, blank()])}><Plus className="cg-icon" aria-hidden /> Tambah baris</button></div>
        </fieldset>
        <div className="cg-field"><label className="cg-label" htmlFor="dk-catatan">Catatan (opsional)</label><input id="dk-catatan" className="cg-input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </dialog>
  );
}

export function DocumentListPage({ type }: { type: SalesDocType }) {
  const data = useData();
  const list = useAsync(() => data.listSalesDocuments(type), [data, type]);
  const customers = useAsync(() => data.listCustomers({ limit: 500 }), [data]);
  const accounts = useAsync(() => data.listAccounts(), [data]);
  const [creating, setCreating] = useState(false);
  const [invoicing, setInvoicing] = useState<SalesDocument | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const label = SALES_DOC_LABEL[type];
  const next = NEXT_SALES_DOC[type];
  const rows = useMemo(() => (list.status === 'ready' ? list.data : []), [list]);
  const canCreateDirect = type === 'quote' || type === 'order';

  async function run(doc: SalesDocument, action: () => Promise<string>) {
    if (busyId) return;
    setBusyId(doc.id); setError(''); setNotice('');
    try { setNotice(await action()); list.reload(); } catch (x) { setError(x instanceof Error ? x.message : 'Gagal memproses.'); } finally { setBusyId(null); }
  }
  const prefill = (doc: SalesDocument): InvoicePrefill => ({ ...(doc.customerId ? { customerId: doc.customerId } : {}), lines: doc.lines.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice })) });

  return (
    <div className="min-w-0">
      <PageHeader title={`Daftar ${SALES_DOC_PLURAL[type]} penjualan`} subtitle="Alur: penawaran, pesanan, pengiriman, penerimaan, lalu faktur. Tiap langkah menyalin barang dari langkah sebelumnya."
        actions={canCreateDirect ? <button className="cg-btn cg-btn--primary" disabled={customers.status !== 'ready'} onClick={() => { setNotice(''); setCreating(true); }}><FilePlus2 className="cg-icon" aria-hidden /> {label} baru</button> : undefined} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {error && <p role="alert" className="cg-banner cg-banner--danger mb-16">{error}</p>}
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 44 }} />)}</div>}
      {list.status === 'ready' && rows.length === 0 && (
        <div className="cg-empty"><p><strong>Belum ada {SALES_DOC_PLURAL[type]}.</strong></p><p className="text-text-muted">{canCreateDirect ? `Pilih ${label} baru untuk memulai.` : `Buat dari ${SALES_DOC_PLURAL[type === 'delivery' ? 'order' : 'delivery']} lewat tombol Lanjutkan.`}</p></div>
      )}
      {list.status === 'ready' && rows.length > 0 && (
        <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label={`Daftar ${SALES_DOC_PLURAL[type]}`}>
          <thead><tr><th>Nomor</th><th>Pelanggan</th><th>Tanggal</th><th className="text-right">Total</th><th>Status</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
          <tbody>{rows.map((r) => (
            <Fragment key={r.id}>
              <tr>
                <td><button className="cg-btn cg-btn--ghost" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{r.number}</button></td>
                <td>{r.customerName}</td><td>{fmtDate(r.date)}</td><td className="text-right cg-num">{formatRp(r.total)}</td>
                <td><span className="cg-badge">{SALES_DOC_STATUS_LABEL[r.status]}</span></td>
                <td className="flex flex-wrap gap-8">
                  {r.status === 'open' && next !== 'invoice' && (
                    <button className="cg-btn cg-btn--secondary" disabled={busyId !== null} onClick={() => run(r, async () => { const c = await data.createSalesDocument({ id: newId(), type: next, parentId: r.id }); return `${SALES_DOC_LABEL[next]} ${c.number} dibuat dari ${r.number}.`; })}>Lanjutkan ke {SALES_DOC_PLURAL[next]}</button>
                  )}
                  {r.status === 'open' && CAN_INVOICE.includes(type) && (
                    <button className="cg-btn cg-btn--primary" disabled={busyId !== null || accounts.status !== 'ready'} onClick={() => { setNotice(''); setInvoicing(r); }}>Jadikan faktur</button>
                  )}
                  {r.status === 'open' && <button className="cg-btn cg-btn--ghost" disabled={busyId !== null} onClick={() => run(r, async () => { await data.cancelSalesDocument(r.id); return `${r.number} dibatalkan.`; })}>Batalkan</button>}
                </td>
              </tr>
              {open === r.id && (
                <tr><td colSpan={6}>
                  <ul className="grid gap-8" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label={`Rincian ${r.number}`}>
                    {r.lines.map((l) => <li key={l.id} className="flex justify-between gap-12"><span>{l.name} × {l.qty}</span><span className="cg-num">{formatRp(l.lineTotal)}</span></li>)}
                    {r.note && <li className="text-text-muted">Catatan: {r.note}</li>}
                  </ul>
                </td></tr>
              )}
            </Fragment>
          ))}</tbody>
        </table></div>
      )}
      {creating && customers.status === 'ready' && (
        <NewDialog type={type} customers={customers.data} onClose={() => setCreating(false)} onDone={(c) => { setCreating(false); setNotice(`${label} ${c.number} dibuat.`); list.reload(); }} />
      )}
      {invoicing && customers.status === 'ready' && accounts.status === 'ready' && (
        <InvoiceDialog customers={customers.data} accounts={accounts.data} prefill={prefill(invoicing)} onClose={() => setInvoicing(null)}
          onDone={async (inv) => {
            const doc = invoicing; setInvoicing(null);
            await run(doc, async () => { await data.linkSalesDocumentInvoice(doc.id, inv.id); return `Faktur ${inv.number} dibuat dari ${doc.number}.`; });
          }} />
      )}
    </div>
  );
}
