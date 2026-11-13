'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, RefreshCw, Search } from 'lucide-react';
import {
  filterCustomerDepositBalances,
  formatRp,
  localDateKey,
  summarizeCustomerDepositBalances,
  summarizeDepositRefunds,
  summarizeDepositSales,
  toCsv,
  type CustomerDepositBalance,
  type DepositRefundRecord,
  type DepositSaleRecord,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { dateRange, presetRange } from '@/lib/range';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker, type RangeValue } from '@/components/range-picker';
import { downloadCsvWithHistory } from '@/lib/export';

function fmtDateTime(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function LaporanDepositPage() {
  const data = useData();
  const state = useAsync(async () => {
    const [ctx, sales, refunds, balances] = await Promise.all([
      data.getContext(),
      data.listDepositSales(),
      data.listDepositRefunds(),
      data.listCustomerDepositBalances(),
    ]);
    return { ctx, sales, refunds, balances };
  }, [data]);

  const [tab, setTab] = useState<'sales' | 'refunds' | 'balances'>('sales');
  const [range, setRange] = useState<RangeValue>({ preset: '7d', from: '', to: '' });
  const [search, setSearch] = useState('');

  const tz = state.status === 'ready' ? state.data.ctx.timezone : 'Asia/Jakarta';
  const today = localDateKey(new Date(), tz);

  const resolvedRange = useMemo(() => {
    if (range.preset === 'custom') {
      return dateRange(tz, range.from || today, range.to || today);
    }
    return presetRange(tz, range.preset);
  }, [tz, range, today]);

  const rawSales = state.status === 'ready' ? state.data.sales : [];
  const rawRefunds = state.status === 'ready' ? state.data.refunds : [];
  const rawBalances = state.status === 'ready' ? state.data.balances : [];

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    const startMs = new Date(resolvedRange.from).getTime();
    const endMs = new Date(resolvedRange.to).getTime();
    return rawSales.filter((row) => {
      const t = new Date(row.occurredAt).getTime();
      if (t < startMs || t >= endMs) return false;
      if (!q) return true;
      return (
        row.customerName.toLowerCase().includes(q) ||
        row.packageName.toLowerCase().includes(q) ||
        row.orderNumber.toLowerCase().includes(q)
      );
    });
  }, [rawSales, resolvedRange, search]);

  const filteredRefunds = useMemo(() => {
    const q = search.trim().toLowerCase();
    const startMs = new Date(resolvedRange.from).getTime();
    const endMs = new Date(resolvedRange.to).getTime();
    return rawRefunds.filter((row) => {
      const t = new Date(row.occurredAt).getTime();
      if (t < startMs || t >= endMs) return false;
      if (!q) return true;
      return (
        row.customerName.toLowerCase().includes(q) ||
        row.reason.toLowerCase().includes(q)
      );
    });
  }, [rawRefunds, resolvedRange, search]);

  const filteredBalances = useMemo(() => {
    return filterCustomerDepositBalances(rawBalances, search);
  }, [rawBalances, search]);

  const salesSummary = useMemo(() => summarizeDepositSales(filteredSales), [filteredSales]);
  const refundSummary = useMemo(() => summarizeDepositRefunds(filteredRefunds), [filteredRefunds]);
  const balanceSummary = useMemo(() => summarizeCustomerDepositBalances(filteredBalances), [filteredBalances]);

  function handleExportCsv() {
    if (tab === 'sales') {
      if (!filteredSales.length) return;
      const headers = ['Tanggal', 'No. Transaksi', 'Pelanggan', 'Paket Deposit', 'Nominal Saldo', 'Harga Jual', 'Metode Bayar'];
      const rows = filteredSales.map((r) => [
        fmtDateTime(r.occurredAt, tz),
        r.orderNumber,
        r.customerName,
        r.packageName,
        r.creditAmount,
        r.salePrice,
        r.methodName,
      ]);
      const csv = toCsv([headers, ...rows]);
      downloadCsvWithHistory({
        fileName: `laporan-penjualan-deposit-${today}.csv`,
        csvContent: csv,
        reportName: 'Penjualan deposit',
        period: `${resolvedRange.from.slice(0, 10)} – ${resolvedRange.to.slice(0, 10)}`,
        rowCount: filteredSales.length,
        sourceUrl: '/laporan/deposit',
      });
    } else if (tab === 'refunds') {
      if (!filteredRefunds.length) return;
      const headers = ['Tanggal', 'Pelanggan', 'Nominal Refund', 'Alasan', 'Diproses Oleh'];
      const rows = filteredRefunds.map((r) => [
        fmtDateTime(r.occurredAt, tz),
        r.customerName,
        r.amount,
        r.reason,
        r.processedBy,
      ]);
      const csv = toCsv([headers, ...rows]);
      downloadCsvWithHistory({
        fileName: `laporan-refund-deposit-${today}.csv`,
        csvContent: csv,
        reportName: 'Refund deposit',
        period: `${resolvedRange.from.slice(0, 10)} – ${resolvedRange.to.slice(0, 10)}`,
        rowCount: filteredRefunds.length,
        sourceUrl: '/laporan/deposit',
      });
    } else {
      if (!filteredBalances.length) return;
      const headers = ['Pelanggan', 'No. Telepon', 'Total Pembelian Paket', 'Total Pemakaian', 'Total Refund', 'Sisa Saldo Deposit'];
      const rows = filteredBalances.map((r) => [
        r.customerName,
        r.customerPhone ?? '',
        r.totalDepositPurchased,
        r.totalDepositUsed,
        r.totalDepositRefunded,
        r.currentBalance,
      ]);
      const csv = toCsv([headers, ...rows]);
      downloadCsvWithHistory({
        fileName: `laporan-saldo-deposit-pelanggan-${today}.csv`,
        csvContent: csv,
        reportName: 'Saldo deposit pelanggan',
        period: `Per ${today}`,
        rowCount: filteredBalances.length,
        sourceUrl: '/laporan/deposit',
      });
    }
  }

  return (
    <>
      <PageHeader
        title="Laporan deposit"
        subtitle="Pantau transaksi penjualan paket deposit, pengembalian saldo, dan saldo beredar per pelanggan"
        helpText="Menampilkan ringkasan pembelian paket deposit, pemakaian saldo, refund, dan sisa saldo pelanggan."
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              onClick={handleExportCsv}
              title="Unduh laporan dalam format CSV"
            >
              <Download className="cg-icon w-16 h-16" aria-hidden /> Unduh CSV
            </button>
            <Link href="/deposit" className="cg-btn cg-btn--secondary cg-btn--sm">
              Kelola Paket Deposit
            </Link>
          </div>
        }
      />

      {state.status === 'error' && (
        <ErrorBox message={state.message} onRetry={state.reload} />
      )}

      {state.status === 'loading' && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat laporan deposit">
          <div className="cg-skeleton h-[44px]" />
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[80px]" />
            ))}
          </div>
          <div className="cg-skeleton h-[240px]" />
        </div>
      )}

      {state.status === 'ready' && (
        <div className="grid gap-16 min-w-0">
          {tab !== 'balances' && (
            <RangePicker
              value={{ preset: range.preset, from: range.from || today, to: range.to || today }}
              today={today}
              onChange={setRange}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-12 min-w-0">
            <div className="cg-tabs" role="tablist" aria-label="Tab Laporan Deposit">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'sales'}
                className={`cg-tab ${tab === 'sales' ? 'cg-tab--active' : ''}`}
                onClick={() => setTab('sales')}
              >
                Penjualan Deposit ({filteredSales.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'refunds'}
                className={`cg-tab ${tab === 'refunds' ? 'cg-tab--active' : ''}`}
                onClick={() => setTab('refunds')}
              >
                Refund Deposit ({filteredRefunds.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'balances'}
                className={`cg-tab ${tab === 'balances' ? 'cg-tab--active' : ''}`}
                onClick={() => setTab('balances')}
              >
                Saldo per Pelanggan ({filteredBalances.length})
              </button>
            </div>

            <div className="relative flex-1 min-w-[200px] max-w-[340px]">
              <Search className="w-16 h-16 text-text-muted absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
              <input
                type="search"
                className="cg-input pl-[34px] w-full"
                placeholder={
                  tab === 'sales'
                    ? 'Cari pelanggan atau paket…'
                    : tab === 'refunds'
                    ? 'Cari pelanggan atau alasan…'
                    : 'Cari nama atau telepon pelanggan…'
                }
                aria-label="Cari transaksi deposit"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {tab === 'sales' && (
            <>
              <dl className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Total penjualan deposit</dt>
                  <dd className="text-xl font-bold cg-num text-text mt-4">
                    {formatRp(salesSummary.totalSalePrice)}
                  </dd>
                </div>
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Total saldo diberikan</dt>
                  <dd className="text-xl font-bold cg-num text-accent-strong mt-4">
                    {formatRp(salesSummary.totalCreditGiven)}
                  </dd>
                </div>
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Jumlah transaksi · bonus</dt>
                  <dd className="text-xl font-bold cg-num text-text mt-4">
                    {salesSummary.count}x · +{formatRp(salesSummary.totalBonus)}
                  </dd>
                </div>
              </dl>

              {filteredSales.length === 0 ? (
                <div className="cg-empty">
                  <p>
                    <strong>Belum ada penjualan paket deposit pada rentang ini.</strong>
                  </p>
                  <p className="text-text-muted text-sm mt-4">
                    Pilih rentang tanggal lain atau bersihkan kata pencarian.
                  </p>
                </div>
              ) : (
                <>
                  <ul className="grid gap-12 tablet:hidden min-w-0">
                    {filteredSales.map((row) => (
                      <li
                        key={row.id}
                        className="p-16 rounded-xl border border-border bg-surface-raised grid gap-8 min-w-0"
                      >
                        <div className="flex items-start justify-between gap-8 min-w-0">
                          <div className="min-w-0">
                            <strong className="text-sm text-text block break-words">
                              {row.customerName}
                            </strong>
                            <span className="text-xs text-text-muted cg-num">{row.orderNumber}</span>
                          </div>
                          <span className="cg-badge text-xs shrink-0">{row.methodName}</span>
                        </div>
                        <div className="text-xs text-text-muted">{fmtDateTime(row.occurredAt, tz)}</div>
                        <div className="text-sm font-medium text-text break-words">{row.packageName}</div>
                        <div className="flex items-center justify-between pt-8 border-t border-border/60 text-sm">
                          <span className="text-text-muted">Harga jual / Saldo</span>
                          <span className="cg-num font-bold text-text">
                            {formatRp(row.salePrice)} → {formatRp(row.creditAmount)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden tablet:block rounded-xl border border-border bg-surface-raised overflow-x-auto min-w-0">
                    <table className="cg-data w-full">
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>No. Transaksi</th>
                          <th>Pelanggan</th>
                          <th>Paket Deposit</th>
                          <th className="cg-num">Nominal Saldo</th>
                          <th className="cg-num">Harga Jual</th>
                          <th>Metode Bayar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSales.map((row) => (
                          <tr key={row.id}>
                            <td className="whitespace-nowrap text-text-muted">
                              {fmtDateTime(row.occurredAt, tz)}
                            </td>
                            <td className="cg-num font-semibold whitespace-nowrap">{row.orderNumber}</td>
                            <td className="font-medium break-words">{row.customerName}</td>
                            <td className="break-words">{row.packageName}</td>
                            <td className="cg-num font-bold whitespace-nowrap">
                              {formatRp(row.creditAmount)}
                            </td>
                            <td className="cg-num whitespace-nowrap">{formatRp(row.salePrice)}</td>
                            <td className="whitespace-nowrap">
                              <span className="cg-badge text-xs">{row.methodName}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'refunds' && (
            <>
              <dl className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Total nominal refund deposit</dt>
                  <dd className="text-xl font-bold cg-num text-danger-strong mt-4">
                    {formatRp(refundSummary.totalRefundAmount)}
                  </dd>
                </div>
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Jumlah pengembalian saldo</dt>
                  <dd className="text-xl font-bold cg-num text-text mt-4">
                    {refundSummary.count} transaksi
                  </dd>
                </div>
              </dl>

              {filteredRefunds.length === 0 ? (
                <div className="cg-empty">
                  <p>
                    <strong>Belum ada refund saldo deposit pada rentang ini.</strong>
                  </p>
                  <p className="text-text-muted text-sm mt-4">
                    Pilih rentang tanggal lain atau bersihkan kata pencarian.
                  </p>
                </div>
              ) : (
                <>
                  <ul className="grid gap-12 tablet:hidden min-w-0">
                    {filteredRefunds.map((row) => (
                      <li
                        key={row.id}
                        className="p-16 rounded-xl border border-border bg-surface-raised grid gap-8 min-w-0"
                      >
                        <div className="flex items-start justify-between gap-8">
                          <strong className="text-sm text-text break-words">{row.customerName}</strong>
                          <strong className="cg-num text-sm text-danger-strong shrink-0">
                            {formatRp(row.amount)}
                          </strong>
                        </div>
                        <div className="text-xs text-text-muted">{fmtDateTime(row.occurredAt, tz)}</div>
                        <p className="text-sm text-text break-words">{row.reason}</p>
                        <div className="text-xs text-text-muted pt-4 border-t border-border/60">
                          Diproses oleh: {row.processedBy}
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden tablet:block rounded-xl border border-border bg-surface-raised overflow-x-auto min-w-0">
                    <table className="cg-data w-full">
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>Pelanggan</th>
                          <th className="cg-num">Nominal Refund</th>
                          <th>Alasan</th>
                          <th>Diproses Oleh</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRefunds.map((row) => (
                          <tr key={row.id}>
                            <td className="whitespace-nowrap text-text-muted">
                              {fmtDateTime(row.occurredAt, tz)}
                            </td>
                            <td className="font-medium break-words">{row.customerName}</td>
                            <td className="cg-num font-bold text-danger-strong whitespace-nowrap">
                              {formatRp(row.amount)}
                            </td>
                            <td className="break-words">{row.reason}</td>
                            <td className="whitespace-nowrap text-text-muted">{row.processedBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'balances' && (
            <>
              <dl className="grid grid-cols-2 tablet:grid-cols-4 gap-12">
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Total saldo beredar</dt>
                  <dd className="text-xl font-bold cg-num text-accent-strong mt-4">
                    {formatRp(balanceSummary.totalOutstandingBalance)}
                  </dd>
                </div>
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Total beli paket</dt>
                  <dd className="text-xl font-bold cg-num text-text mt-4">
                    {formatRp(balanceSummary.totalPurchased)}
                  </dd>
                </div>
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Total pemakaian saldo</dt>
                  <dd className="text-xl font-bold cg-num text-text mt-4">
                    {formatRp(balanceSummary.totalUsed)}
                  </dd>
                </div>
                <div className="p-16 rounded-xl border border-border bg-surface-raised">
                  <dt className="text-xs font-medium text-text-muted">Total refund saldo</dt>
                  <dd className="text-xl font-bold cg-num text-danger-strong mt-4">
                    {formatRp(balanceSummary.totalRefunded)}
                  </dd>
                </div>
              </dl>

              {filteredBalances.length === 0 ? (
                <div className="cg-empty">
                  <p>
                    <strong>Belum ada saldo deposit pelanggan yang cocok dengan pencarian.</strong>
                  </p>
                </div>
              ) : (
                <>
                  <ul className="grid gap-12 tablet:hidden min-w-0">
                    {filteredBalances.map((row) => (
                      <li
                        key={row.customerId}
                        className="p-16 rounded-xl border border-border bg-surface-raised grid gap-8 min-w-0"
                      >
                        <div className="flex items-start justify-between gap-8 min-w-0">
                          <div className="min-w-0">
                            <strong className="text-sm text-text block break-words">
                              {row.customerName}
                            </strong>
                            {row.customerPhone && (
                              <span className="text-xs text-text-muted">{row.customerPhone}</span>
                            )}
                          </div>
                          <span
                            className={`cg-badge text-xs shrink-0 ${
                              row.currentBalance > 0 ? 'cg-badge--ok' : 'cg-badge--muted'
                            }`}
                          >
                            {row.currentBalance > 0 ? 'Ada Saldo' : 'Habis'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-8 text-xs pt-8 border-t border-border">
                          <div>
                            <span className="text-text-muted block">Beli Paket</span>
                            <span className="font-semibold text-text cg-num">
                              {formatRp(row.totalDepositPurchased)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-text-muted block">Pemakaian</span>
                            <span className="font-semibold text-text cg-num">
                              {formatRp(row.totalDepositUsed)}
                            </span>
                          </div>
                          <div>
                            <span className="text-text-muted block">Refund</span>
                            <span className="font-semibold text-danger-strong cg-num">
                              {formatRp(row.totalDepositRefunded)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-text-muted block">Sisa Saldo</span>
                            <span className="font-bold text-accent-strong cg-num text-sm">
                              {formatRp(row.currentBalance)}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden tablet:block rounded-xl border border-border bg-surface-raised overflow-x-auto min-w-0">
                    <table className="cg-data w-full">
                      <thead>
                        <tr>
                          <th>Pelanggan</th>
                          <th>No. Telepon</th>
                          <th className="cg-num">Beli Paket</th>
                          <th className="cg-num">Pemakaian</th>
                          <th className="cg-num">Refund</th>
                          <th className="cg-num">Sisa Saldo</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBalances.map((row) => (
                          <tr key={row.customerId}>
                            <td className="font-medium break-words">{row.customerName}</td>
                            <td className="text-text-muted whitespace-nowrap">
                              {row.customerPhone || '—'}
                            </td>
                            <td className="cg-num whitespace-nowrap">
                              {formatRp(row.totalDepositPurchased)}
                            </td>
                            <td className="cg-num whitespace-nowrap">
                              {formatRp(row.totalDepositUsed)}
                            </td>
                            <td className="cg-num whitespace-nowrap text-danger-strong">
                              {row.totalDepositRefunded > 0 ? formatRp(row.totalDepositRefunded) : '—'}
                            </td>
                            <td className="cg-num font-bold text-accent-strong whitespace-nowrap">
                              {formatRp(row.currentBalance)}
                            </td>
                            <td className="whitespace-nowrap">
                              <span
                                className={`cg-badge text-xs ${
                                  row.currentBalance > 0 ? 'cg-badge--ok' : 'cg-badge--muted'
                                }`}
                              >
                                {row.currentBalance > 0 ? 'Ada Saldo' : 'Habis'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
