'use client';

import { useMemo, useState } from 'react';
import { Download, Flame } from 'lucide-react';
import { formatRp, localDateKey, localParts, toCsv, type Order } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker, type RangeValue } from '@/components/range-picker';
import { dateRange, presetRange, type Preset } from '@/lib/range';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';

interface DayDef {
  dayOfWeek: number; // 0 = Minggu, 1 = Senin, ...
  name: string;
  short: string;
}

const DAYS: DayDef[] = [
  { dayOfWeek: 1, name: 'Senin', short: 'Sen' },
  { dayOfWeek: 2, name: 'Selasa', short: 'Sel' },
  { dayOfWeek: 3, name: 'Rabu', short: 'Rab' },
  { dayOfWeek: 4, name: 'Kamis', short: 'Kam' },
  { dayOfWeek: 5, name: 'Jumat', short: 'Jum' },
  { dayOfWeek: 6, name: 'Sabtu', short: 'Sab' },
  { dayOfWeek: 0, name: 'Minggu', short: 'Min' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getHeatmapStyle(count: number, maxCount: number): { background: string; color: string } {
  if (count === 0 || maxCount === 0) {
    return { background: 'var(--color-surface)', color: 'var(--color-text-muted)' };
  }
  const ratio = count / maxCount;
  if (ratio < 0.25) {
    return { background: 'var(--color-accent-soft)', color: 'var(--color-text)' };
  }
  if (ratio < 0.5) {
    return {
      background: 'color-mix(in srgb, var(--color-accent) 45%, var(--color-accent-soft))',
      color: 'var(--color-on-accent)',
    };
  }
  if (ratio < 0.75) {
    return {
      background: 'color-mix(in srgb, var(--color-accent) 75%, var(--color-accent-soft))',
      color: 'var(--color-on-accent)',
    };
  }
  return { background: 'var(--color-accent)', color: 'var(--color-on-accent)' };
}

export default function PeakHoursReportPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';

  // Default to 30 days as requested in prompt A5
  const [value, setValue] = useState<RangeValue>({ preset: '30d', from: '', to: '' });
  const [metric, setMetric] = useState<'count' | 'amount'>('count');

  const today = useMemo(() => localDateKey(new Date(), tz), [tz]);

  const range = useMemo(() => {
    if (value.preset === 'custom') {
      return value.from && value.to
        ? dateRange(tz, value.from, value.to)
        : presetRange(tz, '30d');
    }
    return presetRange(tz, value.preset as Exclude<Preset, 'custom'>);
  }, [value, tz]);

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

  // Aggregate day x hour matrix
  const matrix = useMemo(() => {
    // grid[dayOfWeek][hour] = { count, total }
    const grid: Record<number, Record<number, { count: number; total: number }>> = {};
    for (const d of DAYS) {
      grid[d.dayOfWeek] = {};
      for (const h of HOURS) {
        grid[d.dayOfWeek]![h] = { count: 0, total: 0 };
      }
    }

    for (const o of orders) {
      const timeStr = o.closedAt ?? o.openedAt;
      const p = localParts(new Date(timeStr), tz);
      // UTC day calculation for the local date components
      const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
      const dow = dt.getUTCDay();

      if (grid[dow] && grid[dow]![p.h]) {
        grid[dow]![p.h]!.count += 1;
        grid[dow]![p.h]!.total += o.total;
      }
    }

    return grid;
  }, [orders, tz]);

  // Hour-level aggregation across all days
  const hourlyTotals = useMemo(() => {
    const hours = HOURS.map((h) => ({ hour: h, count: 0, total: 0 }));
    for (const d of DAYS) {
      for (const h of HOURS) {
        const cell = matrix[d.dayOfWeek]?.[h];
        if (cell) {
          hours[h]!.count += cell.count;
          hours[h]!.total += cell.total;
        }
      }
    }
    return hours;
  }, [matrix]);

  // Day-level aggregation across all hours
  const dailyTotals = useMemo(() => {
    return DAYS.map((d) => {
      let count = 0;
      let total = 0;
      for (const h of HOURS) {
        const cell = matrix[d.dayOfWeek]?.[h];
        if (cell) {
          count += cell.count;
          total += cell.total;
        }
      }
      return { ...d, count, total };
    });
  }, [matrix, DAYS]);

  // Top 3 peak hours
  const top3Hours = useMemo(() => {
    return [...hourlyTotals]
      .filter((h) => (metric === 'count' ? h.count > 0 : h.total > 0))
      .sort((a, b) => (metric === 'count' ? b.count - a.count : b.total - a.total))
      .slice(0, 3);
  }, [hourlyTotals, metric]);

  // Maximum value for heatmap intensity
  const maxCellValue = useMemo(() => {
    let max = 0;
    for (const d of DAYS) {
      for (const h of HOURS) {
        const cell = matrix[d.dayOfWeek]?.[h];
        if (cell) {
          const val = metric === 'count' ? cell.count : cell.total;
          if (val > max) max = val;
        }
      }
    }
    return Math.max(1, max);
  }, [matrix, metric, DAYS]);

  const totalOrdersCount = useMemo(
    () => orders.length,
    [orders]
  );
  const totalSalesAmount = useMemo(
    () => orders.reduce((sum, o) => sum + o.total, 0),
    [orders]
  );

  const busiestDay = useMemo(() => {
    if (orders.length === 0) return null;
    return [...dailyTotals].sort((a, b) => b.count - a.count)[0];
  }, [dailyTotals, orders]);

  function downloadCsv() {
    if (orders.length === 0) return;
    const rows: (string | number)[][] = [
      ['Hari', 'Jam', 'Pukul', 'Jumlah Transaksi', 'Total Penjualan'],
    ];

    for (const d of DAYS) {
      for (const h of HOURS) {
        const cell = matrix[d.dayOfWeek]?.[h];
        const count = cell?.count ?? 0;
        const total = cell?.total ?? 0;
        const timeLabel = `${String(h).padStart(2, '0')}:00 - ${String((h + 1) % 24).padStart(2, '0')}:00`;
        rows.push([d.name, h, timeLabel, count, total]);
      }
    }

    downloadCsvWithHistory({
      fileName: `analisa-jam-ramai-${range.label.replace(/\s+/g, '_')}.csv`,
      csvContent: toCsv(rows),
      reportName: 'Analisa Jam Ramai',
      period: range.label,
      rowCount: rows.length - 1,
      sourceUrl: '/laporan/jam-ramai',
    });
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Analisa jam ramai"
        subtitle={
          ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : range.label
        }
        actions={
          <button
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={orders.length === 0}
          >
            <Download className="cg-icon" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <div className="mb-16">
        <RangePicker
          value={value.preset === 'custom' ? value : { ...value, from: range.label.slice(0, 10), to: range.label.slice(-10) }}
          today={today}
          onChange={setValue}
        />
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
          <div className="cg-skeleton" style={{ height: 320 }} />
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <dl className="grid gap-16 tablet:grid-cols-2 desktop:grid-cols-4 mb-24">
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Total Transaksi</dt>
              <dd className="text-xl font-semibold mt-4 cg-num">{totalOrdersCount}</dd>
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Total Penjualan</dt>
              <dd className="text-xl font-semibold mt-4 cg-num">{formatRp(totalSalesAmount)}</dd>
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Jam Paling Ramai</dt>
              <dd className="text-xl font-semibold mt-4 truncate">
                {top3Hours[0]
                  ? `${String(top3Hours[0].hour).padStart(2, '0')}:00 – ${String((top3Hours[0].hour + 1) % 24).padStart(2, '0')}:00`
                  : '-'}
              </dd>
              {top3Hours[0] && (
                <span className="text-xs text-text-muted cg-num">
                  {top3Hours[0].count} transaksi · {formatRp(top3Hours[0].total)}
                </span>
              )}
            </div>
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <dt className="text-sm text-text-muted">Hari Teramai</dt>
              <dd className="text-xl font-semibold mt-4 truncate">
                {busiestDay ? busiestDay.name : '-'}
              </dd>
              {busiestDay && (
                <span className="text-xs text-text-muted cg-num">
                  {busiestDay.count} transaksi (
                  {totalOrdersCount > 0
                    ? `${((busiestDay.count / totalOrdersCount) * 100).toFixed(0)}%`
                    : '0%'}
                  )
                </span>
              )}
            </div>
          </dl>

          {orders.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Belum ada transaksi penjualan pada rentang 30 hari ini.</strong>
              </p>
              <p className="text-text-muted">
                Pilih rentang tanggal lain atau catat pesanan baru dari kasir.
              </p>
            </div>
          ) : (
            <>
              {/* Daftar 3 Jam Teramai */}
              <section className="border border-border rounded-lg bg-surface-raised p-16 mb-24 min-w-0">
                <div className="flex items-center gap-8 mb-16">
                  <Flame className="cg-icon text-accent" aria-hidden />
                  <h2 className="text-lg font-semibold">3 Jam Teramai</h2>
                </div>

                <div className="grid gap-16 tablet:grid-cols-3">
                  {top3Hours.map((item, idx) => {
                    const startH = String(item.hour).padStart(2, '0');
                    const endH = String((item.hour + 1) % 24).padStart(2, '0');
                    const countPct =
                      totalOrdersCount > 0
                        ? ((item.count / totalOrdersCount) * 100).toFixed(1)
                        : '0.0';
                    const amountPct =
                      totalSalesAmount > 0
                        ? ((item.total / totalSalesAmount) * 100).toFixed(1)
                        : '0.0';

                    return (
                      <div
                        key={item.hour}
                        className="p-16 border border-border rounded-lg bg-surface flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-8">
                            <span className="cg-badge cg-badge--info font-bold">
                              #{idx + 1} Teramai
                            </span>
                            <span className="text-xs text-text-muted font-medium">
                              {countPct}% pesanan
                            </span>
                          </div>
                          <div className="text-xl font-bold cg-num mb-4">
                            {startH}:00 – {endH}:00
                          </div>
                          <div className="text-sm text-text-muted">
                            <span className="font-semibold text-text">{item.count} transaksi</span>{' '}
                            · <span className="cg-num">{formatRp(item.total)}</span> ({amountPct}%)
                          </div>
                        </div>

                        <div className="mt-12">
                          <span
                            className="block h-[8px] w-full rounded-pill bg-accent-soft"
                            aria-hidden
                          >
                            <span
                              className="block h-full rounded-pill bg-accent"
                              style={{
                                width: `${Math.round((item.count / (top3Hours[0]?.count || 1)) * 100)}%`,
                              }}
                            />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Peta Panas Hari x Jam */}
              <section className="border border-border rounded-lg bg-surface-raised p-16 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-12 mb-16">
                  <div>
                    <h2 className="text-lg font-semibold">Peta Panas Aktivitas (Hari × Jam)</h2>
                    <p className="text-xs text-text-muted mt-2">
                      Semakin pekat warna, semakin ramai aktivitas penjualan pada jam tersebut.
                    </p>
                  </div>

                  <div className="flex gap-4 p-4 rounded-md bg-surface border border-border" role="tablist" aria-label="Tampilan metrik">
                    <button
                      className={`cg-btn cg-btn--sm ${metric === 'count' ? 'cg-btn--primary' : 'cg-btn--secondary'}`}
                      onClick={() => setMetric('count')}
                      role="tab"
                      aria-selected={metric === 'count'}
                    >
                      Jumlah Transaksi
                    </button>
                    <button
                      className={`cg-btn cg-btn--sm ${metric === 'amount' ? 'cg-btn--primary' : 'cg-btn--secondary'}`}
                      onClick={() => setMetric('amount')}
                      role="tab"
                      aria-selected={metric === 'amount'}
                    >
                      Nilai Penjualan
                    </button>
                  </div>
                </div>

                {/* Heatmap Legend */}
                <div className="flex flex-wrap items-center gap-12 text-xs text-text-muted mb-16">
                  <span>Intensitas:</span>
                  <div className="flex items-center gap-4">
                    <span
                      className="inline-block w-16 h-16 rounded border border-border"
                      style={{ background: 'var(--color-surface)' }}
                      aria-hidden
                    />
                    <span>0</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className="inline-block w-16 h-16 rounded"
                      style={{ background: 'var(--color-accent-soft)' }}
                      aria-hidden
                    />
                    <span>Rendah</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className="inline-block w-16 h-16 rounded"
                      style={{
                        background:
                          'color-mix(in srgb, var(--color-accent) 45%, var(--color-accent-soft))',
                      }}
                      aria-hidden
                    />
                    <span>Sedang</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className="inline-block w-16 h-16 rounded"
                      style={{
                        background:
                          'color-mix(in srgb, var(--color-accent) 75%, var(--color-accent-soft))',
                      }}
                      aria-hidden
                    />
                    <span>Tinggi</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className="inline-block w-16 h-16 rounded"
                      style={{ background: 'var(--color-accent)' }}
                      aria-hidden
                    />
                    <span>Paling Ramai</span>
                  </div>
                </div>

                <div className="cg-data-wrap">
                  <table
                    className="cg-data text-center text-xs"
                    style={{ minWidth: 920 }}
                    aria-label="Peta panas transaksi per hari dan jam"
                  >
                    <thead>
                      <tr>
                        <th className="text-left" style={{ width: 80, position: 'sticky', left: 0, background: 'var(--color-surface-raised)', zIndex: 1 }}>
                          Hari
                        </th>
                        {HOURS.map((h) => (
                          <th key={h} className="text-center px-4" style={{ minWidth: 34 }}>
                            {String(h).padStart(2, '0')}
                          </th>
                        ))}
                        <th className="text-right font-semibold" style={{ minWidth: 80 }}>
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((d) => {
                        const dayRowTotal = dailyTotals.find((dt) => dt.dayOfWeek === d.dayOfWeek);

                        return (
                          <tr key={d.dayOfWeek}>
                            <th
                              scope="row"
                              className="text-left font-medium whitespace-nowrap"
                              style={{ position: 'sticky', left: 0, background: 'var(--color-surface-raised)', zIndex: 1 }}
                            >
                              {d.name}
                            </th>
                            {HOURS.map((h) => {
                              const cell = matrix[d.dayOfWeek]?.[h];
                              const count = cell?.count ?? 0;
                              const total = cell?.total ?? 0;
                              const val = metric === 'count' ? count : total;
                              const style = getHeatmapStyle(val, maxCellValue);

                              const cellText =
                                count === 0
                                  ? '-'
                                  : metric === 'count'
                                    ? String(count)
                                    : count;

                              return (
                                <td
                                  key={h}
                                  className="p-4 border border-border"
                                  style={{
                                    ...style,
                                    fontWeight: count > 0 ? 600 : 400,
                                  }}
                                  aria-label={`${d.name} ${String(h).padStart(2, '0')}.00: ${count} transaksi`}
                                  title={`${d.name} ${String(h).padStart(2, '0')}:00 – ${String((h + 1) % 24).padStart(2, '0')}:00: ${count} transaksi (${formatRp(total)})`}
                                >
                                  {cellText}
                                </td>
                              );
                            })}
                            <td className="text-right font-semibold cg-num whitespace-nowrap bg-surface">
                              {metric === 'count'
                                ? dayRowTotal?.count ?? 0
                                : formatRp(dayRowTotal?.total ?? 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold bg-surface">
                        <th
                          scope="row"
                          className="text-left"
                          style={{ position: 'sticky', left: 0, background: 'var(--color-surface)', zIndex: 1 }}
                        >
                          Total Jam
                        </th>
                        {HOURS.map((h) => {
                          const hTot = hourlyTotals[h];
                          return (
                            <td key={h} className="text-center p-4 cg-num">
                              {metric === 'count'
                                ? (hTot?.count ? hTot.count : '-')
                                : (hTot?.count ? hTot.count : '-')}
                            </td>
                          );
                        })}
                        <td className="text-right cg-num whitespace-nowrap">
                          {metric === 'count'
                            ? totalOrdersCount
                            : formatRp(totalSalesAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
