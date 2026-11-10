'use client';

import { useMemo, useState } from 'react';
import { Download, Search, UserCheck } from 'lucide-react';
import {
  buildStaffReport,
  formatRole,
  formatRp,
  toCsv,
  type ColumnDef,
  type StaffReportRow,
  type StaffReportTotals,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { ColumnChooser, useColumnPrefs } from '@/components/column-chooser';
import { useReport } from '@/lib/use-report';

const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);

type StaffColKey =
  | 'name'
  | 'role'
  | 'transactionCount'
  | 'totalSales'
  | 'avgSalesPerTx'
  | 'voidCount'
  | 'voidTotal'
  | 'refundCount'
  | 'refundTotal'
  | 'manualDiscountCount'
  | 'manualDiscountTotal'
  | 'complimentaryCount'
  | 'complimentaryTotal';

const STAFF_COLUMNS: ColumnDef<StaffColKey>[] = [
  { key: 'name', label: 'Karyawan', align: 'left' },
  { key: 'role', label: 'Peran', defaultVisible: false, align: 'left' },
  { key: 'transactionCount', label: 'Jumlah transaksi', align: 'right' },
  { key: 'totalSales', label: 'Total penjualan', align: 'right' },
  { key: 'avgSalesPerTx', label: 'Rata-rata penjualan', align: 'right' },
  { key: 'voidCount', label: 'Jumlah void', align: 'right' },
  { key: 'voidTotal', label: 'Total void', align: 'right' },
  { key: 'refundCount', label: 'Jumlah refund', align: 'right' },
  { key: 'refundTotal', label: 'Total refund', align: 'right' },
  { key: 'manualDiscountCount', label: 'Diskon manual (pesanan)', defaultVisible: false, align: 'right' },
  { key: 'manualDiscountTotal', label: 'Total diskon manual', align: 'right' },
  { key: 'complimentaryCount', label: 'Komplimen (transaksi)', defaultVisible: false, align: 'right' },
  { key: 'complimentaryTotal', label: 'Total komplimen', align: 'right' },
];

function getStaffCsvVal(key: StaffColKey, r: StaffReportRow): string | number {
  switch (key) {
    case 'name':
      return r.name;
    case 'role':
      return formatRole(r.role);
    case 'transactionCount':
      return r.transactionCount;
    case 'totalSales':
      return r.totalSales;
    case 'avgSalesPerTx':
      return r.avgSalesPerTx;
    case 'voidCount':
      return r.voidCount;
    case 'voidTotal':
      return r.voidTotal;
    case 'refundCount':
      return r.refundCount;
    case 'refundTotal':
      return r.refundTotal;
    case 'manualDiscountCount':
      return r.manualDiscountCount;
    case 'manualDiscountTotal':
      return r.manualDiscountTotal;
    case 'complimentaryCount':
      return r.complimentaryCount;
    case 'complimentaryTotal':
      return r.complimentaryTotal;
  }
}

function getStaffTotalCsvVal(key: StaffColKey, totals: StaffReportTotals): string | number {
  switch (key) {
    case 'name':
      return 'TOTAL KESELURUHAN';
    case 'role':
      return '';
    case 'transactionCount':
      return totals.transactionCount;
    case 'totalSales':
      return totals.totalSales;
    case 'avgSalesPerTx':
      return totals.avgSalesPerTx;
    case 'voidCount':
      return totals.voidCount;
    case 'voidTotal':
      return totals.voidTotal;
    case 'refundCount':
      return totals.refundCount;
    case 'refundTotal':
      return totals.refundTotal;
    case 'manualDiscountCount':
      return totals.manualDiscountCount;
    case 'manualDiscountTotal':
      return totals.manualDiscountTotal;
    case 'complimentaryCount':
      return totals.complimentaryCount;
    case 'complimentaryTotal':
      return totals.complimentaryTotal;
  }
}

