'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Banknote, PackageCheck, Plus, Save } from 'lucide-react';
import {
  addDays, formatRp, INVOICE_STATUS_LABEL, invoiceOverdue, newId, purchaseInvoiceProblem, purchasePayProblem, purchaseReceiveProblem, purchaseSubtotal, purchaseTotal,
  type PurchaseInvoice, type PurchaseInvoiceStatus,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { emptyLine, fromLine, LinesEditor, numOf, rpDigits, toLineInputs, type LineDraft } from '@/components/purchase-lines';

const fmtDate = (d: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${d}T00:00:00Z`));
const fmtQty = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n);
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const BADGE: Record<PurchaseInvoiceStatus, string> = { open: '', partially_paid: '', paid: 'cg-badge--accent', void: '' };

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return { ref, props: { ref, className: 'cg-modal', style: { margin: 'auto' }, onClose } as const };
}

type View = { kind: 'list' } | { kind: 'new'; id: string; poId?: string } | { kind: 'show'; id: string };

export default function InvoicesPage() {
  const data = useData();
  const [filter, setFilter] = useState<'' | PurchaseInvoiceStatus>('');
  const list = useAsync(() => data.listPurchaseInvoices(filter ? { status: filter } : undefined), [data, filter]);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [notice, setNotice] = useState('');
  // dari halaman pesanan: /inventori/faktur?po=<id> membuka formulir faktur yang sudah terisi dari pesanan itu
  useEffect(() => {
    const po = new URLSearchParams(window.location.search).get('po');
    if (po) setView({ kind: 'new', id: newId(), poId: po });
  }, []);
  const back = (msg?: string) => { setView({ kind: 'list' }); if (msg) setNotice(msg); list.reload(); };
  if (view.kind === 'new') return <Editor id={view.id} poId={view.poId} onBack={back} onDone={(id, msg) => { setNotice(msg); list.reload(); setView({ kind: 'show', id }); }} />;
  if (view.kind === 'show') return <Viewer id={view.id} initialNotice={notice} onBack={() => back()} />;
  const today = todayKey();
  const rows = list.status === 'ready' ? list.data : [];
  const owed = rows.reduce((n, i) => n + i.outstanding, 0);
  const late = rows.filter((i) => invoiceOverdue(i, today));
  return (
    <>
      <PageHeader title="Faktur pembelian" subtitle="Catat barang yang datang dari pemasok, terima sebagian, dan bayar sesuai termin"
        actions={<button className="cg-btn cg-btn--primary" onClick={() => { setNotice(''); setView({ kind: 'new', id: newId() }); }}><Plus className="cg-icon" aria-hidden /> Faktur baru</button>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      <div className="flex flex-wrap gap-8 mb-12 items-end">
        <div className="cg-field"><label className="cg-label" htmlFor="fk-status">Status</label>
          <select id="fk-status" className="cg-input" value={filter} onChange={(e) => setFilter(e.target.value as '' | PurchaseInvoiceStatus)}>
            <option value="">Semua</option><option value="open">Belum dibayar</option><option value="partially_paid">Dibayar sebagian</option><option value="paid">Lunas</option></select></div>
        {list.status === 'ready' && rows.length > 0 && <p className="pb-8" data-testid="ringkasan-faktur">Sisa hutang <strong className="cg-num">{formatRp(owed)}</strong>{late.length > 0 && <> · <strong className="text-danger-strong">{late.length} lewat jatuh tempo</strong></>}</p>}
      </div>
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {list.status === 'ready' && (rows.length === 0 ? (
        <div className="cg-empty"><p><strong>{filter ? 'Tidak ada faktur dengan status ini.' : 'Belum ada faktur pembelian.'}</strong></p>
          {!filter && <><p className="text-text-muted">Faktur mencatat stok yang masuk dan hutang ke pemasok.</p><button className="cg-btn cg-btn--primary" onClick={() => setView({ kind: 'new', id: newId() })}>Buat faktur pertama</button></>}</div>
      ) : (
        <div className="cg-data-wrap">
          <table className="cg-data">
            <thead><tr><th>Faktur</th><th>Pemasok</th><th>Tanggal</th><th>Jatuh tempo</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Sisa</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
            <tbody>{rows.map((i) => (
              <tr key={i.id}>
                <td><strong>{i.number}</strong>{i.supplierInvoiceNo && <span className="block text-sm text-text-muted">{i.supplierInvoiceNo}</span>}</td>
                <td className="break-words max-w-[220px]">{i.supplierName}</td><td className="text-sm whitespace-nowrap">{fmtDate(i.invoiceDate)}</td>
                <td className={`text-sm whitespace-nowrap ${invoiceOverdue(i, today) ? 'text-danger-strong' : ''}`}>{i.dueDate ? fmtDate(i.dueDate) : '—'}{invoiceOverdue(i, today) && <span className="block">Lewat tempo</span>}</td>
                <td><span className={`cg-badge ${BADGE[i.status]}`}>{INVOICE_STATUS_LABEL[i.status]}</span>{!i.fullyReceived && <span className="block text-sm text-text-muted">Belum lengkap</span>}</td>
                <td className="text-right cg-num">{formatRp(i.total)}</td><td className="text-right cg-num">{i.outstanding > 0 ? formatRp(i.outstanding) : '—'}</td>
                <td className="text-right whitespace-nowrap"><button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Buka ${i.number}`} onClick={() => { setNotice(''); setView({ kind: 'show', id: i.id }); }}>Buka</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function Editor({ id, poId, onBack, onDone }: { id: string; poId?: string; onBack: (msg?: string) => void; onDone: (id: string, msg: string) => void }) {
  const data = useData();
  const state = useAsync(async () => {
    const [items, suppliers, order] = await Promise.all([data.listPurchaseItems(), data.listSuppliers(), poId ? data.getPurchaseOrder(poId) : Promise.resolve(null)]);
    return { items, suppliers, order };
  }, [data, poId]);
  const [supplierId, setSupplierId] = useState('');
  const [supplierNo, setSupplierNo] = useState('');
  const [date, setDate] = useState(todayKey());
  const [term, setTerm] = useState('');
  const [note, setNote] = useState('');
  const [discount, setDiscount] = useState('');
  const [tax, setTax] = useState('');
  const [other, setOther] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const loaded = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    const o = loaded?.order;
    if (!o) return;
    setSupplierId(o.supplierId); setNote(o.note ?? '');
    setDiscount(o.discount ? String(o.discount) : ''); setTax(o.taxAmount ? String(o.taxAmount) : ''); setOther(o.otherCost ? String(o.otherCost) : '');
    setLines(o.lines.length ? o.lines.map(fromLine) : [emptyLine()]);
  }, [loaded]);
  const supplier = loaded?.suppliers.find((s) => s.id === supplierId);
  const termDays = term.trim() === '' ? supplier?.termDays ?? 0 : Number(term);
  const inputs = toLineInputs(lines, true);
  const total = purchaseTotal(inputs, numOf(discount), numOf(tax), numOf(other));
  const orderBad = !!poId && loaded && (!loaded.order || loaded.order.status !== 'ordered');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = {
      id, supplierId: supplierId || null, orderId: poId ?? null, supplierInvoiceNo: supplierNo.trim() || undefined, invoiceDate: date || undefined, ...(term.trim() !== '' ? { termDays: Number(term) } : {}),
      discount: numOf(discount), tax: numOf(tax), otherCost: numOf(other), note: note.trim() || undefined, lines: inputs,
    };
    const problem = purchaseInvoiceProblem(input);
    if (problem) return setErr(problem);
    setBusy(true); setErr('');
    try { const f = await data.createPurchaseInvoice(input); onDone(f.id, `Faktur ${f.number} dibuat. Stok yang diterima sudah masuk dan hutang tercatat.`); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Faktur gagal dibuat.'); setBusy(false); }
  }
  return (
    <>
      <PageHeader title="Faktur baru" subtitle={loaded?.order ? `Dari pesanan ${loaded.order.number}` : 'Isi barang yang datang. Kosongkan kolom Diterima bila semuanya sudah diterima.'}
        actions={<button className="cg-btn cg-btn--ghost" onClick={() => onBack()}><ArrowLeft className="cg-icon" aria-hidden /> Kembali</button>} />
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {orderBad && <p role="alert" className="cg-banner cg-banner--danger mb-16">Pesanan ini tidak bisa dibuatkan faktur (belum dipesan, sudah diterima, atau dibatalkan).</p>}
      {loaded && !orderBad && (
        <form onSubmit={submit} className="grid gap-16" noValidate>
          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="cg-field"><label className="cg-label" htmlFor="fk-pemasok">Pemasok</label>
              <select id="fk-pemasok" className="cg-input" value={supplierId} disabled={!!poId} onChange={(e) => { setSupplierId(e.target.value); setErr(''); }}>
                <option value="">(Tanpa pemasok)</option>{loaded.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="cg-field"><label className="cg-label" htmlFor="fk-no">Nomor faktur pemasok</label><input id="fk-no" className="cg-input" maxLength={60} value={supplierNo} onChange={(e) => setSupplierNo(e.target.value)} /></div>
            <div className="cg-field"><label className="cg-label" htmlFor="fk-tgl">Tanggal faktur</label><input id="fk-tgl" type="date" className="cg-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="cg-field"><label className="cg-label" htmlFor="fk-termin">Termin (hari)</label>
              <input id="fk-termin" className="cg-input" inputMode="numeric" maxLength={4} placeholder={String(supplier?.termDays ?? 0)} value={term} onChange={(e) => setTerm(e.target.value.replace(/\D/g, ''))} /></div>
          </div>
          <p className="text-sm text-text-muted" data-testid="jatuh-tempo">Jatuh tempo {date ? fmtDate(addDays(date, Number.isFinite(termDays) ? termDays : 0)) : '—'}{termDays === 0 ? ' (tunai)' : ''}</p>
          <LinesEditor items={loaded.items} lines={lines} onChange={(l) => { setLines(l); setErr(''); }} withReceived />
          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="cg-field"><label className="cg-label" htmlFor="fk-diskon">Diskon faktur (Rp)</label><input id="fk-diskon" className="cg-input" inputMode="numeric" maxLength={13} value={discount} onChange={(e) => setDiscount(rpDigits(e.target.value))} /></div>
            <div className="cg-field"><label className="cg-label" htmlFor="fk-pajak">Pajak masukan (Rp)</label><input id="fk-pajak" className="cg-input" inputMode="numeric" maxLength={13} value={tax} onChange={(e) => setTax(rpDigits(e.target.value))} /></div>
            <div className="cg-field"><label className="cg-label" htmlFor="fk-lain">Biaya lain (Rp)</label><input id="fk-lain" className="cg-input" inputMode="numeric" maxLength={13} value={other} onChange={(e) => setOther(rpDigits(e.target.value))} /></div>
          </div>
          <div className="cg-field"><label className="cg-label" htmlFor="fk-catatan">Catatan</label><input id="fk-catatan" className="cg-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <p data-testid="total-faktur">Subtotal <strong className="cg-num">{formatRp(purchaseSubtotal(inputs))}</strong> · total tagihan <strong className="cg-num">{formatRp(total)}</strong></p>
          <p className="text-sm text-text-muted">Diskon dan biaya lain dibagi ke harga barang. Pajak masukan dicatat terpisah. Faktur yang sudah dibuat tidak bisa diubah; koreksi lewat stok keluar atau jurnal.</p>
          {err && <p role="alert" className="text-danger-strong">{err}</p>}
          <div><button type="submit" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy}><Save className="cg-icon" aria-hidden /> {busy ? 'Menyimpan…' : 'Buat faktur'}</button></div>
        </form>
      )}
    </>
  );
}

