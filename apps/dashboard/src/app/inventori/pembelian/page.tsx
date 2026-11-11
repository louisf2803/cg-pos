'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Ban, FileText, Plus, Save } from 'lucide-react';
import { formatRp, newId, purchaseOrderProblem, purchaseSubtotal, purchaseTotal, PO_STATUS_LABEL, type PurchaseItem, type PurchaseOrder, type Supplier } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { emptyLine, fromLine, LinesEditor, numOf, rpDigits, toLineInputs, type LineDraft } from '@/components/purchase-lines';

const fmtDate = (d: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${d}T00:00:00Z`));
type View = { kind: 'list' } | { kind: 'edit'; id: string } | { kind: 'show'; id: string };

export default function PurchaseOrdersPage() {
  const data = useData();
  const list = useAsync(() => data.listPurchaseOrders(), [data]);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [notice, setNotice] = useState('');
  const back = (msg?: string) => { setView({ kind: 'list' }); if (msg) setNotice(msg); list.reload(); };
  if (view.kind === 'edit') return <Editor id={view.id} onBack={back} />;
  if (view.kind === 'show') return <Viewer id={view.id} onBack={() => back()} onChanged={(m) => back(m)} />;
  return (
    <>
      <PageHeader title="Pemesanan stok" subtitle="Buat pesanan ke pemasok, lalu buatkan faktur saat barang datang"
        actions={<button className="cg-btn cg-btn--primary" onClick={() => { setNotice(''); setView({ kind: 'edit', id: newId() }); }}><Plus className="cg-icon" aria-hidden /> Pesanan baru</button>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {list.status === 'error' && <ErrorBox message={list.message} onRetry={list.reload} />}
      {list.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {list.status === 'ready' && (list.data.length === 0 ? (
        <div className="cg-empty"><p><strong>Belum ada pesanan.</strong></p><p className="text-text-muted">Pesanan membantu mencatat apa yang sudah kamu minta dari pemasok sebelum barangnya datang.</p>
          <button className="cg-btn cg-btn--primary" onClick={() => setView({ kind: 'edit', id: newId() })}>Buat pesanan pertama</button></div>
      ) : (
        <div className="cg-data-wrap">
          <table className="cg-data">
            <thead><tr><th>Nomor</th><th>Pemasok</th><th>Tanggal</th><th>Status</th><th className="text-right">Item</th><th className="text-right">Total</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
            <tbody>{list.data.map((o) => (
              <tr key={o.id}>
                <td><strong>{o.number}</strong></td><td className="break-words max-w-[240px]">{o.supplierName}</td>
                <td className="text-sm whitespace-nowrap">{fmtDate(o.orderDate)}{o.expectedDate && <span className="block text-text-muted">tiba {fmtDate(o.expectedDate)}</span>}</td>
                <td><span className={`cg-badge ${o.status === 'received' ? 'cg-badge--accent' : ''}`}>{PO_STATUS_LABEL[o.status]}</span></td>
                <td className="text-right cg-num">{o.lineCount}</td><td className="text-right cg-num">{formatRp(o.total)}</td>
                <td className="text-right whitespace-nowrap"><button className="cg-btn cg-btn--ghost cg-btn--sm" aria-label={`Buka ${o.number}`}
                  onClick={() => { setNotice(''); setView({ kind: 'show', id: o.id }); }}>Buka</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function Editor({ id, onBack }: { id: string; onBack: (msg?: string) => void }) {
  const data = useData();
  const state = useAsync(async () => {
    const [items, suppliers, order] = await Promise.all([data.listPurchaseItems(), data.listSuppliers(), data.getPurchaseOrder(id)]);
    return { items, suppliers, order };
  }, [data, id]);
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState('');
  const [expected, setExpected] = useState('');
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
    setSupplierId(o.supplierId); setDate(o.orderDate); setExpected(o.expectedDate ?? ''); setNote(o.note ?? '');
    setDiscount(o.discount ? String(o.discount) : ''); setTax(o.taxAmount ? String(o.taxAmount) : ''); setOther(o.otherCost ? String(o.otherCost) : '');
    setLines(o.lines.length ? o.lines.map(fromLine) : [emptyLine()]);
  }, [loaded]);
  const inputs = toLineInputs(lines, false);
  const sub = purchaseSubtotal(inputs);
  const total = purchaseTotal(inputs, numOf(discount), numOf(tax), numOf(other));

  async function save(status: 'draft' | 'ordered') {
    if (busy) return;
    const input = { id, supplierId, orderDate: date || undefined, expectedDate: expected || undefined, note: note.trim() || undefined, status, discount: numOf(discount), tax: numOf(tax), otherCost: numOf(other), lines: inputs };
    const problem = purchaseOrderProblem(input);
    if (problem) return setErr(problem);
    setBusy(true); setErr('');
    try { const o = await data.savePurchaseOrder(input); onBack(status === 'draft' ? `Draf ${o.number} disimpan.` : `Pesanan ${o.number} dikirim ke daftar dipesan.`); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Pesanan gagal disimpan.'); setBusy(false); }
  }
  return (
    <>
      <PageHeader title={loaded?.order ? `Ubah ${loaded.order.number}` : 'Pesanan baru'} subtitle="Pilih pemasok dan barang yang dipesan. Total dihitung otomatis."
        actions={<button className="cg-btn cg-btn--ghost" onClick={() => onBack()}><ArrowLeft className="cg-icon" aria-hidden /> Kembali</button>} />
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {loaded && (
        <div className="grid gap-16">
          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="cg-field"><label className="cg-label" htmlFor="po-pemasok">Pemasok</label>
              <select id="po-pemasok" className="cg-input" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setErr(''); }}>
                <option value="">Pilih pemasok…</option>{loaded.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="cg-field"><label className="cg-label" htmlFor="po-tgl">Tanggal pesan</label><input id="po-tgl" type="date" className="cg-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="cg-field"><label className="cg-label" htmlFor="po-tiba">Perkiraan tiba</label><input id="po-tiba" type="date" className="cg-input" value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
          </div>
          {loaded.suppliers.length === 0 && <p className="cg-banner cg-banner--info">Belum ada pemasok. <Link href="/inventori/pemasok">Tambah pemasok</Link> dulu.</p>}
          <LinesEditor items={loaded.items} lines={lines} onChange={(l) => { setLines(l); setErr(''); }} />
          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="cg-field"><label className="cg-label" htmlFor="po-diskon">Diskon pesanan (Rp)</label><input id="po-diskon" className="cg-input" inputMode="numeric" maxLength={13} value={discount} onChange={(e) => setDiscount(rpDigits(e.target.value))} /></div>
            <div className="cg-field"><label className="cg-label" htmlFor="po-pajak">Pajak (Rp)</label><input id="po-pajak" className="cg-input" inputMode="numeric" maxLength={13} value={tax} onChange={(e) => setTax(rpDigits(e.target.value))} /></div>
            <div className="cg-field"><label className="cg-label" htmlFor="po-lain">Biaya lain (Rp)</label><input id="po-lain" className="cg-input" inputMode="numeric" maxLength={13} value={other} onChange={(e) => setOther(rpDigits(e.target.value))} /></div>
          </div>
          <div className="cg-field"><label className="cg-label" htmlFor="po-catatan">Catatan</label><input id="po-catatan" className="cg-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <p data-testid="total-po">Subtotal <strong className="cg-num">{formatRp(sub)}</strong> · total pesanan <strong className="cg-num">{formatRp(total)}</strong></p>
          {err && <p role="alert" className="text-danger-strong">{err}</p>}
          <div className="flex flex-wrap gap-8">
            <button className="cg-btn cg-btn--secondary" onClick={() => void save('draft')} disabled={busy}><Save className="cg-icon" aria-hidden /> Simpan draf</button>
            <button className="cg-btn cg-btn--primary" onClick={() => void save('ordered')} disabled={busy}><FileText className="cg-icon" aria-hidden /> Pesan ke pemasok</button>
          </div>
        </div>
      )}
    </>
  );
}

function Viewer({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: (msg: string) => void }) {
  const data = useData();
  const state = useAsync(() => data.getPurchaseOrder(id), [data, id]);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (edit) return <Editor id={id} onBack={(m) => (m ? onChanged(m) : setEdit(false))} />;
  const o: PurchaseOrder | null | undefined = state.status === 'ready' ? state.data : undefined;
  async function cancel() {
    if (!o || busy) return;
    setBusy(true); setErr('');
    try {
      await data.savePurchaseOrder({ id: o.id, supplierId: o.supplierId, orderDate: o.orderDate, expectedDate: o.expectedDate, note: o.note, status: 'cancelled', discount: o.discount, tax: o.taxAmount, otherCost: o.otherCost,
        lines: o.lines.map((l) => ({ productId: l.productId, unitId: l.unitId, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount })) });
      onChanged(`Pesanan ${o.number} dibatalkan.`);
    } catch (x) { setErr(x instanceof Error ? x.message : 'Pesanan gagal dibatalkan.'); setBusy(false); }
  }
  const open = o && (o.status === 'draft' || o.status === 'ordered');
  return (
    <>
      <PageHeader title={o ? o.number : 'Pesanan'} subtitle={o ? `${o.supplierName} · ${PO_STATUS_LABEL[o.status]}` : undefined}
        actions={<button className="cg-btn cg-btn--ghost" onClick={onBack}><ArrowLeft className="cg-icon" aria-hidden /> Kembali</button>} />
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="cg-skeleton" style={{ height: 160 }} aria-busy="true" aria-label="Memuat" />}
      {state.status === 'ready' && !o && <div className="cg-empty"><p><strong>Pesanan tidak ditemukan.</strong></p></div>}
      {o && (
        <div className="grid gap-12 min-w-0">
          <p className="text-sm text-text-muted">Dipesan {fmtDate(o.orderDate)}{o.expectedDate ? ` · perkiraan tiba ${fmtDate(o.expectedDate)}` : ''}{o.note ? ` · ${o.note}` : ''}</p>
          <div className="cg-data-wrap">
            <table className="cg-data" aria-label="Barang pesanan">
              <thead><tr><th>Barang</th><th className="text-right">Jumlah</th><th className="text-right">Harga satuan</th><th className="text-right">Diskon</th><th className="text-right">Jumlah harga</th></tr></thead>
              <tbody>{o.lines.map((l) => (
                <tr key={l.id}><td className="break-words max-w-[240px]"><strong>{l.name}</strong></td><td className="text-right cg-num whitespace-nowrap">{l.qty} {l.unit}</td>
                  <td className="text-right cg-num">{formatRp(l.unitPrice)}</td><td className="text-right cg-num">{l.discount ? formatRp(l.discount) : '—'}</td><td className="text-right cg-num">{formatRp(l.lineTotal)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p>Diskon {formatRp(o.discount)} · pajak {formatRp(o.taxAmount)} · biaya lain {formatRp(o.otherCost)} · total <strong className="cg-num" data-testid="total-po">{formatRp(o.total)}</strong></p>
          {err && <p role="alert" className="text-danger-strong">{err}</p>}
          {open && (
            <div className="flex flex-wrap gap-8">
              {o.status === 'ordered' && <Link className="cg-btn cg-btn--primary" href={`/inventori/faktur?po=${o.id}`}><FileText className="cg-icon" aria-hidden /> Buat faktur dari pesanan</Link>}
              <button className="cg-btn cg-btn--secondary" onClick={() => setEdit(true)}>Ubah pesanan</button>
              <button className="cg-btn cg-btn--ghost" onClick={() => void cancel()} disabled={busy}><Ban className="cg-icon" aria-hidden /> Batalkan pesanan</button>
            </div>
          )}
          {o.status === 'draft' && <p className="text-sm text-text-muted">Ini masih draf. Buka &ldquo;Ubah pesanan&rdquo; lalu pilih &ldquo;Pesan ke pemasok&rdquo; untuk mengirimnya.</p>}
        </div>
      )}
    </>
  );
}