function renderStaffCell(key: StaffColKey, r: StaffReportRow) {
  switch (key) {
    case 'name':
      return (
        <td key={key} className="py-12 px-16 font-medium text-text">
          <div className="flex items-center gap-8">
            <UserCheck className="w-16 h-16 text-primary shrink-0" aria-hidden />
            <div>
              <span className="font-semibold block">{r.name}</span>
              <span className="text-xs text-text-muted">{formatRole(r.role)}</span>
            </div>
          </div>
        </td>
      );
    case 'role':
      return (
        <td key={key} className="py-12 px-16 text-xs text-text-muted">
          {formatRole(r.role)}
        </td>
      );
    case 'transactionCount':
      return <td key={key} className="py-12 px-16 text-right cg-num">{num(r.transactionCount)}</td>;
    case 'totalSales':
      return (
        <td key={key} className="py-12 px-16 text-right font-semibold cg-num text-primary">
          {formatRp(r.totalSales)}
        </td>
      );
    case 'avgSalesPerTx':
      return <td key={key} className="py-12 px-16 text-right cg-num">{formatRp(r.avgSalesPerTx)}</td>;
    case 'voidCount':
      return (
        <td key={key} className="py-12 px-16 text-right cg-num text-danger">
          {r.voidCount > 0 ? num(r.voidCount) : '—'}
        </td>
      );
    case 'voidTotal':
      return (
        <td key={key} className="py-12 px-16 text-right cg-num text-danger">
          {r.voidTotal > 0 ? formatRp(r.voidTotal) : '—'}
        </td>
      );
    case 'refundCount':
      return (
        <td key={key} className="py-12 px-16 text-right cg-num text-amber-600">
          {r.refundCount > 0 ? num(r.refundCount) : '—'}
        </td>
      );
    case 'refundTotal':
      return (
        <td key={key} className="py-12 px-16 text-right cg-num text-amber-600">
          {r.refundTotal > 0 ? formatRp(r.refundTotal) : '—'}
        </td>
      );
    case 'manualDiscountCount':
      return (
        <td key={key} className="py-12 px-16 text-right cg-num">
          {r.manualDiscountCount > 0 ? `${num(r.manualDiscountCount)} pesanan` : '—'}
        </td>
      );
    case 'manualDiscountTotal':
      return (
        <td key={key} className="py-12 px-16 text-right cg-num font-medium">
          {r.manualDiscountTotal > 0 ? formatRp(r.manualDiscountTotal) : '—'}
        </td>
      );
    case 'complimentaryCount':
      return (
        <td key={key} className="py-12 px-16 text-right cg-num">
          {r.complimentaryCount > 0 ? `${num(r.complimentaryCount)} trx` : '—'}
        </td>
      );
    case 'complimentaryTotal':
      return (
        <td key={key} className="py-12 px-16 text-right cg-num font-medium">
          {r.complimentaryTotal > 0 ? formatRp(r.complimentaryTotal) : '—'}
        </td>
      );
  }
}

