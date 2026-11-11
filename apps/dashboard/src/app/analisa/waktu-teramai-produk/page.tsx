'use client';

import { useMemo, useState } from 'react';
import { Download, Flame, Package, Trophy } from 'lucide-react';
import { buildProductPeakHours, formatRp, toCsv, type ProductPeakRow } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';

const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);

export default function ProductPeakHoursPage() {
  const { ctx, value, setValue, range, today, state } = useReport();
  const [selectedCell, setSelectedCell] = useState<{
    productName: string;
    hour: number;
    qty: number;
    amount: number;
  } | null>(null);

  const report = useMemo(() => {
    if (state.status !== 'ready' || !state.data) return null;
    return buildProductPeakHours({
      orders: state.data.orders,
      timezone: ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta',
      topLimit: 10,
    });
  }, [state, ctx]);

  function downloadCsv() {
    if (!report || report.topProducts.length === 0) return;

    const hourHeaders = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
    const head = ['Produk', 'Total Terjual', 'Total Penjualan', 'Jam Teramai', 'Qty Jam Teramai', ...hourHeaders];

    const lines = report.topProducts.map((p) => [
      p.productName,
      p.totalQty,
      p.totalAmount,
      `${String(p.peakHour).padStart(2, '0')}:00`,
      p.peakHourQty,
      ...p.cells.map((c) => c.qty),
    ]);

    const totalLine = [
      'TOTAL KESELURUHAN (10 PRODUK)',
      report.topProducts.reduce((sum, p) => sum + p.totalQty, 0),
      report.topProducts.reduce((sum, p) => sum + p.totalAmount, 0),
      '—',
      '—',
      ...report.hourlyTotals.map((h) => h.qty),
    ];

    const csvContent = toCsv([head, ...lines, [], totalLine]);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waktu-teramai-produk-${range.label.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const err = ctx.status === 'error' ? ctx : state.status === 'error' ? state : null;
  const loading = ctx.status === 'loading' || state.status === 'loading';

  const overallTopProduct = report?.topProducts[0];
  const totalTopQty = report?.topProducts.reduce((sum, p) => sum + p.totalQty, 0) ?? 0;
  const totalTopAmount = report?.topProducts.reduce((sum, p) => sum + p.totalAmount, 0) ?? 0;

  // Temukan jam puncak umum dari 10 produk
  let peakGeneralHour = 0;
  let peakGeneralQty = 0;
  if (report) {
    for (const h of report.hourlyTotals) {
      if (h.qty > peakGeneralQty) {
        peakGeneralQty = h.qty;
        peakGeneralHour = h.hour;
      }
    }
  }

  return (
    <div className="space-y-24 min-w-0">
      <PageHeader
        title="Waktu teramai produk"
        subtitle={
          ctx.status === 'ready'
            ? `${ctx.data.outletName} · ${range.label}`
            : 'Distribusi jam pembelian untuk 10 produk terlaris'
        }
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={!report || report.topProducts.length === 0}
          >
            <Download className="w-16 h-16 mr-8" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <RangePicker value={value} today={today} onChange={setValue} />

      {err && <ErrorBox message={err.message} onRetry={err.reload} />}

      {loading && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat matriks produk teramai">
          <div className="grid grid-cols-2 tablet:grid-cols-4 gap-12">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton h-72 rounded-lg" />
            ))}
          </div>
          <div className="cg-skeleton h-320 rounded-lg" />
        </div>
      )}

      {report && report.topProducts.length === 0 && (
        <div className="cg-empty">
          <p>
            <strong>Tidak ada penjualan produk pada rentang ini.</strong>
          </p>
          <p className="text-text-muted">
            Matriks waktu teramai dihitung dari pesanan lunas pada rentang tanggal yang dipilih.
          </p>
        </div>
      )}

      {report && report.topProducts.length > 0 && (
        <div className="space-y-24 min-w-0">
          {/* Ringkasan KPI Analisa Produk */}
          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-12" aria-label="Ringkasan 10 produk teratas">
            <StatCard
              label="Produk #1 terlaris"
              value={overallTopProduct ? overallTopProduct.productName : '—'}
              subtext={overallTopProduct ? `${num(overallTopProduct.totalQty)} terjual (${formatRp(overallTopProduct.totalAmount)})` : undefined}
              primary
              testId="produk-terlaris"
            />
            <StatCard
              label="Total item terjual (Top 10)"
              value={`${num(totalTopQty)} porsi`}
              subtext={formatRp(totalTopAmount)}
              testId="total-item"
            />
            <StatCard
              label="Jam puncak teramai"
              value={`${String(peakGeneralHour).padStart(2, '0')}:00 - ${String(peakGeneralHour).padStart(2, '0')}:59`}
              subtext={`${num(peakGeneralQty)} item terjual di jam ini`}
              testId="jam-puncak"
            />
            <StatCard
              label="Jumlah produk dianalisa"
              value={`${num(report.topProducts.length)} produk`}
              subtext="10 produk dengan volume tertinggi"
              testId="jumlah-produk"
            />
          </div>

          {/* Dialog info sel terpilih */}
          {selectedCell && (
            <div className="p-12 border border-primary/30 rounded-lg bg-primary/5 flex items-center justify-between gap-12">
              <div className="text-xs tablet:text-sm">
                <span className="font-semibold text-primary">{selectedCell.productName}</span> pada jam{' '}
                <strong>{String(selectedCell.hour).padStart(2, '0')}:00 - {String(selectedCell.hour).padStart(2, '0')}:59</strong>: terjual{' '}
                <strong className="cg-num text-primary">{num(selectedCell.qty)} item</strong> ({formatRp(selectedCell.amount)})
              </div>
              <button
                type="button"
                className="text-xs text-text-muted hover:text-text underline"
                onClick={() => setSelectedCell(null)}
              >
                Tutup
              </button>
            </div>
          )}

          {/* Matriks Produk x Jam (Desktop & Tablet) */}
          <div className="border border-border rounded-xl bg-surface-raised overflow-hidden min-w-0">
            <div className="p-16 border-b border-border flex flex-col tablet:flex-row tablet:items-center justify-between gap-8">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-8">
                  <Package className="w-[18px] h-[18px] text-accent-strong" aria-hidden /> Matriks intensitas penjualan (Produk × Jam)
                </h2>
                <p className="text-xs text-text-muted mt-2">
                  Makin hijau makin ramai (volume penjualan lebih tinggi).
                </p>
              </div>
              <div className="flex items-center gap-[6px] text-xs text-text-muted self-start tablet:self-auto">
                <span>Rendah</span>
                <span className="inline-block w-16 h-16 rounded bg-primary/20 border border-primary/30" />
                <span className="inline-block w-16 h-16 rounded bg-primary/50" />
                <span className="inline-block w-16 h-16 rounded bg-primary text-white" />
                <span>Tinggi</span>
              </div>
            </div>

            {/* Desktop Table with Horizontal Scroll for 24 Hours */}
            <div className="hidden tablet:block overflow-x-auto min-w-0">
              <table className="w-full text-xs text-left border-collapse" aria-label="Tabel matriks produk per jam">
                <thead>
                  <tr className="bg-surface-raised border-b border-border text-text-muted font-medium">
                    <th className="py-12 px-12 sticky left-0 bg-surface-raised z-10 min-w-160 shadow-xs uppercase">
                      Produk
                    </th>
                    <th className="py-12 px-8 text-right min-w-60 uppercase font-semibold">Total</th>
                    <th className="py-12 px-8 text-center min-w-80 uppercase">Puncak</th>
                    {Array.from({ length: 24 }, (_, h) => (
                      <th key={h} className="py-12 px-4 text-center min-w-36 uppercase font-mono">
                        {String(h).padStart(2, '0')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.topProducts.map((p, idx) => (
                    <tr key={p.productId} className="hover:bg-surface-raised/40 transition-colors">
                      <td className="py-8 px-12 sticky left-0 bg-surface z-10 font-semibold text-text truncate max-w-180 shadow-xs">
                        <div className="flex items-center gap-6 truncate">
                          <span className="text-text-muted text-[10px] w-14 shrink-0">#{idx + 1}</span>
                          <span className="truncate" title={p.productName}>
                            {p.productName}
                          </span>
                        </div>
                      </td>
                      <td className="py-8 px-8 text-right cg-num font-bold text-primary">{num(p.totalQty)}</td>
                      <td className="py-8 px-8 text-center">
                        <span className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
                          <Flame className="w-12 h-12" aria-hidden />
                          {String(p.peakHour).padStart(2, '0')}:00
                        </span>
                      </td>
                      {p.cells.map((cell) => {
                        const isHigh = cell.intensity >= 0.55;
                        const bgStyle =
                          cell.qty > 0
                            ? {
                              backgroundColor: `rgba(16, 185, 129, ${Math.max(0.15, cell.intensity)})`,
                              color: isHigh ? '#ffffff' : 'var(--color-text)',
                            }
                            : undefined;

                        return (
                          <td
                            key={cell.hour}
                            tabIndex={0}
                            role="button"
                            aria-label={`${p.productName}, Jam ${cell.hour}:00, ${cell.qty} item terjual`}
                            onClick={() =>
                              setSelectedCell({
                                productName: p.productName,
                                hour: cell.hour,
                                qty: cell.qty,
                                amount: cell.amount,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                setSelectedCell({
                                  productName: p.productName,
                                  hour: cell.hour,
                                  qty: cell.qty,
                                  amount: cell.amount,
                                });
                              }
                            }}
                            className={`p-4 text-center font-mono cursor-pointer transition-transform hover:scale-105 focus:outline-hidden focus:ring-2 focus:ring-primary ${cell.qty === 0 ? 'text-text-muted/40' : 'font-semibold'
                              }`}
                            style={bgStyle}
                          >
                            {cell.qty > 0 ? cell.qty : '·'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-raised border-t-2 border-border font-bold text-text">
                    <td className="py-10 px-12 sticky left-0 bg-surface-raised z-10 shadow-xs">Total per jam</td>
                    <td className="py-10 px-8 text-right cg-num text-primary">{num(totalTopQty)}</td>
                    <td className="py-10 px-8 text-center text-xs text-text-muted">—</td>
                    {report.hourlyTotals.map((h) => (
                      <td key={h.hour} className="py-10 px-4 text-center font-mono cg-num text-[11px]">
                        {h.qty > 0 ? h.qty : '·'}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile View (< 768px: Kartu Ringkasan Produk Terlaris) */}
            <div className="tablet:hidden divide-y divide-border min-w-0">
              <div className="p-12 bg-surface-raised text-xs text-text-muted font-medium">
                Daftar 10 produk teratas beserta jam tersibuknya:
              </div>
              {report.topProducts.map((p, idx) => (
                <div key={p.productId} className="p-16 space-y-12 min-w-0">
                  <div className="flex items-center justify-between gap-8 min-w-0">
                    <div className="flex items-center gap-[6px] min-w-0">
                      <span className="text-xs text-text-muted font-bold shrink-0">#{idx + 1}</span>
                      <strong className="text-sm block truncate">{p.productName}</strong>
                    </div>
                    <div className="text-right shrink-0">
                      <strong className="text-sm text-primary cg-num">{num(p.totalQty)} terjual</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-surface-raised p-8 rounded-lg min-w-0">
                    <span className="text-text-muted">Jam teramai:</span>
                    <span className="inline-flex items-center gap-4 font-semibold text-accent-strong">
                      <Flame className="w-[14px] h-[14px]" aria-hidden />
                      {String(p.peakHour).padStart(2, '0')}:00 ({num(p.peakHourQty)} porsi)
                    </span>
                  </div>

                  {/* Bar Visual 24 Jam Mobile Mini */}
                  <div className="space-y-4">
                    <span className="text-[10px] text-text-muted block">Sebaran per jam (00:00 - 23:00):</span>
                    <div className="grid grid-cols-12 gap-[2px] h-[18px]">
                      {p.cells.map((c) => (
                        <div
                          key={c.hour}
                          title={`Jam ${c.hour}:00: ${c.qty} terjual`}
                          className="h-full rounded-xs flex items-center justify-center text-[9px] font-mono"
                          style={{
                            backgroundColor:
                              c.qty > 0
                                ? `rgba(16, 185, 129, ${Math.max(0.2, c.intensity)})`
                                : 'var(--color-surface-raised)',
                            color: c.intensity >= 0.5 ? '#ffffff' : 'var(--color-text)',
                          }}
                        >
                          {c.qty > 0 ? c.qty : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  primary = false,
  testId,
}: {
  label: string;
  value: string;
  subtext?: string;
  primary?: boolean;
  testId?: string;
}) {
  return (
    <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface-raised shadow-xs min-w-0 flex flex-col justify-between">
      <div>
        <span className="text-xs text-text-muted font-medium block mb-4 text-left leading-normal">{label}</span>
        <strong
          className={`text-base tablet:text-xl desktop:text-2xl font-bold block text-left break-words leading-tight ${primary ? 'text-accent-strong' : 'text-text'}`}
          data-testid={testId}
        >
          {value}
        </strong>
      </div>
      {subtext && <span className="text-xs text-text-muted block mt-6 text-left break-words leading-normal">{subtext}</span>}
    </div>
  );
}

