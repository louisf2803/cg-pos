'use client';

import { useMemo, useState } from 'react';
import { Clock, Download, Flame, TrendingUp } from 'lucide-react';
import { buildSalesHeatmap, formatRp, toCsv, type DayRow } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';

const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);

function formatAvgCount(val: number): string {
  if (val < 10) {
    if (val % 1 === 0) return num(val);
    return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val);
  }
  return num(Math.round(val));
}

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-12" aria-label="Ringkasan waktu teramai">
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
              value={`${formatAvgCount(report.overallTotals.count / 7)} transaksi`}
              subtext="Estimasi per hari aktif"
              testId="rata-rata-hari"
            />
          </div>

          {/* Dialog info sel terpilih */}
          {selectedCell && (
            <div className="p-12 border border-accent/30 rounded-lg bg-accent-soft/40 flex items-center justify-between gap-12">
              <div className="text-xs sm:text-sm">
                <span className="font-semibold text-accent-strong">{selectedCell.dayName}</span> pada jam{' '}
                <strong>{String(selectedCell.hour).padStart(2, '0')}:00 - {String(selectedCell.hour).padStart(2, '0')}:59</strong>: terjadi{' '}
                <strong className="cg-num text-accent-strong">{num(selectedCell.count)} transaksi</strong> dengan omset{' '}
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
            <div className="p-16 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-12">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-8">
                  <Flame className="w-18 h-18 text-accent-strong" aria-hidden /> Heatmap aktivitas penjualan (Hari × Jam)
                </h2>
                <p className="text-xs text-text-muted mt-2">
                  Dapat dinavigasi dengan keyboard (Tab / Enter / Space) dan dibaca pembaca layar.
                </p>
              </div>

              {/* Segmented Control Metrik (Transaksi vs Nominal) */}
              <div className="flex items-center gap-8 self-end sm:self-auto">
                <div className="inline-flex p-2 bg-surface border border-border rounded-lg text-xs" role="tablist" aria-label="Metrik heatmap">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={metric === 'count'}
                    onClick={() => setMetric('count')}
                    className={`px-12 py-5 rounded-md font-medium transition-colors ${
                      metric === 'count' ? 'bg-accent text-on-accent font-semibold shadow-xs' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    Transaksi
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={metric === 'sales'}
                    onClick={() => setMetric('sales')}
                    className={`px-12 py-5 rounded-md font-medium transition-colors ${
                      metric === 'sales' ? 'bg-accent text-on-accent font-semibold shadow-xs' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    Nominal
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop / Scrollable Table */}
            <div className="overflow-x-auto min-w-0">
              <table className="w-full table-fixed text-xs text-left border-collapse" aria-label="Tabel heatmap hari dan jam transaksi">
                <thead>
                  <tr className="bg-surface-raised border-b border-border text-text-muted font-medium">
                    <th className="py-6 px-4 sticky left-0 bg-surface-raised z-10 w-[84px] shadow-xs uppercase">
                      Hari
                    </th>
                    <th className="py-6 px-4 text-right w-[84px] uppercase font-semibold">Total</th>
                    {Array.from({ length: 24 }, (_, h) => (
                      <th key={h} className="py-6 px-0.5 text-center font-mono text-[11px] w-[28px] text-text-muted">
                        {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.days.map((d) => (
                    <tr key={d.dayOfWeek} className="h-[36px] hover:bg-surface-raised/40 transition-colors">
                      <td className="py-1 px-4 sticky left-0 bg-surface z-10 font-semibold text-text text-xs whitespace-nowrap shadow-xs">
                        {d.dayName}
                      </td>
                      <td className="py-1 px-4 text-right cg-num font-bold text-accent-strong text-xs whitespace-nowrap">
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

                        const hasVal = cellVal > 0;
                        const bgStyle = hasVal
                          ? {
                              backgroundColor: `rgba(14, 128, 68, ${Math.max(0.18, cellIntensity)})`,
                            }
                          : {
                              backgroundColor: 'var(--color-surface)',
                            };

                        return (
                          <td key={cell.hour} className="p-0.5 text-center w-[28px]">
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
                              className="w-[18px] h-[18px] sm:w-[20px] sm:h-[20px] mx-auto rounded-xs cursor-pointer transition-transform hover:scale-125 focus:outline-hidden focus:ring-2 focus:ring-accent"
                              style={bgStyle}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-raised border-t-2 border-border font-bold text-text h-[36px]">
                    <td className="py-1 px-4 sticky left-0 bg-surface-raised z-10 text-xs shadow-xs">Total per jam</td>
                    <td className="py-1 px-4 text-right cg-num text-accent-strong text-xs">
                      {metric === 'count' ? num(report.overallTotals.count) : formatRp(report.overallTotals.total)}
                    </td>
                    {report.hourlyTotals.map((h) => {
                      const val = metric === 'count' ? h.count : h.total;
                      return (
                        <td
                          key={h.hour}
                          className="py-1 px-0.5 text-center font-mono cg-num text-[10px] text-text-muted"
                          title={`Jam ${String(h.hour).padStart(2, '0')}:00: ${metric === 'count' ? num(val) + ' transaksi' : formatRp(val)}`}
                        >
                          {val > 0
                            ? metric === 'count'
                              ? (val < 100 ? val : '99+')
                              : val >= 1000000
                              ? `${Math.round(val / 1000000)}jt`
                              : `${Math.round(val / 1000)}rb`
                            : '·'}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Distribusi Transaksi Tiap Hari (Daftar Batang Horizontal) */}
            <div className="p-16 border-t border-border bg-surface-raised space-y-12">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Distribusi transaksi tiap hari
                </h3>
                <span className="text-[11px] text-text-muted">
                  Total sepekan: {num(report.overallTotals.count)} transaksi ({formatRp(report.overallTotals.total)})
                </span>
              </div>
              <div className="space-y-8">
                {(() => {
                  const maxDayVal = Math.max(1, ...report.days.map((d) => (metric === 'count' ? d.totalCount : d.totalSales)));
                  return report.days.map((d) => {
                    const dayVal = metric === 'count' ? d.totalCount : d.totalSales;
                    const pct = Math.max(0, Math.min(100, Math.round((dayVal / maxDayVal) * 100)));
                    return (
                      <div key={d.dayOfWeek} className="flex items-center gap-12 text-xs">
                        <span className="w-64 font-medium text-text shrink-0">{d.dayName}</span>
                        <div className="flex-1 h-12 bg-surface rounded-full overflow-hidden border border-border/50">
                          <div
                            className="h-full bg-accent rounded-full transition-all duration-300"
                            style={{ width: `${dayVal > 0 ? Math.max(4, pct) : 0}%` }}
                          />
                        </div>
                        <div className="text-right shrink-0 min-w-140">
                          <span className="font-semibold text-text cg-num">{num(d.totalCount)} trx</span>
                          <span className="text-text-muted ml-6 text-[11px] cg-num">({formatRp(d.totalSales)})</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
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
    <div className="p-12 sm:p-16 border border-border rounded-xl bg-surface-raised shadow-xs min-w-0 flex flex-col justify-between">
      <div>
        <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left">{label}</span>
        <strong
          className={`text-xl sm:text-2xl font-bold block truncate text-left ${primary ? 'text-accent-strong' : 'text-text'}`}
          data-testid={testId}
        >
          {value}
        </strong>
      </div>
      {subtext && <span className="text-xs text-text-muted block mt-6 truncate text-left">{subtext}</span>}
    </div>
  );
}
