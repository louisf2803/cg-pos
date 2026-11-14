import { useState } from 'react';
import { formatRp, newId, purchaseInvoiceProblem, type OutletContext, type StockMoveEntry, type StockOpnameSummary, type StockTransfer, type PurchaseInvoiceSummary, TRANSFER_STATUS_LABEL } from '@cgpos/shared';
import { useData } from '../../lib/app-data';
import { useAsync } from '../../lib/use-async';
import { FormShell, ProductLines, newLine, num, type Line, type LineOption, type StepId } from './common';

export interface Range { from: string; to: string }
export interface SectionProps { ctx: OutletContext; range: Range; search: string; canEdit: boolean; adding: boolean; onAddClose: () => void }

const inRange = (iso: string, r: Range) => iso >= r.from && iso < r.to;
const fmt = (iso: string | undefined, tz: string) => (iso ? new Date(iso).toLocaleString('id-ID', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const dateInput = (tz: string) => new Date().toLocaleDateString('en-CA', { timeZone: tz });

function Empty({ title, hint }: { title: string; hint: string }) {
  return <div className="cg-empty"><p className="font-semibold">{title}</p><p className="text-sm text-text-muted">{hint}</p></div>;
}
function Rows({ children }: { children: React.ReactNode }) { return <ul className="divide-y divide-border border-y border-border">{children}</ul>; }
function Row({ title, sub, right, rightSub }: { title: string; sub: string; right?: string; rightSub?: string }) {
  return (
    <li className="px-16 py-12 flex items-center justify-between gap-12 min-w-0">
      <span className="min-w-0"><span className="block text-sm font-medium truncate">{title}</span><span className="block text-xs text-text-muted truncate">{sub}</span></span>
      <span className="text-right shrink-0"><span className="block text-sm cg-num">{right}</span><span className="block text-xs text-text-muted">{rightSub}</span></span>
    </li>
  );
}

/* ---------------------------------------------------------------- Faktur Pembelian */
export function InvoicesSection({ ctx, range, search, canEdit, adding, onAddClose }: SectionProps) {
  const data = useData();
  const list = useAsync(() => data.listPurchaseInvoices(), [data]);
  if (list.status === 'loading') return <div className="cg-skeleton h-[120px] m-16" aria-busy="true" />;
  if (list.status === 'error') return <p className="cg-banner cg-banner--danger m-16" role="alert">{list.message}</p>;
  const s = search.trim().toLowerCase();
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: ctx.timezone });
  const d0 = day(range.from), d1 = day(new Date(new Date(range.to).getTime() - 1).toISOString());
  const rows = list.data.filter((f: PurchaseInvoiceSummary) => f.invoiceDate >= d0 && f.invoiceDate <= d1)
    .filter((f) => !s || f.number.toLowerCase().includes(s) || f.supplierName.toLowerCase().includes(s) || (f.supplierInvoiceNo ?? '').toLowerCase().includes(s));
  return (
    <>
      {rows.length === 0 ? <Empty title="Faktur pembelian tidak tersedia" hint="Tambahkan faktur pembelian lewat tombol Tambah faktur pembelian." /> : (
        <Rows>{rows.map((f) => <Row key={f.id} title={f.number} sub={`${f.supplierName}${f.supplierInvoiceNo ? ` · ${f.supplierInvoiceNo}` : ''} · ${f.invoiceDate}`} right={formatRp(f.total)} rightSub={f.outstanding > 0 ? `sisa ${formatRp(f.outstanding)}` : 'lunas'} />)}</Rows>
      )}
      {adding && canEdit && <InvoiceForm ctx={ctx} onClose={onAddClose} onSaved={() => { onAddClose(); list.reload(); }} />}
    </>
  );
}