function Viewer({ id, initialNotice, onBack }: { id: string; initialNotice: string; onBack: () => void }) {
  const data = useData();
  const state = useAsync(() => data.getPurchaseInvoice(id), [data, id]);
  const [dlg, setDlg] = useState<'receive' | 'pay' | null>(null);
  const [notice, setNotice] = useState(initialNotice);
  const f: PurchaseInvoice | null | undefined = state.status === 'ready' ? state.data : undefined;
  const incomplete = f?.lines.some((l) => l.receivedQty < l.qty);
  const payable = f && (f.status === 'open' || f.status === 'partially_paid');
  return (
    <>
      <PageHeader title={f ? f.number : 'Faktur'} subtitle={f ? `${f.supplierName} · ${INVOICE_STATUS_LABEL[f.status]}` : undefined}
        actions={<button className="cg-btn cg-btn--ghost" onClick={onBack}><ArrowLeft className="cg-icon" aria-hidden /> Kembali</button>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="cg-skeleton" style={{ height: 160 }} aria-busy="true" aria-label="Memuat" />}
      {state.status === 'ready' && !f && <div className="cg-empty"><p><strong>Faktur tidak ditemukan.</strong></p></div>}
      {f && (
        <div className="grid gap-12">
          <p className="text-sm text-text-muted">Tanggal {fmtDate(f.invoiceDate)}{f.dueDate ? ` · jatuh tempo ${fmtDate(f.dueDate)}` : ''}{f.supplierInvoiceNo ? ` · faktur pemasok ${f.supplierInvoiceNo}` : ''}{f.note ? ` · ${f.note}` : ''}</p>
          <div className="cg-data-wrap">
            <table className="cg-data" aria-label="Barang faktur">
              <thead><tr><th>Barang</th><th className="text-right">Jumlah</th><th className="text-right">Diterima</th><th className="text-right">Harga satuan</th><th className="text-right">Jumlah harga</th></tr></thead>
              <tbody>{f.lines.map((l) => (
                <tr key={l.id}><td className="break-words max-w-[240px]"><strong>{l.name}</strong></td><td className="text-right cg-num whitespace-nowrap">{fmtQty(l.qty)} {l.unit}</td>
                  <td className={`text-right cg-num whitespace-nowrap ${l.receivedQty < l.qty ? 'text-danger-strong' : ''}`}>{fmtQty(l.receivedQty)}</td>
                  <td className="text-right cg-num">{formatRp(l.unitPrice)}</td><td className="text-right cg-num">{formatRp(l.lineTotal)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p>Subtotal {formatRp(f.subtotal)} · diskon {formatRp(f.discount)} · pajak {formatRp(f.taxAmount)} · biaya lain {formatRp(f.otherCost)}</p>
          <p>Total <strong className="cg-num" data-testid="total-faktur">{formatRp(f.total)}</strong> · dibayar <strong className="cg-num">{formatRp(f.paidTotal)}</strong> · sisa <strong className="cg-num" data-testid="sisa-faktur">{formatRp(f.outstanding)}</strong></p>
          <div className="flex flex-wrap gap-8">
            {incomplete && <button className="cg-btn cg-btn--secondary" onClick={() => { setNotice(''); setDlg('receive'); }}><PackageCheck className="cg-icon" aria-hidden /> Terima barang</button>}
            {payable && <button className="cg-btn cg-btn--primary" onClick={() => { setNotice(''); setDlg('pay'); }}><Banknote className="cg-icon" aria-hidden /> Bayar faktur</button>}
          </div>
          {f.payments.length > 0 && (
            <div className="cg-data-wrap">
              <table className="cg-data" aria-label="Pembayaran">
                <thead><tr><th>Pembayaran</th><th>Tanggal</th><th>Akun</th><th className="text-right">Jumlah</th></tr></thead>
                <tbody>{f.payments.map((p) => (
                  <tr key={p.id}><td><strong>{p.number}</strong>{p.note && <span className="block text-sm text-text-muted">{p.note}</span>}</td><td className="text-sm whitespace-nowrap">{fmtDate(p.paidAt)}</td><td>{p.accountName}</td><td className="text-right cg-num">{formatRp(p.amount)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {dlg === 'receive' && f && <ReceiveDialog invoice={f} onClose={() => setDlg(null)} onDone={(m) => { setDlg(null); setNotice(m); state.reload(); }} />}
      {dlg === 'pay' && f && <PayDialog invoice={f} onClose={() => setDlg(null)} onDone={(m) => { setDlg(null); setNotice(m); state.reload(); }} />}
    </>
  );
}

function ReceiveDialog({ invoice, onClose, onDone }: { invoice: PurchaseInvoice; onClose: () => void; onDone: (msg: string) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const open = invoice.lines.filter((l) => l.receivedQty < l.qty);
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(open.map((l) => [l.id, String(Math.round((l.qty - l.receivedQty) * 10000) / 10000)])));
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(newId());
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = { id: key.current, invoiceId: invoice.id, note: note.trim() || undefined, items: open.map((l) => ({ lineId: l.id, qty: numOf(qty[l.id] ?? '') })) };
    const problem = purchaseReceiveProblem(input, invoice.lines);
    if (problem) return setErr(problem);
    setBusy(true); setErr('');
    try { await data.receivePurchase(input); onDone('Penerimaan dicatat. Stok bertambah sesuai jumlah yang diterima.'); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Penerimaan gagal dicatat.'); setBusy(false); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-terima" style={{ margin: 'auto', maxWidth: 'min(560px, calc(100vw - 16px))' }}>
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-terima" className="cg-modal__title">Terima barang · {invoice.number}</h2>
        <div className="grid gap-8">
          {open.map((l) => (
            <div key={l.id} className="cg-field"><label className="cg-label" htmlFor={`tr-${l.id}`}>{l.name} <span className="text-text-muted">(sisa {fmtQty(Math.round((l.qty - l.receivedQty) * 10000) / 10000)} {l.unit})</span></label>
              <input id={`tr-${l.id}`} className="cg-input" inputMode="decimal" maxLength={14} value={qty[l.id] ?? ''} onChange={(e) => { setQty((s) => ({ ...s, [l.id]: e.target.value.replace(/[^\d.,]/g, '') })); setErr(''); }} /></div>
          ))}
        </div>
        <div className="cg-field"><label className="cg-label" htmlFor="tr-catatan">Catatan</label><input id="tr-catatan" className="cg-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy} aria-busy={busy}>{busy ? 'Menyimpan…' : 'Catat penerimaan'}</button>
        </div>
      </form>
    </dialog>
  );
}

function PayDialog({ invoice, onClose, onDone }: { invoice: PurchaseInvoice; onClose: () => void; onDone: (msg: string) => void }) {
  const data = useData();
  const d = useDialog(onClose);
  const accounts = useAsync(() => data.listPayAccounts(), [data]);
  const [account, setAccount] = useState('');
  const [amount, setAmount] = useState(String(invoice.outstanding));
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(newId());
  const list = accounts.status === 'ready' ? accounts.data : [];
  const chosen = account || list[0]?.id || '';
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input = { id: key.current, invoiceId: invoice.id, accountId: chosen, amount: numOf(amount), paidAt: date || undefined, note: note.trim() || undefined };
    const problem = purchasePayProblem(input, invoice.outstanding);
    if (problem) return setErr(problem);
    setBusy(true); setErr('');
    try { const r = await data.payPurchase(input); onDone(r.status === 'paid' ? `Faktur ${r.number} lunas.` : `Pembayaran dicatat. Sisa ${formatRp(r.outstanding)}.`); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Pembayaran gagal dicatat.'); setBusy(false); }
  }
  return (
    <dialog {...d.props} aria-labelledby="judul-bayar">
      <form onSubmit={submit} className="grid gap-12" noValidate>
        <h2 id="judul-bayar" className="cg-modal__title">Bayar {invoice.number}</h2>
        <p className="text-sm text-text-muted">Sisa hutang <strong className="cg-num">{formatRp(invoice.outstanding)}</strong></p>
        {accounts.status === 'error' && <ErrorBox message={accounts.message} onRetry={accounts.reload} />}
        <div className="cg-field"><label className="cg-label" htmlFor="by-akun">Dibayar dari</label>
          <select id="by-akun" className="cg-input" value={chosen} onChange={(e) => setAccount(e.target.value)}>{list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="cg-field"><label className="cg-label" htmlFor="by-jumlah">Jumlah (Rp)</label><input id="by-jumlah" className="cg-input" inputMode="numeric" maxLength={13} value={amount} onChange={(e) => { setAmount(rpDigits(e.target.value)); setErr(''); }} /></div>
          <div className="cg-field"><label className="cg-label" htmlFor="by-tgl">Tanggal bayar</label><input id="by-tgl" type="date" className="cg-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="cg-field"><label className="cg-label" htmlFor="by-catatan">Catatan</label><input id="by-catatan" className="cg-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <p role="alert" className="text-danger-strong">{err}</p>}
        <div className="cg-modal__actions">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={() => d.ref.current?.close()}>Batal</button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={busy || list.length === 0} aria-busy={busy}>{busy ? 'Menyimpan…' : 'Catat pembayaran'}</button>
        </div>
      </form>
    </dialog>
  );
}
