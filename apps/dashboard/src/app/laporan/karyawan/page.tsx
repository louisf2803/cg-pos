'use client';

import { useMemo, useState } from 'react';
import { Download, Search, UserCheck } from 'lucide-react';
import { buildStaffReport, formatRole, formatRp, toCsv, type StaffReportRow } from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';

const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);

export default function StaffReportPage() {
  const data = useData();
  const { ctx, value, setValue, range, today, state } = useReport();
  const [search, setSearch] = useState('');

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
    if (!report) return;
    const head = [
      'Nama Karyawan',
      'Peran',
      'Jumlah Transaksi',
      'Total Penjualan',
      'Rata-rata per Transaksi',
      'Transaksi Void',
      'Total Void',
      'Transaksi Refund',
      'Total Refund',
      'Diskon Manual (Order)',
      'Total Diskon Manual',
      'Pembayaran Gratis (Trx)',
      'Total Komplimen',
    ];
    const line = (r: StaffReportRow) => [
      r.name,
      formatRole(r.role),
      r.transactionCount,
      r.totalSales,
      r.avgSalesPerTx,
      r.voidCount,
      r.voidTotal,
      r.refundCount,
      r.refundTotal,
      r.manualDiscountCount,
      r.manualDiscountTotal,
      r.complimentaryCount,
      r.complimentaryTotal,
    ];
    const totalLine = [
      'TOTAL KESELURUHAN',
      '',
      report.totals.transactionCount,
      report.totals.totalSales,
      report.totals.avgSalesPerTx,
      report.totals.voidCount,
      report.totals.voidTotal,
      report.totals.refundCount,
      report.totals.refundTotal,
      report.totals.manualDiscountCount,
      report.totals.manualDiscountTotal,
      report.totals.complimentaryCount,
      report.totals.complimentaryTotal,
    ];
    const csvContent = toCsv([head, ...report.rows.map(line), [], totalLine]);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-karyawan-${range.label.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const err = ctx.status === 'error' ? ctx : state.status === 'error' ? state : extra.status === 'error' ? extra : null;
  const loading = ctx.status === 'loading' || state.status === 'loading' || extra.status === 'loading';

  return (
    <div className="space-y-24 min-w-0">
      <PageHeader
        title="Laporan karyawan"
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : 'Kinerja penjualan, transaksi, void, dan potongan per kasir'}
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={!report || (report.totals.transactionCount === 0 && report.totals.voidCount === 0)}
          >
            <Download className="w-16 h-16 mr-8" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <RangePicker value={value} today={today} onChange={setValue} />

      {err && <ErrorBox message={err.message} onRetry={err.reload} />}

      {loading && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat laporan karyawan">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
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

            {/* Tampilan Desktop (Tabel) */}
            <div className="hidden md:block overflow-x-auto min-w-0">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-surface-raised border-b border-border text-xs text-text-muted uppercase">
                    <th className="py-12 px-16 font-medium">Karyawan</th>
                    <th className="py-12 px-16 font-medium text-right">Transaksi</th>
                    <th className="py-12 px-16 font-medium text-right">Penjualan</th>
                    <th className="py-12 px-16 font-medium text-right">Rata-rata</th>
                    <th className="py-12 px-16 font-medium text-right">Void</th>
                    <th className="py-12 px-16 font-medium text-right">Refund</th>
                    <th className="py-12 px-16 font-medium text-right">Diskon manual</th>
                    <th className="py-12 px-16 font-medium text-right">Komplimen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRows.map((r) => (
                    <tr key={r.key} className="hover:bg-surface-raised/50 transition-colors">
                      <td className="py-12 px-16 font-medium text-text">
                        <div className="flex items-center gap-8">
                          <UserCheck className="w-16 h-16 text-primary shrink-0" aria-hidden />
                          <div>
                            <span className="font-semibold block">{r.name}</span>
                            <span className="text-xs text-text-muted">{formatRole(r.role)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-12 px-16 text-right cg-num">{num(r.transactionCount)}</td>
                      <td className="py-12 px-16 text-right font-semibold cg-num text-primary">{formatRp(r.totalSales)}</td>
                      <td className="py-12 px-16 text-right cg-num">{formatRp(r.avgSalesPerTx)}</td>
                      <td className="py-12 px-16 text-right">
                        {r.voidCount > 0 ? (
                          <div>
                            <span className="text-danger font-medium cg-num">{num(r.voidCount)}</span>
                            <span className="block text-xs text-text-muted cg-num">{formatRp(r.voidTotal)}</span>
                          </div>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-12 px-16 text-right">
                        {r.refundCount > 0 ? (
                          <div>
                            <span className="text-amber-600 font-medium cg-num">{num(r.refundCount)}</span>
                            <span className="block text-xs text-text-muted cg-num">{formatRp(r.refundTotal)}</span>
                          </div>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-12 px-16 text-right">
                        {r.manualDiscountTotal > 0 ? (
                          <div>
                            <span className="cg-num font-medium">{formatRp(r.manualDiscountTotal)}</span>
                            <span className="block text-xs text-text-muted cg-num">{num(r.manualDiscountCount)} pesanan</span>
                          </div>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-12 px-16 text-right">
                        {r.complimentaryTotal > 0 ? (
                          <div>
                            <span className="cg-num font-medium">{formatRp(r.complimentaryTotal)}</span>
                            <span className="block text-xs text-text-muted cg-num">{num(r.complimentaryCount)} trx</span>
                          </div>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-24 text-center text-text-muted">
                        Tidak ada karyawan yang cocok dengan pencarian &quot;{search}&quot;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Tampilan Mobile (< 768px: Kartu Responsif) */}
            <div className="md:hidden divide-y divide-border min-w-0">
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
