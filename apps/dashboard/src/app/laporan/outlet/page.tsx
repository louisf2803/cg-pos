'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { COMPARE_METRIC_LABEL, barPercents, formatRp, toCsv, type CompareMetric, type OutletComparisonRow } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

const METRICS: CompareMetric[] = ['sales', 'orders', 'avgTicket', 'margin'];
const show = (metric: CompareMetric, r: OutletComparisonRow) => (metric === 'orders' ? String(r.orders) : formatRp(r[metric]));

export default function OutletComparisonPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);
  const [metric, setMetric] = useState<CompareMetric>('sales');
  const state = useAsync(() => data.outletComparison(range), [data, range.from, range.to]);
  const rows = state.status === 'ready' ? state.data : [];
  const bars = barPercents(rows, metric);

  function downloadCsv() {
    if (rows.length === 0) return;
    downloadCsvWithHistory({
      fileName: `banding-outlet-${range.label.replace(/\s+/g, '_')}.csv`,
      csvContent: toCsv([
        ['Outlet', 'Penjualan', 'Transaksi', 'Rata-rata per transaksi', 'Harga pokok', 'Margin', 'Margin (%)', 'Produk terlaris'],
        ...rows.map((r) => [r.name, r.sales, r.orders, r.avgTicket, r.cogs, r.margin, r.marginPct, r.topProducts.map((p) => `${p.name} (${p.qty})`).join('; ')]),
      ]),
      reportName: 'Perbandingan antar outlet', period: range.label, rowCount: rows.length, sourceUrl: '/laporan/outlet',
    });
  }

  return (
    <div className="min-w-0">
      <PageHeader title="Perbandingan antar outlet" subtitle={`Semua outlet aktif · ${range.label}`}
        actions={<button className="cg-btn cg-btn--secondary" onClick={downloadCsv} disabled={rows.length === 0}><Download className="cg-icon" aria-hidden /> Unduh CSV</button>} />
      <div className="mb-16"><RangePicker value={value} today={today} onChange={setValue} /></div>
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {state.status === 'loading' && <div className="grid gap-8" aria-busy="true" aria-label="Memuat data">{[0, 1, 2].map((i) => <div key={i} className="cg-skeleton" style={{ height: 56 }} />)}</div>}
      {state.status === 'ready' && rows.length === 0 && <div className="cg-empty"><p><strong>Belum ada outlet aktif.</strong></p></div>}
      {state.status === 'ready' && rows.length > 0 && (
        <>
          {rows.length === 1 && <p className="cg-banner cg-banner--info mb-16" role="status">Baru ada satu outlet aktif, jadi belum ada yang dibandingkan. Tambahkan outlet lain untuk melihat perbandingan.</p>}
          <div role="group" aria-label="Ukuran yang dibandingkan" className="flex flex-wrap gap-8 mb-12">
            {METRICS.map((m) => <button key={m} aria-pressed={metric === m} className={`cg-btn ${metric === m ? 'cg-btn--primary' : 'cg-btn--secondary'}`} onClick={() => setMetric(m)}>{COMPARE_METRIC_LABEL[m]}</button>)}
          </div>
          <ul className="grid gap-8 mb-16" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label={`Batang ${COMPARE_METRIC_LABEL[metric]} per outlet`}>
            {rows.map((r, i) => (
              <li key={r.outletId} className="grid gap-8" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 3fr) minmax(0, 1fr)', alignItems: 'center' }}>
                <span className="truncate">{r.name}</span>
                <span style={{ background: 'var(--color-surface-sunken, var(--color-border))', borderRadius: 'var(--radius-md)', height: 16, display: 'block' }} role="presentation">
                  <span style={{ display: 'block', height: '100%', width: `${bars[i]}%`, background: 'var(--color-accent)', borderRadius: 'var(--radius-md)' }} />
                </span>
                <span className="text-right cg-num">{show(metric, r)}</span>
              </li>
            ))}
          </ul>
          <div className="cg-data-wrap min-w-0"><table className="cg-data" aria-label="Perbandingan antar outlet">
            <thead><tr><th>Outlet</th><th className="text-right">Penjualan</th><th className="text-right">Transaksi</th><th className="text-right">Rata-rata</th><th className="text-right">Margin</th><th className="text-right">Margin %</th><th>Produk terlaris</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.outletId}>
                <td>{r.name}</td><td className="text-right cg-num">{formatRp(r.sales)}</td><td className="text-right cg-num">{r.orders}</td>
                <td className="text-right cg-num">{formatRp(r.avgTicket)}</td><td className="text-right cg-num">{formatRp(r.margin)}</td><td className="text-right cg-num">{r.cogs === 0 ? '—' : `${r.marginPct}%`}</td>
                <td>{r.topProducts.length === 0 ? '—' : r.topProducts.map((p) => `${p.name} (${p.qty})`).join(', ')}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="text-sm text-text-muted mt-8">Margin = penjualan dikurangi harga pokok dari jurnal. Tanda — berarti belum ada harga pokok tercatat pada rentang ini.</p>
        </>
      )}
    </div>
  );
}