function InvoiceForm({ ctx, onClose, onSaved }: { ctx: OutletContext; onClose: () => void; onSaved: () => void }) {
  const data = useData();
  const items = useAsync(() => data.listPurchaseItems(), [data]);
  const suppliers = useAsync(() => data.listSuppliers(), [data]);
  const [step, setStep] = useState<StepId>('info');
  const [id] = useState(() => newId());
  const [supplierId, setSupplierId] = useState('');
  const [no, setNo] = useState('');
  const [date, setDate] = useState(() => dateInput(ctx.timezone));
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const options: LineOption[] = items.status === 'ready' ? items.data.map((i) => ({ id: i.productId, label: i.name, unit: i.baseUnit })) : [];

  async function save() {
    setErr('');
    const filled = lines.filter((l) => l.productId && num(l.qty) > 0);
    const input = {
      id, supplierId: supplierId || null, supplierInvoiceNo: no.trim() || undefined, invoiceDate: date, note: note.trim() || undefined, discount: 0, tax: 0, otherCost: 0,
      lines: filled.map((l) => { const it = items.status === 'ready' ? items.data.find((i) => i.productId === l.productId)! : null; const base = it?.units.find((u) => u.isBase) ?? it?.units[0]; return { productId: l.productId, unitId: base?.unitId ?? '', qty: num(l.qty), unitPrice: num(l.price) }; }),
    };
    const problem = purchaseInvoiceProblem(input);
    if (problem) { setErr(problem); setStep('produk'); return; }
    setBusy(true);
    try { await data.createPurchaseInvoice(input); onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : 'Faktur gagal dibuat.'); setBusy(false); }
  }
  return (
    <FormShell title="Tambah Faktur Pembelian" step={step} setStep={setStep} busy={busy} error={err} dirty={!!(supplierId || no || note || lines.some((l) => l.productId))} onClose={onClose} onSave={save}
      info={<>
        <label className="block text-sm">Nomor faktur pemasok<input className="cg-input w-full mt-4" maxLength={60} value={no} onChange={(e) => setNo(e.target.value)} placeholder="Opsional" /></label>
        <label className="block text-sm">Pemasok<select className="cg-input w-full mt-4" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Tanpa pemasok</option>{suppliers.status === 'ready' && suppliers.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="block text-sm">Tanggal faktur<input type="date" className="cg-input w-full mt-4" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="block text-sm">Catatan<textarea className="cg-input w-full mt-4" rows={3} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </>}
      produk={<ProductLines options={options} lines={lines} onChange={setLines} withPrice qtyLabel="Jumlah diterima" />} />
  );
}

