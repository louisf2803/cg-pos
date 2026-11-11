'use client';

import { useMemo, useState } from 'react';
import { Calendar, Clock, Download, Flame, TrendingUp } from 'lucide-react';
import { buildSalesHeatmap, formatRp, toCsv, type DayRow } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';

const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);

export default function SalesPeakHoursHeatmapPage() {
  const { ctx, value, setValue, range, today, state } = useReport();
  const [metric, setMetric] = useState<'count' | 'sales'>('count');
  const [selectedCell, setSelectedCell] = useState<{
    dayName: string;
    hour: number;
    count: number;
    total: number;
  } | null>(null);

  const report = useMemo(() => {
    if (state.status !== 'ready' || !state.data) return null;
    return buildSalesHeatmap(
      state.data.orders,
      ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta'
    );
  }, [state, ctx]);

  function downloadCsv() {
    if (!report || report.overallTotals.count === 0) return;

    const hourHeaders = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
    const head = ['Hari', 'Total Transaksi', 'Total Penjualan', ...hourHeaders];

    const lines = report.days.map((d) => [
      d.dayName,
      d.totalCount,
      d.totalSales,
      ...d.cells.map((c) => (metric === 'count' ? c.count : c.total)),
    ]);

    const totalLine = [
      'TOTAL KESELURUHAN',
      report.overallTotals.count,
      report.overallTotals.total,
      ...report.hourlyTotals.map((h) => (metric === 'count' ? h.count : h.total)),
    ];

    const csvContent = toCsv([head, ...lines, [], totalLine]);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waktu-teramai-penjualan-${range.label.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const err = ctx.status === 'error' ? ctx : state.status === 'error' ? state : null;
  const loading = ctx.status === 'loading' || state.status === 'loading';

  // Hari teramai
  let busiestDay: DayRow | null = null;
  if (report) {
    for (const d of report.days) {
      if (!busiestDay || d.totalCount > busiestDay.totalCount) {
        busiestDay = d;
      }
    }
  }

  return (
    <div className="space-y-24 min-w-0">
      <PageHeader
        title="Waktu teramai penjualan"
        subtitle={
          ctx.status === 'ready'
            ? `${ctx.data.outletName} · ${range.label}`
            : 'Peta panas (heatmap) transaksi per hari dan jam operasional'
        }
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={!report || report.overallTotals.count === 0}
          >
            <Download className="w-16 h-16 mr-8" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <RangePicker value={value} today={today} onChange={setValue} />

      {err && <ErrorBox message={err.message} onRetry={err.reload} />}

      {loading && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat peta panas penjualan">
          <div className="grid grid-cols-2 tablet:grid-cols-4 gap-12">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton h-72 rounded-lg" />
            ))}
          </div>
          <div className="cg-skeleton h-320 rounded-lg" />
        </div>
      )}

      {report && report.overallTotals.count === 0 && (
        <div className="cg-empty">
          <p>
            <strong>Tidak ada transaksi penjualan pada rentang ini.</strong>
          </p>
          <p className="text-text-muted">
            Heatmap dihitung dari pesanan lunas per hari dalam minggu dan jam operasional.
          </p>
        </div>
      )}

      {report && report.overallTotals.count > 0 && (
        <div className="space-y-24 min-w-0">
          {/* Ringkasan KPI Heatmap */}
          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-12" aria-label="Ringkasan waktu teramai">
            <StatCard
              label="Titik waktu puncak"
              value={
                report.peakCell
                  ? `${report.peakCell.dayName}, ${String(report.peakCell.hour).padStart(2, '0')}:00`
                  : '—'
              }
              subtext={
                report.peakCell
                  ? `${num(report.peakCell.count)} transaksi (${formatRp(report.peakCell.total)})`
                  : undefined
              }
              primary
              testId="puncak-teramai"
            />
            <StatCard
              label="Hari tersibuk"
              value={busiestDay ? busiestDay.dayName : '—'}
              subtext={busiestDay ? `${num(busiestDay.totalCount)} transaksi (${formatRp(busiestDay.totalSales)})` : undefined}
              testId="hari-tersibuk"
            />
            <StatCard
              label="Total transaksi periode"
              value={`${num(report.overallTotals.count)} transaksi`}
              subtext={formatRp(report.overallTotals.total)}
              testId="total-transaksi"
            />
            <StatCard
              label="Rata-rata per hari"
              value={`${num(Math.round(report.overallTotals.count / 7))} transaksi`}
              subtext="Estimasi per hari aktif"
              testId="rata-rata-hari"
            />
          </div>

          {/* Dialog info sel terpilih */}
          {selectedCell && (
            <div className="p-12 border border-primary/30 rounded-lg bg-primary/5 flex items-center justify-between gap-12">
              <div className="text-xs tablet:text-sm">
                <span className="font-semibold text-primary">{selectedCell.dayName}</span> pada jam{' '}
                <strong>{String(selectedCell.hour).padStart(2, '0')}:00 - {String(selectedCell.hour).padStart(2, '0')}:59</strong>: terjadi{' '}
                <strong className="cg-num text-primary">{num(selectedCell.count)} transaksi</strong> dengan omset{' '}
                <strong className="cg-num">{formatRp(selectedCell.total)}</strong>
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

          {/* Matriks Heatmap Hari x Jam */}
          <div className="border border-border rounded-xl bg-surface-raised overflow-hidden min-w-0">
            <div className="p-16 border-b border-border flex flex-col tablet:flex-row tablet:items-center justify-between gap-12">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-8">
                  <Flame className="w-[18px] h-[18px] text-accent-strong" aria-hidden /> Heatmap aktivitas penjualan (Hari × Jam)
                </h2>
                <p className="text-xs text-text-muted mt-[2px]">
                  Makin hijau makin ramai.
                </p>
              </div>

              {/* Segmented Control Metrik (Transaksi vs Nominal) */}
              <div className="flex items-center gap-8 self-start tablet:self-auto">
                <div className="inline-flex p-[2px] bg-surface border border-border rounded-lg text-xs" role="tablist" aria-label="Metrik heatmap. Navigasi keyboard dengan Tab, Enter, atau Spasi.">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={metric === 'count'}
                    onClick={() => setMetric('count')}
                    className={`px-12 py-[5px] rounded-md font-medium transition-colors ${
                      metric === 'count' ? 'bg-accent text-on-accent font-semibold shadow-xs' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    Jumlah transaksi
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={metric === 'sales'}
                    onClick={() => setMetric('sales')}
                    className={`px-12 py-[5px] rounded-md font-medium transition-colors ${
                      metric === 'sales' ? 'bg-accent text-on-accent font-semibold shadow-xs' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    Nominal rupiah
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop / Scrollable Table */}
            <div className="overflow-x-auto min-w-0">
              <table className="w-full text-xs text-left border-collapse" aria-label="Tabel heatmap hari dan jam transaksi">
                <thead>
                  <tr className="bg-surface-raised border-b border-border text-text-muted font-medium">
                    <th className="py-12 px-12 sticky left-0 bg-surface-raised z-10 min-w-100 shadow-xs uppercase">
                      Hari
                    </th>
                    <th className="py-12 px-8 text-right min-w-70 uppercase font-semibold">Total</th>
                    {Array.from({ length: 24 }, (_, h) => (
                      <th key={h} className="py-12 px-4 text-center min-w-36 uppercase font-mono">
                        {String(h).padStart(2, '0')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.days.map((d) => (
                    <tr key={d.dayOfWeek} className="hover:bg-surface-raised/40 transition-colors">
                      <td className="py-[10px] px-12 sticky left-0 bg-surface z-10 font-semibold text-text shadow-xs">
                        <div className="flex items-center gap-[6px]">
                          <Calendar className="w-[14px] h-[14px] text-text-muted shrink-0" aria-hidden />
                          <span>{d.dayName}</span>
                        </div>
                      </td>
                      <td className="py-[10px] px-8 text-right cg-num font-bold text-primary">
                        {metric === 'count' ? num(d.totalCount) : formatRp(d.totalSales)}
                      </td>
                      {d.cells.map((cell) => {
                        const cellVal = metric === 'count' ? cell.count : cell.total;
                        const cellIntensity =
                          metric === 'count'
                            ? cell.intensity
                            : report.maxSales > 0
                              ? Number((cell.total / report.maxSales).toFixed(3))
                              : 0;

                        const isHigh = cellIntensity >= 0.55;
                        const bgStyle =
                          cellVal > 0
                            ? {
                              backgroundColor: `rgba(16, 185, 129, ${Math.max(0.15, cellIntensity)})`,
                              color: isHigh ? '#ffffff' : 'var(--color-text)',
                            }
                            : undefined;

                        return (
                          <td key={cell.hour} className="p-[2px] text-center w-[28px]">
                            <div
                              tabIndex={0}
                              role="button"
                              aria-label={`${cell.dayName}, Jam ${String(cell.hour).padStart(2, '0')}:00: ${num(cell.count)} transaksi, ${formatRp(cell.total)}`}
                              title={`${cell.dayName}, Jam ${String(cell.hour).padStart(2, '0')}:00: ${num(cell.count)} transaksi, ${formatRp(cell.total)}`}
                              onClick={() =>
                                setSelectedCell({
                                  dayName: cell.dayName,
                                  hour: cell.hour,
                                  count: cell.count,
                                  total: cell.total,
                                })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedCell({
                                    dayName: cell.dayName,
                                    hour: cell.hour,
                                    count: cell.count,
                                    total: cell.total,
                                  });
                                }
                              }}
                              className="w-[18px] h-[18px] tablet:w-20 tablet:h-20 mx-auto rounded-xs cursor-pointer transition-transform hover:scale-125 focus:outline-hidden focus:ring-2 focus:ring-accent"
                              style={bgStyle}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-raised border-t-2 border-border font-bold text-text">
                    <td className="py-[10px] px-12 sticky left-0 bg-surface-raised z-10 shadow-xs">Total per jam</td>
                    <td className="py-[10px] px-8 text-right cg-num text-primary">
                      {metric === 'count' ? num(report.overallTotals.count) : formatRp(report.overallTotals.total)}
                    </td>
                    {report.hourlyTotals.map((h) => {
                      const val = metric === 'count' ? h.count : h.total;
                      return (
                        <td key={h.hour} className="py-[10px] px-4 text-center font-mono cg-num text-[11px]">
                          {val > 0
                            ? metric === 'count'
                              ? h.count
                              : val >= 1000000
                                ? `${(val / 1000000).toFixed(1)}jt`
                                : val >= 1000
                                  ? `${Math.round(val / 1000)}rb`
                                  : val
                            : '·'}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile View (< 768px: Ringkasan Per Hari) */}
            <div className="tablet:hidden divide-y divide-border min-w-0">
              <div className="p-12 bg-surface-raised text-xs text-text-muted font-medium">
                Distribusi transaksi tiap hari dalam sepekan:
              </div>
              {report.days.map((d) => (
                <div key={d.dayOfWeek} className="p-16 space-y-10 min-w-0">
                  <div className="flex items-center justify-between gap-8 min-w-0">
                    <strong className="text-sm block truncate">{d.dayName}</strong>
                    <div className="text-right shrink-0">
                      <span className="text-xs text-primary font-bold cg-num block">{num(d.totalCount)} trx</span>
                      <span className="text-[11px] text-text-muted cg-num block">{formatRp(d.totalSales)}</span>
                    </div>
                  </div>

                  {/* Sebaran Mini 24 Jam */}
                  <div className="grid grid-cols-12 gap-2 h-18">
                    {d.cells.map((c) => (
                      <div
                        key={c.hour}
                        title={`${d.dayName} ${c.hour}:00: ${c.count} trx (${formatRp(c.total)})`}
                        className="h-full rounded-xs flex items-center justify-center text-[9px] font-mono"
                        style={{
                          backgroundColor:
                            c.count > 0
                              ? `rgba(16, 185, 129, ${Math.max(0.2, c.intensity)})`
                              : 'var(--color-surface-raised)',
                          color: c.intensity >= 0.5 ? '#ffffff' : 'var(--color-text)',
                        }}
                      >
                        {c.count > 0 ? c.count : ''}
                      </div>
                    ))}
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
      {subtext && <span className="text-xs text-text-muted block mt-[6px] text-left break-words leading-normal">{subtext}</span>}
    </div>
  );
}

