'use client';

import { useMemo, useState } from 'react';
import { Factory, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatRp, newId, productionRequirements, productionRunProblem, productionShortfalls, type ProductionTemplate } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { fmtDate, todayKey } from '@/components/fin-common';
import { TemplateDialog } from '@/components/produksi/template-dialog';

type Tab = 'run' | 'templates' | 'history';
const qty = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n);

export default function ProductionPage() {
  const data = useData();
  const templates = useAsync(() => data.listProductionTemplates(), [data]);
  const stock = useAsync(() => data.listStock(), [data]);
  const runs = useAsync(() => data.listProductionRuns(), [data]);
  const [tab, setTab] = useState<Tab>('run');
  const [tplId, setTplId] = useState('');
  const [batches, setBatches] = useState('1');
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState('');
  const [dialog, setDialog] = useState<{ template: ProductionTemplate | null } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => (templates.status === 'ready' ? templates.data : []), [templates]);
  const active = list.filter((t) => t.isActive);
  const items = useMemo(() => (stock.status === 'ready' ? stock.data : []), [stock]);
  const current = list.find((t) => t.id === (tplId || active[0]?.id));
  const n = Number(batches.replace(',', '.')) || 0;
  const stockOf = (id: string) => items.find((i) => i.productId === id)?.qty ?? 0;
  const unitOf = (id: string) => items.find((i) => i.productId === id)?.unit ?? '';
  const req = current && n > 0 ? productionRequirements(current, n) : null;
  const short = current && n > 0 ? productionShortfalls(current, n, stockOf) : [];

  async function act(fn: () => Promise<string>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { setNotice(await fn()); templates.reload(); stock.reload(); runs.reload(); } catch (x) { setError(x instanceof Error ? x.message : 'Gagal memproses.'); } finally { setBusy(false); }
  }
  const run = () => act(async () => {
    const input = { id: newId(), templateId: current?.id ?? '', batches: n, date, ...(note.trim() ? { note } : {}) };
    const problem = productionRunProblem(input);
    if (problem) throw new Error(problem);
    const r = await data.runProduction(input);
    setNote('');
    return `Produksi ${r.number}: ${qty(r.producedQty)} ${unitOf(current!.outputProductId)} ${current!.outputName} dibuat dengan biaya ${formatRp(r.totalCost)}.`;
  });

  const loading = templates.status === 'loading' || stock.status === 'loading';
  return (
    <div className="min-w-0">
      <PageHeader title="Produksi stok" subtitle="Ubah bahan menjadi barang jadi memakai acuan produksi. Stok bahan berkurang dan stok barang jadi bertambah dengan harga perolehan dari biaya bahan."
        actions={<button className="cg-btn cg-btn--primary" disabled={stock.status !== 'ready'} onClick={() => { setNotice(''); setDialog({ template: null }); }}><Plus className="cg-icon" aria-hidden /> Acuan baru</button>} />
      {notice && <p role="status" className="cg-banner cg-banner--info mb-16">{notice}</p>}
      {error && <p role="alert" className="cg-banner cg-banner--danger mb-16">{error}</p>}
      {[templates, stock, runs].map((s, i) => s.status === 'error' && <ErrorBox key={i} message={s.message} onRetry={s.reload} />)}
      {loading && <div className="grid gap-8" aria-busy="true" aria-label="Memuat">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 48 }} />)}</div>}
      {!loading && templates.status === 'ready' && (
        <>
          <div role="tablist" aria-label="Tampilan" className="flex flex-wrap gap-8 mb-12">
            {([['run', 'Jalankan produksi'], ['templates', 'Acuan produksi'], ['history', 'Riwayat']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`cg-btn ${tab === id ? 'cg-btn--primary' : 'cg-btn--secondary'}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {tab === 'run' && (active.length === 0 ? (
            <div className="cg-empty"><p><strong>Belum ada acuan produksi aktif.</strong></p><p className="text-text-muted">Buat acuan dulu: tentukan bahan dan jumlah barang jadi yang dihasilkan.</p></div>
          ) : (
            <div className="grid gap-12" style={{ maxWidth: 640 }}>
              <div className="cg-field"><label className="cg-label" htmlFor="pr-acuan">Acuan produksi</label>
                <select id="pr-acuan" className="cg-input" value={current?.id ?? ''} onChange={(e) => setTplId(e.target.value)}>{active.map((t) => <option key={t.id} value={t.id}>{t.name} → {t.outputName}</option>)}</select></div>
              <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                <div className="cg-field"><label className="cg-label" htmlFor="pr-batch">Jumlah batch</label><input id="pr-batch" className="cg-input cg-num" inputMode="decimal" value={batches} onChange={(e) => setBatches(e.target.value.replace(/[^\d.,]/g, ''))} /></div>
                <div className="cg-field"><label className="cg-label" htmlFor="pr-tgl">Tanggal</label><input id="pr-tgl" type="date" className="cg-input" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} /></div>
              </div>
              <div className="cg-field"><label className="cg-label" htmlFor="pr-cat">Catatan (opsional)</label><input id="pr-cat" className="cg-input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
              {current && req && (
                <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label="Kebutuhan bahan">
                  <thead><tr><th>Bahan</th><th className="text-right">Dibutuhkan</th><th className="text-right">Stok</th><th>Status</th></tr></thead>
                  <tbody>{req.needs.map((x) => {
                    const lack = short.some((s) => s.productId === x.productId);
                    return <tr key={x.productId}><td>{current.lines.find((l) => l.productId === x.productId)?.name}</td><td className="text-right cg-num">{qty(x.qty)} {unitOf(x.productId)}</td><td className="text-right cg-num">{qty(stockOf(x.productId))}</td><td>{lack ? <span className="cg-badge cg-badge--danger">Kurang</span> : <span className="cg-badge cg-badge--success">Cukup</span>}</td></tr>;
                  })}</tbody>
                  <tfoot><tr><th colSpan={4}>Hasil: {qty(req.produced)} {unitOf(current.outputProductId)} {current.outputName}</th></tr></tfoot>
                </table></div>
              )}
              {short.length > 0 && <p role="note" className="cg-banner cg-banner--info">Stok {short.length} bahan kurang. Produksi tetap bisa jalan bila pengaturan stok mengizinkan stok minus; bila tidak, server akan menolaknya.</p>}
              <div><button className="cg-btn cg-btn--primary" disabled={busy || !current || n <= 0} onClick={run}><Factory className="cg-icon" aria-hidden /> {busy ? 'Memproses…' : 'Jalankan produksi'}</button></div>
            </div>
          ))}

          {tab === 'templates' && (list.length === 0 ? (
            <div className="cg-empty"><p><strong>Belum ada acuan produksi.</strong></p><p className="text-text-muted">Pilih Acuan baru untuk membuat yang pertama.</p></div>
          ) : (
            <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label="Acuan produksi">
              <thead><tr><th>Acuan</th><th>Barang jadi</th><th>Bahan</th><th>Status</th><th><span className="cg-sr">Aksi</span></th></tr></thead>
              <tbody>{list.map((t) => (
                <tr key={t.id}><td>{t.name}</td><td>{qty(t.outputQty)} {unitOf(t.outputProductId)} {t.outputName}</td>
                  <td>{t.lines.map((l) => `${l.name} ${qty(l.qty)} ${unitOf(l.productId)}`.trim()).join(', ')}</td><td><span className="cg-badge">{t.isActive ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td className="flex gap-8">
                    <button className="cg-btn cg-btn--secondary" aria-label={`Ubah ${t.name}`} onClick={() => { setNotice(''); setDialog({ template: t }); }}><Pencil className="cg-icon" aria-hidden /></button>
                    <button className="cg-btn cg-btn--ghost" aria-label={`Hapus ${t.name}`} disabled={busy} onClick={() => act(async () => { await data.deleteProductionTemplate(t.id); return `Acuan ${t.name} dihapus.`; })}><Trash2 className="cg-icon" aria-hidden /></button>
                  </td></tr>
              ))}</tbody>
            </table></div>
          ))}

          {tab === 'history' && (runs.status !== 'ready' || runs.data.length === 0 ? (
            <div className="cg-empty"><p><strong>Belum ada produksi.</strong></p></div>
          ) : (
            <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label="Riwayat produksi">
              <thead><tr><th>Nomor</th><th>Tanggal</th><th>Acuan</th><th className="text-right">Batch</th><th className="text-right">Jadi</th><th className="text-right">Biaya</th></tr></thead>
              <tbody>{runs.data.map((r) => <tr key={r.id}><td>{r.number}</td><td>{fmtDate(r.date)}</td><td>{r.templateName}</td><td className="text-right cg-num">{qty(r.batches)}</td><td className="text-right cg-num">{qty(r.producedQty)}</td><td className="text-right cg-num">{formatRp(r.totalCost)}</td></tr>)}</tbody>
            </table></div>
          ))}
        </>
      )}
      {dialog && stock.status === 'ready' && <TemplateDialog items={items} template={dialog.template} onClose={() => setDialog(null)} onDone={(m) => { setDialog(null); setNotice(m); templates.reload(); }} />}
    </div>
  );
}