/* ---------------------------------------------------------------- Stok Opname */
export function OpnameSection({ ctx, range, search, canEdit, adding, onAddClose }: SectionProps) {
  const data = useData();
  const list = useAsync(() => data.listOpnames(), [data]);
  const [msg, setMsg] = useState('');
  if (list.status === 'loading') return <div className="cg-skeleton h-[120px] m-16" aria-busy="true" />;
  if (list.status === 'error') return <p className="cg-banner cg-banner--danger m-16" role="alert">{list.message}</p>;
  const s = search.trim().toLowerCase();
  const rows = list.data.filter((o: StockOpnameSummary) => inRange(o.countedAt, range) && (!s || o.number.toLowerCase().includes(s) || (o.note ?? '').toLowerCase().includes(s)));
  async function finalize(id: string) { setMsg(''); try { await data.finalizeOpname(id); list.reload(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Gagal menyelesaikan opname.'); } }
  return (
    <>
      {msg && <p className="cg-banner cg-banner--danger m-16" role="alert">{msg}</p>}
      {rows.length === 0 ? <Empty title="Stok opname tidak tersedia" hint="Tambahkan stok opname lewat tombol Tambah stok opname." /> : (
        <Rows>{rows.map((o) => (
          <li key={o.id} className="px-16 py-12 flex items-center justify-between gap-12 min-w-0">
            <span className="min-w-0"><span className="block text-sm font-medium truncate">{o.number} · {o.status === 'draft' ? 'Draf' : 'Final'}</span><span className="block text-xs text-text-muted truncate">{fmt(o.countedAt, ctx.timezone)} · {o.lineCount} barang · {o.diffCount} selisih{o.note ? ` · ${o.note}` : ''}</span></span>
            {o.status === 'draft' && canEdit && <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => finalize(o.id)}>Selesaikan</button>}
          </li>
        ))}</Rows>
      )}
      {adding && canEdit && <OpnameForm onClose={onAddClose} onSaved={() => { onAddClose(); list.reload(); }} />}
    </>
  );
}

function OpnameForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const data = useData();
  const stock = useAsync(() => data.listStock(), [data]);
  const [step, setStep] = useState<StepId>('info');
  const [id] = useState(() => newId());
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const options: LineOption[] = stock.status === 'ready' ? stock.data.map((i) => ({ id: i.productId, label: `${i.name} (sistem ${i.qty})`, unit: i.unit })) : [];
  async function save(final: boolean) {
    setErr('');
    const filled = lines.filter((l) => l.productId && l.qty !== '');
    if (filled.length === 0) { setErr('Isi minimal satu barang yang dihitung.'); setStep('produk'); return; }
    setBusy(true);
    try {
      await data.saveOpname({ id, note: note.trim() || undefined, lines: filled.map((l) => ({ productId: l.productId, countedQty: num(l.qty) })) });
      if (final) await data.finalizeOpname(id);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Opname gagal disimpan.'); setBusy(false); }
  }
  return (
    <FormShell title="Tambah Stok Opname" step={step} setStep={setStep} busy={busy} error={err} dirty={!!(note || lines.some((l) => l.productId))} onClose={onClose} onSave={() => save(true)} onSaveDraft={() => save(false)}
      info={<label className="block text-sm">Catatan<textarea className="cg-input w-full mt-4" rows={3} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mis. hitung akhir bulan" /></label>}
      produk={<ProductLines options={options} lines={lines} onChange={setLines} qtyLabel="Jumlah dihitung" />} />
  );
}

/* ---------------------------------------------------------------- Terima Mutasi Stok */
export function TransferSection({ ctx, range, search, canEdit, adding, onAddClose }: SectionProps) {
  const data = useData();
  const list = useAsync(() => data.listStockTransfers(), [data]);
  const [msg, setMsg] = useState('');
  if (list.status === 'loading') return <div className="cg-skeleton h-[120px] m-16" aria-busy="true" />;
  if (list.status === 'error') return <p className="cg-banner cg-banner--danger m-16" role="alert">{list.message}</p>;
  const s = search.trim().toLowerCase();
  const rows = list.data.filter((t: StockTransfer) => inRange(t.createdAt, range) && (!s || t.number.toLowerCase().includes(s) || t.fromName.toLowerCase().includes(s)));
  const pending = list.data.filter((t) => t.status === 'in_transit');
  async function receive(id: string) { setMsg(''); try { await data.receiveStockTransfer(id); list.reload(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Gagal menerima mutasi.'); } }
  return (
    <>
      {msg && <p className="cg-banner cg-banner--danger m-16" role="alert">{msg}</p>}
      {rows.length === 0 ? <Empty title="Terima mutasi stok tidak tersedia" hint="Mutasi yang dikirim ke outlet ini tampil di sini dan bisa diterima." /> : (
        <Rows>{rows.map((t) => (
          <li key={t.id} className="px-16 py-12 flex items-center justify-between gap-12 min-w-0">
            <span className="min-w-0"><span className="block text-sm font-medium truncate">{t.number} · {TRANSFER_STATUS_LABEL[t.status]}</span><span className="block text-xs text-text-muted truncate">{t.fromName} → {t.toName} · {fmt(t.createdAt, ctx.timezone)} · {t.lines.length} barang</span></span>
            {t.status === 'in_transit' && canEdit && <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => receive(t.id)}>Terima</button>}
          </li>
        ))}</Rows>
      )}
      {adding && canEdit && (
        <div className="fixed inset-0 z-40 bg-surface flex flex-col">
          <header className="flex items-center justify-between gap-12 px-16 py-12 bg-surface-raised border-b border-border"><h1 className="text-base font-bold">Terima Mutasi Stok</h1><button type="button" className="cg-btn cg-btn--ghost cg-btn--sm" onClick={onAddClose}>Tutup</button></header>
          <div className="flex-1 overflow-y-auto">
            {pending.length === 0 ? <Empty title="Tidak ada mutasi yang menunggu" hint="Mutasi berstatus dalam perjalanan tampil di sini." /> : (
              <Rows>{pending.map((t) => (
                <li key={t.id} className="px-16 py-12 flex items-center justify-between gap-12 min-w-0">
                  <span className="min-w-0"><span className="block text-sm font-medium truncate">{t.number}</span><span className="block text-xs text-text-muted truncate">{t.fromName} → {t.toName} · {t.lines.map((l) => `${l.name} ${l.qty}`).join(', ')}</span></span>
                  <button type="button" className="cg-btn cg-btn--primary cg-btn--sm" onClick={async () => { await receive(t.id); }}>Terima</button>
                </li>
              ))}</Rows>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- Stok Terbuang */
export function WasteSection({ ctx, range, search, canEdit, adding, onAddClose }: SectionProps) {
  const data = useData();
  const list = useAsync(() => data.listStockMovesBetween({ from: range.from, to: range.to }, ['waste']), [data, range.from, range.to]);
  if (list.status === 'loading') return <div className="cg-skeleton h-[120px] m-16" aria-busy="true" />;
  if (list.status === 'error') return <p className="cg-banner cg-banner--danger m-16" role="alert">{list.message}</p>;
  const s = search.trim().toLowerCase();
  const rows = list.data.filter((m: StockMoveEntry) => !s || m.productName.toLowerCase().includes(s) || (m.reason ?? '').toLowerCase().includes(s));
  return (
    <>
      {rows.length === 0 ? <Empty title="Stok terbuang tidak tersedia" hint="Catat stok terbuang lewat tombol Tambah stok terbuang." /> : (
        <Rows>{rows.map((m) => <Row key={m.id} title={m.productName} sub={`${fmt(m.occurredAt, ctx.timezone)}${m.reason ? ` · ${m.reason}` : ''}`} right={`${Math.abs(m.qtyDelta)} ${m.unit}`} rightSub={formatRp(Math.abs(m.totalCost))} />)}</Rows>
      )}
      {adding && canEdit && <WasteForm ctx={ctx} onClose={onAddClose} onSaved={() => { onAddClose(); list.reload(); }} />}
    </>
  );
}

function WasteForm({ ctx, onClose, onSaved }: { ctx: OutletContext; onClose: () => void; onSaved: () => void }) {
  const data = useData();
  const stock = useAsync(() => data.listStock(), [data]);
  const [step, setStep] = useState<StepId>('info');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => dateInput(ctx.timezone));
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const options: LineOption[] = stock.status === 'ready' ? stock.data.map((i) => ({ id: i.productId, label: `${i.name} (sisa ${i.qty})`, unit: i.unit })) : [];
  async function save() {
    setErr('');
    const filled = lines.filter((l) => l.productId && num(l.qty) > 0);
    if (filled.length === 0) { setErr('Isi minimal satu barang dan jumlahnya.'); setStep('produk'); return; }
    setBusy(true);
    try {
      for (const l of filled) await data.postStock({ id: newId(), productId: l.productId, kind: 'waste', qty: num(l.qty), reason: [l.note?.trim(), note.trim()].filter(Boolean).join(' · ') || `Stok terbuang ${date}` });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Stok terbuang gagal disimpan.'); setBusy(false); }
  }
  return (
    <FormShell title="Tambah Stok Terbuang" step={step} setStep={setStep} busy={busy} error={err} dirty={!!(note || lines.some((l) => l.productId))} onClose={onClose} onSave={save}
      info={<>
        <label className="block text-sm">Tanggal<input type="date" className="cg-input w-full mt-4" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="block text-sm">Catatan<textarea className="cg-input w-full mt-4" rows={3} maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: stok terbuang akhir shift" /></label>
      </>}
      produk={<ProductLines options={options} lines={lines} onChange={setLines} withNote qtyLabel="Jumlah terbuang" />} />
  );
}
