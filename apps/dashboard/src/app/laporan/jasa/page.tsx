'use client';

import { useMemo } from 'react';
import { Download, Sparkles, TrendingUp, Layers } from 'lucide-react';
import {
  buildServiceReport,
  formatRp,
  toServiceReportCsv,
  type ServiceReport,
} from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';
import { useAsync } from '@/lib/use-async';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';

const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);

export default function LaporanJasaPage() {
  const data = useData();
  const { ctx, value, setValue, range, today, state } = useReport();

  const productsAsync = useAsync(
    async () => data.listProducts({ includeInactive: true }),
    [data, range.from, range.to]
  );

  if (typeof window !== 'undefined') {
    (window as unknown as { __cgpos_data?: typeof data }).__cgpos_data = data;
    (window as unknown as { __cgpos_refresh?: () => void }).__cgpos_refresh = () => {
      state.reload();
      productsAsync.reload();
    };
  }

  const report: ServiceReport | null = useMemo(() => {
    if (
      state.status !== 'ready' ||
      !state.data ||
      productsAsync.status !== 'ready' ||
      !productsAsync.data
    ) {
      return null;
    }

    return buildServiceReport(state.data.orders, productsAsync.data, {
      timezone: ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta',
      from: range.from,
      to: range.to,
    });
  }, [state, productsAsync, ctx, range.from, range.to]);

  function handleDownloadCsv() {
    if (!report || report.summary.totalRevenue === 0) return;
    const csvContent = toServiceReportCsv(report, range.label);
    const safeLabel = range.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadCsvWithHistory({
      fileName: `laporan-jasa-${safeLabel}.csv`,
      csvContent,
      reportName: 'Laporan Jasa',
      period: range.label,
      sourceUrl: '/laporan/jasa',
    });
  }

  const err =
    ctx.status === 'error'
      ? ctx
      : state.status === 'error'
        ? state
        : productsAsync.status === 'error'
          ? productsAsync
          : null;

  const loading =
    ctx.status === 'loading' ||
    state.status === 'loading' ||
    productsAsync.status === 'loading';

  return (
    <div className="space-y-24 min-w-0">
      <PageHeader
        title="Laporan jasa"
        subtitle={
          ctx.status === 'ready'
            ? `${ctx.data.outletName} · ${range.label}`
            : 'Ringkasan dan detail penjualan produk layanan'
        }
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={handleDownloadCsv}
            disabled={!report || report.summary.totalRevenue === 0}
          >
            <Download className="w-[16px] h-[16px] mr-8" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <RangePicker value={value} today={today} onChange={setValue} />

      {err && <ErrorBox message={err.message} onRetry={err.reload} />}

      {loading && (
        <div
          className="grid gap-12"
          aria-busy="true"
          aria-label="Memuat laporan jasa"
        >
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[80px] rounded-xl" />
            ))}
          </div>
          <div className="cg-skeleton h-[220px] rounded-xl" />
          <div className="cg-skeleton h-[160px] rounded-xl" />
        </div>
      )}

      {report && report.summary.totalRevenue === 0 && (
        <div className="cg-empty">
          <p>
            <strong>Tidak ada penjualan produk jasa pada periode ini.</strong>
          </p>
          <p className="text-text-muted">
            Laporan ini menghitung penjualan produk berjenis layanan/jasa pada pesanan yang sudah lunas.
          </p>
        </div>
      )}

      {report && report.summary.totalRevenue > 0 && (
        <div className="space-y-24 min-w-0">
          {/* Kartu Ringkasan KPI */}
          <div
            className="grid grid-cols-1 tablet:grid-cols-3 gap-12"
            aria-label="Ringkasan penjualan jasa"
          >
            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <div className="flex items-center justify-between text-text-muted text-sm">
                <span>Total penjualan jasa</span>
                <TrendingUp className="w-[16px] h-[16px] text-accent" aria-hidden />
              </div>
              <strong className="block text-2xl font-bold cg-num" data-testid="kpi-total-revenue">
                {formatRp(report.summary.totalRevenue)}
              </strong>
              <span className="block text-xs text-text-muted">
                {num(report.summary.totalQty)} layanan terjual
              </span>
            </div>

            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <div className="flex items-center justify-between text-text-muted text-sm">
                <span>Jumlah transaksi</span>
                <Layers className="w-[16px] h-[16px] text-accent" aria-hidden />
              </div>
              <strong className="block text-2xl font-bold cg-num" data-testid="kpi-total-transactions">
                {num(report.summary.totalTransactions)} transaksi
              </strong>
              <span className="block text-xs text-text-muted">
                Pesanan lunas dengan item jasa
              </span>
            </div>

            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <div className="flex items-center justify-between text-text-muted text-sm">
                <span>Jasa terlaris</span>
                <Sparkles className="w-[16px] h-[16px] text-accent" aria-hidden />
              </div>
              <strong
                className="block text-lg font-bold truncate text-accent-strong"
                data-testid="kpi-top-service"
                title={report.summary.topService?.name ?? ''}
              >
                {report.summary.topService ? report.summary.topService.name : '—'}
              </strong>
              <span className="block text-xs text-text-muted">
                {report.summary.topService
                  ? `${num(report.summary.topService.qty)} terjual · ${formatRp(report.summary.topService.revenue)}`
                  : 'Belum ada data'}
              </span>
            </div>
          </div>

          {/* Grafik Batang Harian */}
          {report.daily.length > 0 && (
            <section
              aria-label="Grafik penjualan jasa harian"
              className="border border-border rounded-xl bg-surface-raised p-16 space-y-16 min-w-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-8">
                <div>
                  <h2 className="text-base font-semibold">Tren Penjualan Harian</h2>
                  <p className="text-xs text-text-muted">
                    Pendapatan produk layanan per tanggal transaksi lunas
                  </p>
                </div>
                <div className="flex items-center gap-12 text-xs text-text-muted">
                  <div className="flex items-center gap-4">
                    <span
                      className="w-[12px] h-[12px] rounded-sm bg-chart-bar inline-block"
                      aria-hidden
                    />
                    <span>Penjualan (Rp)</span>
                  </div>
                </div>
              </div>

              <DailyBarChart daily={report.daily} />
            </section>
          )}

          {/* Tabel Detail Per Jasa */}
          <section
            aria-label="Tabel rincian penjualan per jasa"
            className="border border-border rounded-xl bg-surface-raised p-16 space-y-16 min-w-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-8">
              <div>
                <h2 className="text-base font-semibold">Rincian Per Jasa</h2>
                <p className="text-xs text-text-muted">
                  Performa masing-masing layanan dan kontribusinya terhadap total omset jasa
                </p>
              </div>
              <span className="text-xs text-text-muted">
                {report.items.length} jenis jasa
              </span>
            </div>

            <div className="overflow-x-auto min-w-0">
              <table className="cg-data w-full" aria-label="Tabel per jasa">
                <thead>
                  <tr>
                    <th className="text-left py-12 px-16">Nama Jasa</th>
                    <th className="text-left py-12 px-16">SKU</th>
                    <th className="text-right py-12 px-16">Kuantitas</th>
                    <th className="text-right py-12 px-16">Pendapatan</th>
                    <th className="text-right py-12 px-16">Harga Rata-rata</th>
                    <th className="text-right py-12 px-16">Kontribusi</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((it) => (
                    <tr key={it.productId} className="hover:bg-surface">
                      <td className="py-12 px-16 font-medium">
                        <span className="break-words">{it.name}</span>
                      </td>
                      <td className="py-12 px-16 text-text-muted text-xs">
                        {it.sku || '—'}
                      </td>
                      <td className="py-12 px-16 text-right cg-num font-medium">
                        {num(it.qty)}
                      </td>
                      <td className="py-12 px-16 text-right cg-num font-bold text-accent-strong">
                        {formatRp(it.revenue)}
                      </td>
                      <td className="py-12 px-16 text-right cg-num text-text-muted">
                        {formatRp(it.avgPrice)}
                      </td>
                      <td className="py-12 px-16 text-right">
                        <div className="inline-flex items-center justify-end gap-8 min-w-[90px]">
                          <div
                            className="w-[48px] h-[6px] rounded-full bg-border overflow-hidden shrink-0 hidden tablet:block"
                            aria-hidden
                          >
                            <div
                              className="h-full bg-accent rounded-full"
                              style={{
                                width: `${Math.min(100, Math.max(0, it.percentOfTotal))}%`,
                              }}
                            />
                          </div>
                          <span className="cg-num text-xs font-semibold">
                            {it.percentOfTotal.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-bold bg-surface">
                    <td className="py-12 px-16" colSpan={2}>
                      Total Penjualan Jasa
                    </td>
                    <td className="py-12 px-16 text-right cg-num">
                      {num(report.summary.totalQty)}
                    </td>
                    <td className="py-12 px-16 text-right cg-num text-accent-strong">
                      {formatRp(report.summary.totalRevenue)}
                    </td>
                    <td className="py-12 px-16 text-right cg-num text-text-muted">
                      {report.summary.totalQty > 0
                        ? formatRp(
                            Math.round(
                              report.summary.totalRevenue / report.summary.totalQty
                            )
                          )
                        : '—'}
                    </td>
                    <td className="py-12 px-16 text-right cg-num">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/** Komponen grafik batang harian SVG responsif */
function DailyBarChart({
  daily,
}: {
  daily: readonly {
    date: string;
    label: string;
    revenue: number;
    orderCount: number;
    qty: number;
  }[];
}) {
  const maxRevenue = Math.max(...daily.map((d) => d.revenue), 10_000);

  const svgW = 780;
  const svgH = 200;
  const padLeft = 84;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 32;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;

  const count = daily.length;
  const slotW = count > 0 ? plotW / count : plotW;
  const barW = Math.max(8, Math.min(36, slotW * 0.6));

  const ySteps = [0, maxRevenue * 0.5, maxRevenue];

  return (
    <div className="w-full overflow-x-auto min-w-0">
      <div className="min-w-[480px]">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full h-auto block"
          role="img"
          aria-label="Grafik batang penjualan jasa harian"
        >
          {/* Garis Grid Horizontal & Label Sumbu Y */}
          {ySteps.map((val, idx) => {
            const y = padTop + plotH - (val / maxRevenue) * plotH;
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotW}
                  y2={y}
                  stroke="var(--color-border)"
                  strokeDasharray={idx === 0 ? undefined : '3,3'}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--color-text-muted)"
                  fontFamily="var(--font-sans)"
                >
                  {formatRp(Math.round(val))}
                </text>
              </g>
            );
          })}

          {/* Batang & Label Sumbu X */}
          {daily.map((d, idx) => {
            const barH = (d.revenue / maxRevenue) * plotH;
            const x = padLeft + idx * slotW + (slotW - barW) / 2;
            const y = padTop + plotH - barH;

            return (
              <g key={d.date} className="group">
                <title>{`${d.label}: ${formatRp(d.revenue)} (${d.qty} item, ${d.orderCount} transaksi)`}</title>
                {/* Latar hover slot */}
                <rect
                  x={padLeft + idx * slotW}
                  y={padTop}
                  width={slotW}
                  height={plotH}
                  fill="transparent"
                  className="hover:fill-surface cursor-pointer"
                />
                {/* Batang Nilai */}
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(2, barH)}
                  rx="3"
                  ry="3"
                  fill="var(--color-chart-bar)"
                />
                {/* Label Tanggal */}
                <text
                  x={x + barW / 2}
                  y={svgH - 10}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--color-text-muted)"
                  fontFamily="var(--font-sans)"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

