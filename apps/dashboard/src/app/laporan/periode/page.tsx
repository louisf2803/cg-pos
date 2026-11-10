'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { formatRp, localParts, toCsv, type Order } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

type Granularity = 'harian' | 'mingguan' | 'bulanan';

interface PeriodRow {
  key: string;
  label: string;
  count: number;
  total: number;
  subtotal: number;
  discounts: number;
  avgTicket: number;
}

function getPeriodInfo(
  isoDate: string,
  tz: string,
  grain: Granularity
): { key: string; label: string } {
  const p = localParts(new Date(isoDate), tz);
  const d = new Date(p.y, p.m - 1, p.d);

  if (grain === 'harian') {
    const key = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    const label = new Intl.DateTimeFormat('id-ID', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
    return { key, label };
  }

  if (grain === 'mingguan') {
    const dayOfWeek = (d.getDay() + 6) % 7; // 0 = Senin, 6 = Minggu
    const monday = new Date(d);
    monday.setDate(d.getDate() - dayOfWeek);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const mKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const monthFormatter = new Intl.DateTimeFormat('id-ID', { month: 'short' });
    const yearFormatter = new Intl.DateTimeFormat('id-ID', { year: 'numeric' });

    const label = `${monday.getDate()} ${monthFormatter.format(monday)} – ${sunday.getDate()} ${monthFormatter.format(sunday)} ${yearFormatter.format(sunday)}`;
    return { key: mKey, label };
  }

  // bulanan
  const key = `${p.y}-${String(p.m).padStart(2, '0')}`;
  const label = new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(p.y, p.m - 1, 1));
  return { key, label };
}

