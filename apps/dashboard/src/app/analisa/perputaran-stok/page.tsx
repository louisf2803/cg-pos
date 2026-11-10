'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Boxes, CheckCircle2, Download, Flame, HelpCircle, Hourglass, Search } from 'lucide-react';
import { buildStockTurnoverReport, toCsv, type StockTurnoverRow } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';

const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);

export default function StockTurnoverPage() {
  const data = useData();
  const { ctx, value, setValue, range, today, state } = useReport();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StockTurnoverRow['status']>('all');

  const stockAsync = useAsync(async () => {
    return data.listStock();
  }, [data]);

  const report = useMemo(() => {
    if (state.status !== 'ready' || !state.data || stockAsync.status !== 'ready' || !stockAsync.data) {
      return null;
    }

    // Hitung jumlah hari dalam rentang terpilih
    const fromDate = new Date(range.from).getTime();
    const toDate = new Date(range.to).getTime();
    const diffDays = Math.max(1, Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24)));

    return buildStockTurnoverReport({
      stockItems: stockAsync.data,
      orders: state.data.orders,
      periodDays: diffDays,
    });
  }, [state, stockAsync, range]);

  const filteredRows = useMemo(() => {
    if (!report) return [];
    return report.rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        if (!r.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [report, statusFilter, search]);

  function downloadCsv() {
    if (!report || report.rows.length === 0) return;

    const head = [
      'Nama Barang',
      'Satuan',
      'Jenis',
      'Stok Saat Ini',
      'Stok Rata-rata',
      'Kuantitas Terjual',
      'Rasio Perputaran (Turnover)',
      'Hari Persediaan (DSI)',
      'Status Perputaran',
    ];

    const lines = report.rows.map((r) => [
      r.name,
      r.unit,
      r.kind === 'goods' ? 'Barang Jadi' : 'Bahan Baku',
      r.currentStock,
      r.avgStock,
      r.soldQty,
      r.turnoverRatio,
      r.daysOfInventory !== null ? r.daysOfInventory : '—',
      r.statusLabel,
    ]);

    const csvContent = toCsv([head, ...lines]);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `perputaran-stok-${range.label.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const err = ctx.status === 'error' ? ctx : state.status === 'error' ? state : stockAsync.status === 'error' ? stockAsync : null;
  const loading = ctx.status === 'loading' || state.status === 'loading' || stockAsync.status === 'loading';

  return (
    <div className="space-y-24 min-w-0">
      <PageHeader
        title="Perputaran stok"
        subtitle={
          ctx.status === 'ready'
            ? `${ctx.data.outletName} · ${range.label}`
            : 'Analisa kecepatan keluar barang, rasio perputaran, dan estimasi hari persediaan'
        }
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={!report || report.rows.length === 0}
          >
            <Download className="w-16 h-16 mr-8" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <RangePicker value={value} today={today} onChange={setValue} />

      {err && <ErrorBox message={err.message} onRetry={err.reload} />}

      {loading && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat analisa perputaran stok">
          <div className="grid grid-cols-2 tablet:grid-cols-4 gap-12">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton h-72 rounded-lg" />
            ))}
          </div>
          <div className="cg-skeleton h-320 rounded-lg" />
        </div>
      )}

      {report && report.rows.length === 0 && (
        <div className="cg-empty">
          <p>
            <strong>Tidak ada data persediaan stok.</strong>
          </p>
          <p className="text-text-muted">
            Tambahkan stok produk atau bahan baku pada modul inventori untuk melihat analisa perputaran.
          </p>
        </div>
      )}

      {report && report.rows.length > 0 && (
        <div className="space-y-24 min-w-0">
          {/* Ringkasan KPI Perputaran Stok */}
          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-12" aria-label="Ringkasan perputaran persediaan">
            <StatCard
              label="Perputaran cepat (Fast)"
              value={`${num(report.summary.fastMovingCount)} barang`}
              subtext="Rasio perputaran ≥ 1.2× per periode"
              primary
              testId="stok-cepat"
            />
            <StatCard
              label="Perputaran lambat (Slow)"
              value={`${num(report.summary.slowMovingCount)} barang`}
              subtext="Rasio perputaran < 0.5× per periode"
              testId="stok-lambat"
            />
            <StatCard
              label="Stok macet (Dead Stock)"
              value={`${num(report.summary.deadStockCount)} barang`}
              subtext="0 penjualan pada periode ini"
              testId="stok-macet"
            />
            <StatCard
              label="Rata-rata rasio perputaran"
              value={`${report.summary.avgTurnoverRatio}×`}
              subtext={`Dari total ${num(report.summary.totalItems)} barang dipantau`}
              testId="rata-rata-rasio"
            />
          </div>

          {/* Kotak Petunjuk Formula */}
          <div className="p-12 border border-border rounded-lg bg-surface flex items-start gap-10 text-xs text-text-muted">
            <HelpCircle className="w-16 h-16 text-primary shrink-0 mt-2" aria-hidden />
            <div>
              <strong>Cara membaca analisa perputaran stok:</strong>
              <div className="mt-2 space-y-2">
                <span>
                  • <strong>Rasio Perputaran (Turnover Ratio)</strong> = Kuantitas Terjual ÷ Stok Rata-rata. Semakin tinggi angka rasio, semakin cepat barang berputar.
                </span>
                <span className="block">
                  • <strong>Hari Persediaan (DSI)</strong> = (Stok Rata-rata ÷ Kuantitas Terjual) × Hari Periode. Menunjukkan berapa hari stok yang ada akan habis berdasarkan laju penjualan saat ini.
                </span>
              </div>
            </div>
          </div>

          {/* Bagian Tabel & Filter */}
          <div className="border border-border rounded-xl bg-surface overflow-hidden min-w-0">
            <div className="p-16 border-b border-border flex flex-col tablet:flex-row tablet:items-center justify-between gap-12">
              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-[6px]" role="tablist">
                <FilterTab label="Semua" count={report.rows.length} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
                <FilterTab label="Cepat" count={report.summary.fastMovingCount} active={statusFilter === 'fast_moving'} onClick={() => setStatusFilter('fast_moving')} color="primary" />
                <FilterTab label="Normal" count={report.summary.normalCount} active={statusFilter === 'normal'} onClick={() => setStatusFilter('normal')} />
                <FilterTab label="Lambat" count={report.summary.slowMovingCount} active={statusFilter === 'slow_moving'} onClick={() => setStatusFilter('slow_moving')} color="amber" />
                <FilterTab label="Macet" count={report.summary.deadStockCount} active={statusFilter === 'dead_stock'} onClick={() => setStatusFilter('dead_stock')} color="danger" />
              </div>

              {/* Search Bar */}
              <div className="relative w-full tablet:w-[240px]">
                <Search className="w-16 h-16 absolute left-12 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
                <input
                  type="text"
                  placeholder="Cari nama barang..."
                  className="cg-input pl-[36px] text-sm w-full"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden tablet:block overflow-x-auto min-w-0">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-surface-raised border-b border-border text-xs text-text-muted uppercase">
                    <th className="py-12 px-16 font-medium">Barang</th>
                    <th className="py-12 px-16 font-medium text-right">Stok saat ini</th>
                    <th className="py-12 px-16 font-medium text-right">Stok rata-rata</th>
                    <th className="py-12 px-16 font-medium text-right">Terjual</th>
                    <th className="py-12 px-16 font-medium text-right">Rasio perputaran</th>
                    <th className="py-12 px-16 font-medium text-right">Hari persediaan</th>
                    <th className="py-12 px-16 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRows.map((r) => (
                    <tr key={r.productId} className="hover:bg-surface-raised/50 transition-colors">
                      <td className="py-12 px-16 font-medium text-text">
                        <div className="flex items-center gap-8">
                          <Boxes className="w-16 h-16 text-primary shrink-0" aria-hidden />
                          <div>
                            <span className="font-semibold block">{r.name}</span>
                            <span className="text-xs text-text-muted capitalize">
                              {r.kind === 'goods' ? 'Barang jadi' : 'Bahan baku'} · {r.unit}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-12 px-16 text-right cg-num font-mono">{num(r.currentStock)} {r.unit}</td>
                      <td className="py-12 px-16 text-right cg-num font-mono text-text-muted">{r.avgStock} {r.unit}</td>
                      <td className="py-12 px-16 text-right font-semibold cg-num text-primary">
                        {num(r.soldQty)} {r.unit}
                      </td>
                      <td className="py-12 px-16 text-right font-bold cg-num text-base">
                        {r.turnoverRatio > 0 ? `${r.turnoverRatio}×` : '0×'}
                      </td>
                      <td className="py-12 px-16 text-right cg-num font-mono">
                        {r.daysOfInventory !== null ? (
                          <span>{num(r.daysOfInventory)} hari</span>
                        ) : (
                          <span className="text-text-muted" title="Tidak ada penjualan">Macet</span>
                        )}
                      </td>
                      <td className="py-12 px-16 text-center">
                        <StatusBadge status={r.status} label={r.statusLabel} />
                      </td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-24 text-center text-text-muted">
                        Tidak ada barang yang cocok dengan filter atau pencarian.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile View (< 768px: Kartu Responsif) */}
            <div className="tablet:hidden divide-y divide-border min-w-0">
              {filteredRows.map((r) => (
                <div key={r.productId} className="p-16 space-y-12 min-w-0">
                  <div className="flex items-center justify-between gap-8 min-w-0">
                    <div className="flex items-center gap-8 min-w-0">
                      <Boxes className="w-16 h-16 text-primary shrink-0" aria-hidden />
                      <div className="truncate">
                        <strong className="text-sm block truncate">{r.name}</strong>
                        <span className="text-xs text-text-muted capitalize">
                          {r.kind === 'goods' ? 'Barang jadi' : 'Bahan baku'} · {r.unit}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={r.status} label={r.statusLabel} />
                  </div>

                  <div className="grid grid-cols-2 gap-8 text-xs bg-surface-raised p-8 rounded-lg min-w-0">
                    <div>
                      <span className="text-text-muted block">Stok saat ini</span>
                      <span className="font-semibold cg-num">{num(r.currentStock)} {r.unit}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block">Terjual</span>
                      <span className="font-semibold cg-num text-primary">{num(r.soldQty)} {r.unit}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block">Rasio perputaran</span>
                      <strong className="font-bold cg-num text-sm text-text">{r.turnoverRatio}×</strong>
                    </div>
                    <div>
                      <span className="text-text-muted block">Hari persediaan</span>
                      <span className="font-semibold cg-num">
                        {r.daysOfInventory !== null ? `${num(r.daysOfInventory)} hari` : 'Macet'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {filteredRows.length === 0 && (
                <div className="p-24 text-center text-text-muted text-sm">
                  Tidak ada barang yang cocok dengan filter atau pencarian.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, label }: { status: StockTurnoverRow['status']; label: string }) {
  let badgeClass = 'bg-surface-raised text-text-muted border-border';
  if (status === 'fast_moving') {
    badgeClass = 'bg-primary/10 text-primary border-primary/20 font-semibold';
  } else if (status === 'normal') {
    badgeClass = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20';
  } else if (status === 'slow_moving') {
    badgeClass = 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
  } else if (status === 'dead_stock') {
    badgeClass = 'bg-danger/10 text-danger border-danger/20 font-semibold';
  }

  return (
    <span className={`inline-flex items-center px-8 py-[3px] rounded-full text-xs border ${badgeClass}`}>
      {label}
    </span>
  );
}

function FilterTab({
  label,
  count,
  active,
  onClick,
  color,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: 'primary' | 'amber' | 'danger';
}) {
  let activeClass = 'bg-primary text-white shadow-xs';
  if (color === 'amber' && active) activeClass = 'bg-amber-600 text-white shadow-xs';
  if (color === 'danger' && active) activeClass = 'bg-danger text-white shadow-xs';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-[10px] py-[5px] rounded-lg text-xs transition-colors flex items-center gap-[6px] border ${
        active
          ? `${activeClass} border-transparent`
          : 'bg-surface-raised text-text border-border hover:bg-surface hover:text-text font-medium'
      }`}
    >
      <span>{label}</span>
      <span
        className={`text-[10px] px-[6px] py-[1px] rounded-full font-bold ${
          active ? 'bg-white/20 text-white' : 'bg-surface text-text-muted border border-border/50'
        }`}
      >
        {count}
      </span>
    </button>
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

