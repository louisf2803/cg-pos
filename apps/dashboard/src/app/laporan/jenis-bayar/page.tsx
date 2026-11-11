'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { formatRp, toCsv } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

export default function PaymentTypesReportPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);
  const [q, setQ] = useState('');

  const state = useAsync(
    () => data.salesSummary(range),
    [data, range.from, range.to]
  );

  const summary = state.status === 'ready' ? state.data : null;

  const methods = useMemo(() => {
    if (!summary) return [];
    return summary.byMethod || [];
  }, [summary]);

  const totalPaymentsAmount = useMemo(
    () => methods.reduce((acc, m) => acc + m.amount, 0),
    [methods]
  );

  const totalPaymentsCount = useMemo(
    () => methods.reduce((acc, m) => acc + m.count, 0),
    [methods]
  );

  const maxAmount = useMemo(
    () => Math.max(1, ...methods.map((m) => m.amount)),
    [methods]
  );

  const filteredMethods = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return methods;
    return methods.filter((m) => m.methodName.toLowerCase().includes(needle));
  }, [methods, q]);

  const topMethod = useMemo(() => {
    if (methods.length === 0) return null;
    return methods[0];
  }, [methods]);

  function downloadCsv() {
    if (!summary || methods.length === 0) return;
    const rows: (string | number)[][] = [
      ['Metode Pembayaran', 'Jumlah Transaksi', 'Porsi Transaksi (%)', 'Total Penjualan', 'Porsi Penjualan (%)'],
    ];

    for (const m of methods) {
      const countPct = totalPaymentsCount > 0 ? ((m.count / totalPaymentsCount) * 100).toFixed(1) : '0.0';
      const amountPct = totalPaymentsAmount > 0 ? ((m.amount / totalPaymentsAmount) * 100).toFixed(1) : '0.0';
      rows.push([m.methodName, m.count, `${countPct}%`, m.amount, `${amountPct}%`]);
    }

    rows.push(['Total', totalPaymentsCount, '100%', totalPaymentsAmount, '100%']);

    downloadCsvWithHistory({
      fileName: `laporan-jenis-bayar-${range.label.replace(/\s+/g, '_')}.csv`,
      csvContent: toCsv(rows),
      reportName: 'Laporan Jenis Pembayaran',
      period: range.label,
      rowCount: methods.length,
      sourceUrl: '/laporan/jenis-bayar',
    });
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Laporan jenis pembayaran"
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : range.label}
        actions={
          <button
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={!summary || methods.length === 0}
          >
            <Download className="cg-icon" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <div className="mb-16">
        <RangePicker value={value} today={today} onChange={setValue} />
      </div>

      <label className="cg-search mb-16 block">
        <span className="cg-sr">Cari metode pembayaran</span>
        <input
          className="cg-input"
          type="search"
          placeholder="Cari metode pembayaran..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}

      {(ctx.status === 'loading' || state.status === 'loading') && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat data">
          <div className="grid gap-16 tablet:grid-cols-2 desktop:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton" style={{ height: 80 }} />
            ))}
          </div>
          <div className="cg-skeleton" style={{ height: 260 }} />
        </div>
      )}

      {state.status === 'ready' && summary && (
        <>
          <dl className="grid gap-16 tablet:grid-cols-2 desktop:grid-cols-4 mb-24">
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Total Penjualan</dt>
              <dd className="text-xl font-semibold mt-4 cg-num">{formatRp(summary.total)}</dd>
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Total Transaksi</dt>
              <dd className="text-xl font-semibold mt-4 cg-num">{summary.orderCount}</dd>
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Rata-rata per Transaksi</dt>
              <dd className="text-xl font-semibold mt-4 cg-num">{formatRp(summary.avgTicket)}</dd>
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Metode Terbanyak</dt>
              <dd className="text-xl font-semibold mt-4 truncate">
                {topMethod ? `${topMethod.methodName}` : '-'}
              </dd>
              {topMethod && (
                <span className="text-xs text-text-muted cg-num">
                  {formatRp(topMethod.amount)} (
                  {totalPaymentsAmount > 0
                    ? `${((topMethod.amount / totalPaymentsAmount) * 100).toFixed(0)}%`
                    : '0%'}
                  )
                </span>
              )}
            </div>
          </dl>

          {methods.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Belum ada transaksi pembayaran pada rentang ini.</strong>
              </p>
              <p className="text-text-muted">
                Pilih rentang tanggal lain atau catat pembayaran baru dari kasir.
              </p>
            </div>
          ) : filteredMethods.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Tidak ada metode pembayaran yang cocok dengan “{q}”.</strong>
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-lg bg-surface-raised p-16 min-w-0">
              <h2 className="text-lg font-semibold mb-12">Rincian Metode Pembayaran</h2>
              <div className="cg-data-wrap">
                <table className="cg-data" style={{ minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th>Metode Pembayaran</th>
                      <th className="cg-num">Transaksi</th>
                      <th className="cg-num">Porsi Transaksi</th>
                      <th className="cg-num">Total Penjualan</th>
                      <th className="cg-num">Porsi Nilai</th>
                      <th style={{ minWidth: 140 }}>Proporsi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMethods.map((m) => {
                      const countPct =
                        totalPaymentsCount > 0
                          ? ((m.count / totalPaymentsCount) * 100).toFixed(1)
                          : '0.0';
                      const amountPct =
                        totalPaymentsAmount > 0
                          ? ((m.amount / totalPaymentsAmount) * 100).toFixed(1)
                          : '0.0';
                      const barWidth = Math.round((m.amount / maxAmount) * 100);

                      return (
                        <tr key={m.methodName}>
                          <td className="font-medium">{m.methodName}</td>
                          <td className="cg-num">{m.count}</td>
                          <td className="cg-num text-text-muted">{countPct}%</td>
                          <td className="cg-num font-semibold">{formatRp(m.amount)}</td>
                          <td className="cg-num text-text-muted">{amountPct}%</td>
                          <td>
                            <div className="flex items-center gap-8">
                              <span
                                className="block h-[12px] w-full rounded-pill bg-accent-soft"
                                aria-hidden
                              >
                                <span
                                  className="block h-full rounded-pill bg-accent"
                                  style={{ width: `${barWidth}%` }}
                                />
                              </span>
                              <span className="text-xs text-text-muted w-[36px] text-right cg-num">
                                {amountPct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td>Total</td>
                      <td className="cg-num">{totalPaymentsCount}</td>
                      <td className="cg-num">100%</td>
                      <td className="cg-num">{formatRp(totalPaymentsAmount)}</td>
                      <td className="cg-num">100%</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