export default function StaffReportPage() {
  const data = useData();
  const { ctx, value, setValue, range, today, state } = useReport();
  const [search, setSearch] = useState('');

  const colPrefs = useColumnPrefs('laporan_karyawan', STAFF_COLUMNS);

  const extra = useAsync(async () => {
    const [refunds, voided, empList] = await Promise.all([
      data.listRefundsBetween(range),
      data.listOrders({ status: 'void', from: range.from, to: range.to, by: 'closed', all: true }),
      data.listManagedEmployees(),
    ]);
    return { refunds, voided, empList };
  }, [data, range.from, range.to]);

  const report = useMemo(() => {
    if (state.status !== 'ready' || !state.data || extra.status !== 'ready' || !extra.data) return null;
    return buildStaffReport({
      orders: state.data.orders,
      employees: extra.data.empList,
      refunds: extra.data.refunds,
      voided: extra.data.voided,
    });
  }, [state, extra]);

  const filteredRows = useMemo(() => {
    if (!report) return [];
    if (!search.trim()) return report.rows;
    const q = search.toLowerCase().trim();
    return report.rows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.role && r.role.toLowerCase().includes(q))
    );
  }, [report, search]);

  function downloadCsv() {
    if (!report || !colPrefs.hasVisible) return;
    const head = colPrefs.activeColumns.map((c) => c.label);
    const rows = filteredRows.map((r) =>
      colPrefs.activeColumns.map((c) => getStaffCsvVal(c.key, r))
    );
    const totalLine = colPrefs.activeColumns.map((c) =>
      getStaffTotalCsvVal(c.key, report.totals)
    );

    const csvContent = toCsv([head, ...rows, [], totalLine]);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-karyawan-${range.label.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-20 min-w-0">
      <PageHeader
        title="Laporan karyawan"
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : range.label}
        actions={
          <div className="flex items-center gap-8">
            <ColumnChooser
              columns={STAFF_COLUMNS}
              prefs={colPrefs.prefs}
              onToggle={colPrefs.toggle}
              onMoveUp={colPrefs.moveUp}
              onMoveDown={colPrefs.moveDown}
              onReset={colPrefs.reset}
            />
            <button
              className="cg-btn cg-btn--secondary"
              onClick={downloadCsv}
              disabled={!colPrefs.hasVisible || !report || filteredRows.length === 0}
            >
              <Download className="cg-icon" aria-hidden /> Unduh CSV
            </button>
          </div>
        }
      />

      <RangePicker value={value} today={today} onChange={setValue} />

      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {extra.status === 'error' && <ErrorBox message={extra.message} onRetry={extra.reload} />}

      {(ctx.status === 'loading' || state.status === 'loading' || extra.status === 'loading') && (
        <div className="space-y-16" aria-busy="true" aria-label="Memuat laporan">
          <div className="grid grid-cols-2 tablet:grid-cols-4 gap-12">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton h-72 rounded-lg" />
            ))}
          </div>
          <div className="cg-skeleton h-240 rounded-lg" />
        </div>
      )}

      {report && report.totals.transactionCount === 0 && report.totals.voidCount === 0 && report.totals.refundCount === 0 && (
        <div className="cg-empty">
          <p>
            <strong>Tidak ada transaksi karyawan pada rentang ini.</strong>
          </p>
          <p className="text-text-muted">
            Laporan dihitung dari pesanan lunas, pembatalan (void), pengembalian dana (refund), dan potongan per kasir.
          </p>
        </div>
      )}

      {report && (report.totals.transactionCount > 0 || report.totals.voidCount > 0 || report.totals.refundCount > 0) && (
        <div className="space-y-24 min-w-0">
          {/* Ringkasan KPI Karyawan */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-12" aria-label="Ringkasan kinerja karyawan">
            <StatCard label="Total penjualan" value={formatRp(report.totals.totalSales)} testId="total-penjualan" primary />
            <StatCard label="Jumlah transaksi" value={`${num(report.totals.transactionCount)} transaksi`} testId="jumlah-transaksi" />
            <StatCard label="Rata-rata per transaksi" value={formatRp(report.totals.avgSalesPerTx)} testId="rata-rata-transaksi" />
            <StatCard
              label="Void & refund"
              value={`${num(report.totals.voidCount)} void / ${num(report.totals.refundCount)} refund`}
              subtext={`${formatRp(report.totals.voidTotal + report.totals.refundTotal)}`}
            />
          </div>

          {/* Kotak Ringkasan Potongan Khusus */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
            <div className="p-12 border border-border rounded-lg bg-surface flex items-center justify-between">
              <div>
                <span className="block text-xs text-text-muted">Diskon manual diberikan</span>
                <strong className="text-base cg-num">{formatRp(report.totals.manualDiscountTotal)}</strong>
              </div>
              <span className="text-xs px-8 py-4 bg-surface-raised rounded text-text-muted font-medium">
                {num(report.totals.manualDiscountCount)} pesanan
              </span>
            </div>
            <div className="p-12 border border-border rounded-lg bg-surface flex items-center justify-between">
              <div>
                <span className="block text-xs text-text-muted">Pembayaran gratis (komplimen)</span>
                <strong className="text-base cg-num">{formatRp(report.totals.complimentaryTotal)}</strong>
              </div>
              <span className="text-xs px-8 py-4 bg-surface-raised rounded text-text-muted font-medium">
                {num(report.totals.complimentaryCount)} transaksi
              </span>
            </div>
          </div>

          {/* Bagian Daftar Karyawan */}
          <div className="border border-border rounded-xl bg-surface overflow-hidden min-w-0">
            <div className="p-16 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-12">
              <div>
                <h2 className="text-base font-semibold">Rincian per karyawan</h2>
                <p className="text-xs text-text-muted">Urutan berdasarkan perolehan total penjualan tertinggi</p>
              </div>
              <div className="relative w-full sm:w-240">
                <Search className="w-16 h-16 absolute left-12 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
                <input
                  type="text"
                  placeholder="Cari karyawan..."
                  className="cg-input pl-[36px] text-sm w-full"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {!colPrefs.hasVisible ? (
              <div className="cg-empty py-32">
                <p>
                  <strong>Semua kolom disembunyikan.</strong>
                </p>
                <p className="text-text-muted mt-4">
                  Klik tombol <strong>Atur kolom</strong> untuk memilih kolom yang ingin ditampilkan.
                </p>
              </div>
            ) : (
              <>
                {/* Tampilan Desktop (Tabel) */}
                <div className="hidden tablet:block overflow-x-auto min-w-0">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-raised border-b border-border text-xs text-text-muted uppercase">
                        {colPrefs.activeColumns.map((c) => (
                          <th
                            key={c.key}
                            className={`py-12 px-16 font-medium ${
                              c.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredRows.map((r) => (
                        <tr key={r.key} className="hover:bg-surface-raised/50 transition-colors">
                          {colPrefs.activeColumns.map((c) => renderStaffCell(c.key, r))}
                        </tr>
                      ))}
                      {filteredRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={colPrefs.activeColumns.length}
                            className="py-24 text-center text-text-muted"
                          >
                            Tidak ada karyawan yang cocok dengan pencarian &quot;{search}&quot;.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Tampilan Mobile (< 768px: Kartu Responsif) */}
                <div className="tablet:hidden divide-y divide-border min-w-0">
                  {filteredRows.map((r) => (
                    <div key={r.key} className="p-16 space-y-12 min-w-0">
                      <div className="flex items-center justify-between gap-8 min-w-0">
                        <div className="flex items-center gap-8 min-w-0">
                          <UserCheck className="w-16 h-16 text-primary shrink-0" aria-hidden />
                          <div className="truncate">
                            <strong className="text-sm block truncate">{r.name}</strong>
                            <span className="text-xs text-text-muted">{formatRole(r.role)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs text-text-muted block">Penjualan</span>
                          <strong className="text-sm text-primary cg-num">{formatRp(r.totalSales)}</strong>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-8 text-xs bg-surface-raised p-8 rounded-lg min-w-0">
                        <div>
                          <span className="text-text-muted block">Transaksi</span>
                          <span className="font-semibold cg-num">{num(r.transactionCount)} trx</span>
                        </div>
                        <div>
                          <span className="text-text-muted block">Rata-rata / trx</span>
                          <span className="font-semibold cg-num">{formatRp(r.avgSalesPerTx)}</span>
                        </div>
                        <div>
                          <span className="text-text-muted block">Void</span>
                          <span className={r.voidCount > 0 ? 'text-danger font-medium cg-num' : 'text-text-muted'}>
                            {r.voidCount > 0 ? `${num(r.voidCount)} (${formatRp(r.voidTotal)})` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-text-muted block">Refund</span>
                          <span className={r.refundCount > 0 ? 'text-amber-600 font-medium cg-num' : 'text-text-muted'}>
                            {r.refundCount > 0 ? `${num(r.refundCount)} (${formatRp(r.refundTotal)})` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-text-muted block">Diskon manual</span>
                          <span className="cg-num">
                            {r.manualDiscountTotal > 0 ? `${formatRp(r.manualDiscountTotal)} (${num(r.manualDiscountCount)})` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-text-muted block">Komplimen</span>
                          <span className="cg-num">
                            {r.complimentaryTotal > 0 ? `${formatRp(r.complimentaryTotal)} (${num(r.complimentaryCount)})` : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredRows.length === 0 && (
                    <div className="p-24 text-center text-text-muted text-sm">
                      Tidak ada karyawan yang cocok dengan pencarian &quot;{search}&quot;.
                    </div>
                  )}
                </div>
              </>
            )}
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
    <div className="p-12 sm:p-16 border border-border rounded-xl bg-surface shadow-xs min-w-0 flex flex-col justify-between">
      <div>
        <span className="text-xs text-text-muted font-medium block mb-4 leading-tight break-words">{label}</span>
        <strong className={`text-xl sm:text-2xl font-bold block text-left leading-tight tracking-tight ${primary ? 'text-primary' : 'text-text'}`} data-testid={testId}>
          {value}
        </strong>
      </div>
      {subtext && <span className="text-xs text-text-muted block mt-4 leading-tight break-words">{subtext}</span>}
    </div>
  );
}
