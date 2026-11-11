'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { formatRp, orderTypeLabel, toCsv, type Order } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

interface OrderTypeGroup {
  type: string;
  label: string;
  count: number;
  subtotal: number;
  discounts: number;
  total: number;
  avgTicket: number;
}

export default function OrderTypesReportPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);
  const [q, setQ] = useState('');

  const state = useAsync(async () => {
    const [orders, summary] = await Promise.all([
      data.listOrders({
        status: 'paid',
        from: range.from,
        to: range.to,
        by: 'closed',
        all: true,
      }),
      data.salesSummary(range),
    ]);
    return { orders, summary };
  }, [data, range.from, range.to]);

  const payload = state.status === 'ready' ? state.data : null;
  const orders = useMemo(() => payload?.orders || [], [payload]);
  const summary = payload?.summary || null;

  const groups: OrderTypeGroup[] = useMemo(() => {
    if (orders.length === 0) return [];
    const map = new Map<
      string,
      { count: number; subtotal: number; discounts: number; total: number }
    >();

    for (const o of orders) {
      const cur = map.get(o.type) ?? { count: 0, subtotal: 0, discounts: 0, total: 0 };
      cur.count += 1;
      cur.subtotal += o.subtotal;
      cur.discounts += o.discountTotal;
      cur.total += o.total;
      map.set(o.type, cur);
    }

    const list: OrderTypeGroup[] = [];
    for (const [type, val] of map.entries()) {
      list.push({
        type,
        label: orderTypeLabel(type),
        count: val.count,
        subtotal: val.subtotal,
        discounts: val.discounts,
        total: val.total,
        avgTicket: val.count > 0 ? Math.round(val.total / val.count) : 0,
      });
    }

    return list.sort((a, b) => b.total - a.total);
  }, [orders]);

  const totalAmount = useMemo(
    () => groups.reduce((acc, g) => acc + g.total, 0),
    [groups]
  );
  const totalCount = useMemo(
    () => groups.reduce((acc, g) => acc + g.count, 0),
    [groups]
  );
  const maxAmount = useMemo(
    () => Math.max(1, ...groups.map((g) => g.total)),
    [groups]
  );

  const filteredGroups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter(
      (g) =>
        g.label.toLowerCase().includes(needle) ||
        g.type.toLowerCase().includes(needle)
    );
  }, [groups, q]);

  const topGroup = useMemo(() => {
    if (groups.length === 0) return null;
    return groups[0];
  }, [groups]);

  function downloadCsv() {
    if (groups.length === 0) return;
    const rows: (string | number)[][] = [
      [
        'Jenis Pesanan',
        'Jumlah Pesanan',
        'Porsi Pesanan (%)',
        'Rata-rata Nilai',
        'Subtotal',
        'Diskon',
        'Total Penjualan',
        'Porsi Penjualan (%)',
      ],
    ];

    for (const g of groups) {
      const countPct = totalCount > 0 ? ((g.count / totalCount) * 100).toFixed(1) : '0.0';
      const amountPct = totalAmount > 0 ? ((g.total / totalAmount) * 100).toFixed(1) : '0.0';
      rows.push([
        g.label,
        g.count,
        `${countPct}%`,
        g.avgTicket,
        g.subtotal,
        g.discounts,
        g.total,
        `${amountPct}%`,
      ]);
    }

    rows.push([
      'Total',
      totalCount,
      '100%',
      totalCount > 0 ? Math.round(totalAmount / totalCount) : 0,
      groups.reduce((a, g) => a + g.subtotal, 0),
      groups.reduce((a, g) => a + g.discounts, 0),
      totalAmount,
      '100%',
    ]);

    downloadCsvWithHistory({
      fileName: `laporan-jenis-order-${range.label.replace(/\s+/g, '_')}.csv`,
      csvContent: toCsv(rows),
      reportName: 'Laporan Jenis Pesanan',
      period: range.label,
      rowCount: groups.length,
      sourceUrl: '/laporan/jenis-order',
    });
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Laporan jenis pesanan"
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : range.label}
        actions={
          <button
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={groups.length === 0}
          >
            <Download className="cg-icon" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <div className="mb-16">
        <RangePicker value={value} today={today} onChange={setValue} />
      </div>

      <label className="cg-search mb-16 block">
        <span className="cg-sr">Cari jenis pesanan</span>
        <input
          className="cg-input"
          type="search"
          placeholder="Cari jenis pesanan..."
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

      {state.status === 'ready' && (
        <>
          <dl className="grid gap-16 tablet:grid-cols-2 desktop:grid-cols-4 mb-24">
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Total Penjualan</dt>
              <dd className="text-xl font-semibold mt-4 cg-num">{formatRp(totalAmount)}</dd>
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Total Pesanan</dt>
              <dd className="text-xl font-semibold mt-4 cg-num">{totalCount}</dd>
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Rata-rata per Pesanan</dt>
              <dd className="text-xl font-semibold mt-4 cg-num">
                {formatRp(totalCount > 0 ? Math.round(totalAmount / totalCount) : 0)}
              </dd>
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Jenis Terbanyak</dt>
              <dd className="text-xl font-semibold mt-4 truncate">
                {topGroup ? topGroup.label : '-'}
              </dd>
              {topGroup && (
                <span className="text-xs text-text-muted cg-num">
                  {formatRp(topGroup.total)} (
                  {totalAmount > 0
                    ? `${((topGroup.total / totalAmount) * 100).toFixed(0)}%`
                    : '0%'}
                  )
                </span>
              )}
            </div>
          </dl>

          {groups.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Belum ada pesanan pada rentang ini.</strong>
              </p>
              <p className="text-text-muted">
                Pilih rentang tanggal lain atau buat transaksi baru dari kasir.
              </p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Tidak ada jenis pesanan yang cocok dengan “{q}”.</strong>
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-lg bg-surface-raised p-16 min-w-0">
              <h2 className="text-lg font-semibold mb-12">Rincian Jenis Pesanan</h2>
              <div className="cg-data-wrap">
                <table className="cg-data" style={{ minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th>Jenis Pesanan</th>
                      <th className="cg-num">Pesanan</th>
                      <th className="cg-num">Porsi Pesanan</th>
                      <th className="cg-num">Rata-rata Nilai</th>
                      <th className="cg-num">Total Penjualan</th>
                      <th className="cg-num">Porsi Nilai</th>
                      <th style={{ minWidth: 140 }}>Proporsi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGroups.map((g) => {
                      const countPct =
                        totalCount > 0 ? ((g.count / totalCount) * 100).toFixed(1) : '0.0';
                      const amountPct =
                        totalAmount > 0 ? ((g.total / totalAmount) * 100).toFixed(1) : '0.0';
                      const barWidth = Math.round((g.total / maxAmount) * 100);

                      return (
                        <tr key={g.type}>
                          <td className="font-medium">{g.label}</td>
                          <td className="cg-num">{g.count}</td>
                          <td className="cg-num text-text-muted">{countPct}%</td>
                          <td className="cg-num">{formatRp(g.avgTicket)}</td>
                          <td className="cg-num font-semibold">{formatRp(g.total)}</td>
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
                      <td className="cg-num">{totalCount}</td>
                      <td className="cg-num">100%</td>
                      <td className="cg-num">
                        {formatRp(totalCount > 0 ? Math.round(totalAmount / totalCount) : 0)}
                      </td>
                      <td className="cg-num">{formatRp(totalAmount)}</td>
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