export default function PeriodReportPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);
  const [grain, setGrain] = useState<Granularity>('harian');
  const [q, setQ] = useState('');

  const state = useAsync(
    () =>
      data.listOrders({
        status: 'paid',
        from: range.from,
        to: range.to,
        by: 'closed',
        all: true,
      }),
    [data, range.from, range.to]
  );

  const orders = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.data || [];
  }, [state]);

  const rows: PeriodRow[] = useMemo(() => {
    if (orders.length === 0) return [];
    const map = new Map<
      string,
      { label: string; count: number; total: number; subtotal: number; discounts: number }
    >();

    for (const o of orders) {
      const timeStr = o.closedAt ?? o.openedAt;
      const { key, label } = getPeriodInfo(timeStr, tz, grain);
      const cur = map.get(key) ?? { label, count: 0, total: 0, subtotal: 0, discounts: 0 };
      cur.count += 1;
      cur.total += o.total;
      cur.subtotal += o.subtotal;
      cur.discounts += o.discountTotal;
      map.set(key, cur);
    }

    const list: PeriodRow[] = [];
    for (const [key, val] of map.entries()) {
      list.push({
        key,
        label: val.label,
        count: val.count,
        total: val.total,
        subtotal: val.subtotal,
        discounts: val.discounts,
        avgTicket: val.count > 0 ? Math.round(val.total / val.count) : 0,
      });
    }

    return list.sort((a, b) => a.key.localeCompare(b.key));
  }, [orders, tz, grain]);

  const totalAmount = useMemo(() => rows.reduce((acc, r) => acc + r.total, 0), [rows]);
  const totalCount = useMemo(() => rows.reduce((acc, r) => acc + r.count, 0), [rows]);
  const maxAmount = useMemo(() => Math.max(1, ...rows.map((r) => r.total)), [rows]);

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(needle) || r.key.includes(needle));
  }, [rows, q]);

  const topPeriod = useMemo(() => {
    if (rows.length === 0) return null;
    return [...rows].sort((a, b) => b.total - a.total)[0];
  }, [rows]);

  function downloadCsv() {
    if (rows.length === 0) return;
    const rowsCsv: (string | number)[][] = [
      [
        'Periode',
        'Jumlah Transaksi',
        'Porsi Transaksi (%)',
        'Rata-rata Transaksi',
        'Subtotal',
        'Diskon',
        'Total Penjualan',
        'Porsi Penjualan (%)',
      ],
    ];

    for (const r of rows) {
      const countPct = totalCount > 0 ? ((r.count / totalCount) * 100).toFixed(1) : '0.0';
      const amountPct = totalAmount > 0 ? ((r.total / totalAmount) * 100).toFixed(1) : '0.0';
      rowsCsv.push([
        r.label,
        r.count,
        `${countPct}%`,
        r.avgTicket,
        r.subtotal,
        r.discounts,
        r.total,
        `${amountPct}%`,
      ]);
    }

    rowsCsv.push([
      'Total',
      totalCount,
      '100%',
      totalCount > 0 ? Math.round(totalAmount / totalCount) : 0,
      rows.reduce((a, r) => a + r.subtotal, 0),
      rows.reduce((a, r) => a + r.discounts, 0),
      totalAmount,
      '100%',
    ]);

    const blob = new Blob([toCsv(rowsCsv)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-periode-${grain}-${range.label.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Laporan per periode"
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : range.label}
        actions={
          <button
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={rows.length === 0}
          >
            <Download className="cg-icon" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <div className="mb-16">
        <RangePicker value={value} today={today} onChange={setValue} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-12 mb-16">
        <div
          className="flex gap-4 p-4 rounded-md bg-surface-raised border border-border"
          role="tablist"
          aria-label="Pengelompokan periode"
        >
          <button
            className={`cg-btn cg-btn--sm ${grain === 'harian' ? 'cg-btn--primary' : 'cg-btn--secondary'}`}
            onClick={() => setGrain('harian')}
            role="tab"
            aria-selected={grain === 'harian'}
          >
            Harian
          </button>
          <button
            className={`cg-btn cg-btn--sm ${grain === 'mingguan' ? 'cg-btn--primary' : 'cg-btn--secondary'}`}
            onClick={() => setGrain('mingguan')}
            role="tab"
            aria-selected={grain === 'mingguan'}
          >
            Mingguan
          </button>
          <button
            className={`cg-btn cg-btn--sm ${grain === 'bulanan' ? 'cg-btn--primary' : 'cg-btn--secondary'}`}
            onClick={() => setGrain('bulanan')}
            role="tab"
            aria-selected={grain === 'bulanan'}
          >
            Bulanan
          </button>
        </div>

        <label className="cg-search block max-w-xs w-full">
          <span className="cg-sr">Cari periode</span>
          <input
            className="cg-input"
            type="search"
            placeholder="Cari periode..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

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
              <dt className="text-sm text-text-muted">Total Transaksi</dt>
              <dd className="text-xl font-semibold mt-4 cg-num">{totalCount}</dd>
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Rata-rata per Transaksi</dt>
              <dd className="text-xl font-semibold mt-4 cg-num">
                {formatRp(totalCount > 0 ? Math.round(totalAmount / totalCount) : 0)}
              </dd>
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Periode Tertinggi</dt>
              <dd className="text-xl font-semibold mt-4 truncate">
                {topPeriod ? topPeriod.label : '-'}
              </dd>
              {topPeriod && (
                <span className="text-xs text-text-muted cg-num">
                  {formatRp(topPeriod.total)} (
                  {totalAmount > 0
                    ? `${((topPeriod.total / totalAmount) * 100).toFixed(0)}%`
                    : '0%'}
                  )
                </span>
              )}
            </div>
          </dl>

          {rows.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Belum ada transaksi penjualan pada rentang ini.</strong>
              </p>
              <p className="text-text-muted">
                Pilih rentang tanggal lain atau catat pesanan baru dari kasir.
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Tidak ada periode yang cocok dengan “{q}”.</strong>
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-lg bg-surface-raised p-16 min-w-0">
              <h2 className="text-lg font-semibold mb-12">
                Rincian Penjualan per {grain === 'harian' ? 'Hari' : grain === 'mingguan' ? 'Minggu' : 'Bulan'}
              </h2>
              <div className="cg-data-wrap">
                <table className="cg-data" style={{ minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th>Periode</th>
                      <th className="cg-num">Transaksi</th>
                      <th className="cg-num">Porsi Transaksi</th>
                      <th className="cg-num">Rata-rata Nilai</th>
                      <th className="cg-num">Total Penjualan</th>
                      <th className="cg-num">Porsi Nilai</th>
                      <th style={{ minWidth: 140 }}>Proporsi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => {
                      const countPct =
                        totalCount > 0 ? ((r.count / totalCount) * 100).toFixed(1) : '0.0';
                      const amountPct =
                        totalAmount > 0 ? ((r.total / totalAmount) * 100).toFixed(1) : '0.0';
                      const barWidth = Math.round((r.total / maxAmount) * 100);

                      return (
                        <tr key={r.key}>
                          <td className="font-medium">{r.label}</td>
                          <td className="cg-num">{r.count}</td>
                          <td className="cg-num text-text-muted">{countPct}%</td>
                          <td className="cg-num">{formatRp(r.avgTicket)}</td>
                          <td className="cg-num font-semibold">{formatRp(r.total)}</td>
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
