'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Building2, Clock, Download, Layers, Sparkles, TrendingUp } from 'lucide-react';
import {
  buildFacilityUsageReport,
  formatRp,
  toFacilityReportCsv,
  type FacilityMeta,
  type FacilityUsageReport,
} from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { loadFacilityMeta } from '@/lib/a58-preview';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { useReport } from '@/lib/use-report';

const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);

export default function LaporanFasilitasPage() {
  const data = useData();
  const { ctx, value, setValue, range, today, state } = useReport();
  const [metaMap] = useState<Record<string, FacilityMeta>>(() => loadFacilityMeta());

  const catalogAsync = useAsync(
    async () => {
      const [catalog, categories] = await Promise.all([
        data.listCatalog({ includeInactive: true }),
        data.listCategories(),
      ]);
      return { catalog, categories };
    },
    [data, range.from, range.to]
  );

  const report: FacilityUsageReport | null = useMemo(() => {
    if (
      state.status !== 'ready' ||
      !state.data ||
      catalogAsync.status !== 'ready' ||
      !catalogAsync.data
    ) {
      return null;
    }
    const categoryNames = new Map(catalogAsync.data.categories.map((c) => [c.id, c.name]));
    return buildFacilityUsageReport(state.data.orders, catalogAsync.data.catalog, metaMap, {
      timezone: ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta',
      from: range.from,
      to: range.to,
      categoryNames,
    });
  }, [state, catalogAsync, metaMap, ctx, range.from, range.to]);

  function handleDownloadCsv() {
    if (!report || report.items.length === 0) return;
    const csv = toFacilityReportCsv(report, range.label);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeLabel = range.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.download = `laporan-fasilitas-${safeLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const err =
    ctx.status === 'error'
      ? ctx
      : state.status === 'error'
        ? state
        : catalogAsync.status === 'error'
          ? catalogAsync
          : null;

  const loading =
    ctx.status === 'loading' ||
    state.status === 'loading' ||
    catalogAsync.status === 'loading';

  const maxDailyRevenue = Math.max(1, ...(report?.daily.map((d) => d.revenue) ?? [0]));

  return (
    <div className="space-y-24 min-w-0">
      <PageHeader
        title="Laporan fasilitas"
        subtitle={
          ctx.status === 'ready'
            ? `${ctx.data.outletName} · ${range.label}`
            : 'Pemakaian durasi, sesi sewa, dan pendapatan fasilitas berbayar'
        }
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <Link href="/fasilitas" className="cg-btn cg-btn--secondary">
              <Building2 className="cg-icon" aria-hidden /> Kelola fasilitas
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--secondary"
              onClick={handleDownloadCsv}
              disabled={!report || report.items.length === 0}
            >
              <Download className="cg-icon" aria-hidden /> Unduh CSV
            </button>
          </div>
        }
      />

      <div className="cg-banner cg-banner--info flex flex-wrap items-center justify-between gap-8">
        <p className="text-sm">
          <strong>Pratinjau:</strong> pemakaian dihitung dari transaksi pesanan lunas yang memuat produk fasilitas. Rincian slot jadwal reservasi menyusul setelah sinkronisasi jadwal server.
        </p>
        <span className="cg-badge cg-badge--info whitespace-nowrap">Rekap pesanan</span>
      </div>

      <RangePicker value={value} today={today} onChange={setValue} />

      {err && <ErrorBox message={err.message} onRetry={err.reload} />}

      {loading && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat laporan fasilitas">
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[84px] rounded-xl" />
            ))}
          </div>
          <div className="cg-skeleton h-[220px] rounded-xl" />
        </div>
      )}

      {report && report.summary.registeredCount === 0 && (
        <div className="cg-empty">
          <Building2 className="cg-icon text-text-muted mx-auto mb-8" aria-hidden />
          <p>
            <strong>Belum ada produk fasilitas terdaftar.</strong>
          </p>
          <p className="text-text-muted text-sm">
            Tambahkan fasilitas terlebih dahulu di halaman Produk Fasilitas agar pemakaian dan pendapatannya tercatat di laporan ini.
          </p>
          <Link href="/fasilitas" className="cg-btn cg-btn--primary mt-8">
            Buka Produk Fasilitas
          </Link>
        </div>
      )}

      {report && report.summary.registeredCount > 0 && report.summary.totalUsageCount === 0 && (
        <div className="cg-empty">
          <Clock className="cg-icon text-text-muted mx-auto mb-8" aria-hidden />
          <p>
            <strong>Belum ada pemakaian fasilitas pada periode ini.</strong>
          </p>
          <p className="text-text-muted text-sm">
            Terdapat {report.summary.registeredCount} produk fasilitas terdaftar ({report.summary.activeCount} aktif), namun belum ada pesanan lunas pada rentang {range.label}.
          </p>
        </div>
      )}

      {report && report.summary.registeredCount > 0 && report.summary.totalUsageCount > 0 && (
        <div className="space-y-24 min-w-0">
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12" aria-label="Ringkasan pemakaian fasilitas">
            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <div className="flex items-center justify-between text-text-muted text-sm">
                <span>Pendapatan fasilitas</span>
                <TrendingUp className="w-[16px] h-[16px] text-accent" aria-hidden />
              </div>
              <strong className="block text-2xl font-bold cg-num" data-testid="fas-kpi-revenue">
                {formatRp(report.summary.totalRevenue)}
              </strong>
              <span className="block text-xs text-text-muted">
                Dari {num(report.summary.totalTransactions)} transaksi lunas
              </span>
            </div>

            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <div className="flex items-center justify-between text-text-muted text-sm">
                <span>Total pemakaian</span>
                <Layers className="w-[16px] h-[16px] text-accent" aria-hidden />
              </div>
              <strong className="block text-2xl font-bold cg-num" data-testid="fas-kpi-usage">
                {num(report.summary.totalUsageCount)} unit sewa
              </strong>
              <span className="block text-xs text-text-muted">
                {report.summary.activeCount} fasilitas aktif dari {report.summary.registeredCount} terdaftar
              </span>
            </div>

            <div className="border border-border rounded-xl bg-surface-raised p-16 space-y-4">
              <div className="flex items-center justify-between text-text-muted text-sm">
                <span>Fasilitas terpopuler</span>
                <Sparkles className="w-[16px] h-[16px] text-accent" aria-hidden />
              </div>
              <strong
                className="block text-lg font-bold truncate text-accent-strong"
                data-testid="fas-kpi-top"
                title={report.summary.topFacility?.name ?? ''}
              >
                {report.summary.topFacility ? report.summary.topFacility.name : '—'}
              </strong>
              <span className="block text-xs text-text-muted">
                {report.summary.topFacility
                  ? `${num(report.summary.topFacility.usageCount)} ${report.summary.topFacility.unit} · ${formatRp(report.summary.topFacility.revenue)}`
                  : 'Belum ada data'}
              </span>
            </div>
          </div>

          {report.daily.length > 0 && (
            <section
              aria-label="Tren pendapatan fasilitas harian"
              className="border border-border rounded-xl bg-surface-raised p-16 space-y-16 min-w-0"
            >
              <div>
                <h2 className="text-base font-semibold">Tren Pemakaian Harian</h2>
                <p className="text-xs text-text-muted">
                  Pendapatan sewa fasilitas per tanggal transaksi lunas
                </p>
              </div>
              <ul className="grid gap-8">
                {report.daily.map((d) => (
                  <li
                    key={d.date}
                    className="grid grid-cols-[76px_1fr_112px] items-center gap-8 text-sm"
                  >
                    <span className="text-text-muted cg-num">{d.label}</span>
                    <span className="block h-[12px] rounded-pill bg-accent-soft" aria-hidden>
                      <span
                        className="block h-full rounded-pill bg-accent"
                        style={{ width: `${Math.round((d.revenue / maxDailyRevenue) * 100)}%` }}
                      />
                    </span>
                    <span className="cg-num text-right whitespace-nowrap">{formatRp(d.revenue)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Rincian pemakaian per fasilitas" className="space-y-12 min-w-0">
            <h2 className="text-base font-semibold">Rincian Per Fasilitas</h2>
            <div className="cg-data-wrap min-w-0">
              <table className="cg-data">
                <thead>
                  <tr>
                    <th>Fasilitas</th>
                    <th>Status</th>
                    <th className="text-right">Pemakaian</th>
                    <th className="text-right">Transaksi</th>
                    <th className="text-right">Tarif rata-rata</th>
                    <th className="text-right">Pendapatan</th>
                    <th className="text-right">Porsi</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((row) => (
                    <tr key={row.productId}>
                      <td className="min-w-[180px] max-w-[260px]">
                        <div className="font-semibold break-words">{row.name}</div>
                        <div className="text-xs text-text-muted">
                          Kapasitas {row.capacity} orang · per {row.unit}
                          {row.sku ? ` · ${row.sku}` : ''}
                        </div>
                      </td>
                      <td>
                        <span className={`cg-badge ${row.isActive ? 'cg-badge--success' : ''}`}>
                          {row.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="text-right whitespace-nowrap cg-num">
                        {num(row.usageCount)} {row.unit}
                      </td>
                      <td className="text-right whitespace-nowrap cg-num">
                        {num(row.transactionCount)}x
                      </td>
                      <td className="text-right whitespace-nowrap cg-num">
                        {formatRp(row.avgRate)}
                      </td>
                      <td className="text-right whitespace-nowrap cg-num font-semibold">
                        {formatRp(row.revenue)}
                      </td>
                      <td className="text-right whitespace-nowrap cg-num">
                        {row.sharePct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

