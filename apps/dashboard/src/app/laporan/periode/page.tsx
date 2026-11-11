'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { formatRp, localParts, toCsv, type ColumnDef, type Order } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { ColumnChooser, useColumnPrefs } from '@/components/column-chooser';
import { downloadCsvWithHistory } from '@/lib/export';
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

type PeriodColKey =
  | 'period'
  | 'txCount'
  | 'txPct'
  | 'avgTicket'
  | 'subtotal'
  | 'discounts'
  | 'totalSales'
  | 'salesPct'
  | 'bar';

const PERIOD_COLUMNS: ColumnDef<PeriodColKey>[] = [
  { key: 'period', label: 'Periode', align: 'left' },
  { key: 'txCount', label: 'Jumlah transaksi', align: 'right' },
  { key: 'txPct', label: 'Porsi transaksi (%)', align: 'right' },
  { key: 'avgTicket', label: 'Rata-rata nilai', align: 'right' },
  { key: 'subtotal', label: 'Subtotal', defaultVisible: false, align: 'right' },
  { key: 'discounts', label: 'Diskon', defaultVisible: false, align: 'right' },
  { key: 'totalSales', label: 'Total penjualan', align: 'right' },
  { key: 'salesPct', label: 'Porsi nilai (%)', align: 'right' },
  { key: 'bar', label: 'Grafik proporsi', align: 'left' },
];

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

function getPeriodCsvVal(
  key: PeriodColKey,
  r: PeriodRow,
  totalCount: number,
  totalAmount: number
): string | number {
  const countPct = totalCount > 0 ? ((r.count / totalCount) * 100).toFixed(1) : '0.0';
  const amountPct = totalAmount > 0 ? ((r.total / totalAmount) * 100).toFixed(1) : '0.0';
  switch (key) {
    case 'period':
      return r.label;
    case 'txCount':
      return r.count;
    case 'txPct':
      return `${countPct}%`;
    case 'avgTicket':
      return r.avgTicket;
    case 'subtotal':
      return r.subtotal;
    case 'discounts':
      return r.discounts;
    case 'totalSales':
      return r.total;
    case 'salesPct':
      return `${amountPct}%`;
    case 'bar':
      return `${amountPct}%`;
  }
}

function getPeriodTotalCsvVal(
  key: PeriodColKey,
  totalCount: number,
  totalAmount: number,
  totalSubtotal: number,
  totalDiscounts: number
): string | number {
  switch (key) {
    case 'period':
      return 'Total';
    case 'txCount':
      return totalCount;
    case 'txPct':
      return '100%';
    case 'avgTicket':
      return totalCount > 0 ? Math.round(totalAmount / totalCount) : 0;
    case 'subtotal':
      return totalSubtotal;
    case 'discounts':
      return totalDiscounts;
    case 'totalSales':
      return totalAmount;
    case 'salesPct':
      return '100%';
    case 'bar':
      return '100%';
  }
}

function renderPeriodCell(
  key: PeriodColKey,
  r: PeriodRow,
  totalCount: number,
  totalAmount: number,
  maxAmount: number
) {
  const countPct = totalCount > 0 ? ((r.count / totalCount) * 100).toFixed(1) : '0.0';
  const amountPct = totalAmount > 0 ? ((r.total / totalAmount) * 100).toFixed(1) : '0.0';
  const barWidth = maxAmount > 0 ? Math.round((r.total / maxAmount) * 100) : 0;

  switch (key) {
    case 'period':
      return (
        <td key={key} className="font-medium whitespace-nowrap">
          {r.label}
        </td>
      );
    case 'txCount':
      return (
        <td key={key} className="cg-num">
          {r.count}
        </td>
      );
    case 'txPct':
      return (
        <td key={key} className="cg-num text-text-muted">
          {countPct}%
        </td>
      );
    case 'avgTicket':
      return (
        <td key={key} className="cg-num">
          {formatRp(r.avgTicket)}
        </td>
      );
    case 'subtotal':
      return (
        <td key={key} className="cg-num">
          {formatRp(r.subtotal)}
        </td>
      );
    case 'discounts':
      return (
        <td key={key} className="cg-num text-danger">
          {r.discounts > 0 ? `-${formatRp(r.discounts)}` : 'Rp 0'}
        </td>
      );
    case 'totalSales':
      return (
        <td key={key} className="cg-num font-semibold text-primary">
          {formatRp(r.total)}
        </td>
      );
    case 'salesPct':
      return (
        <td key={key} className="cg-num text-text-muted">
          {amountPct}%
        </td>
      );
    case 'bar':
      return (
        <td key={key} style={{ minWidth: 140 }}>
          <div className="flex items-center gap-8">
            <span className="block h-[12px] w-full rounded-pill bg-accent-soft" aria-hidden>
              <span className="block h-full rounded-pill bg-accent" style={{ width: `${barWidth}%` }} />
            </span>
            <span className="text-xs text-text-muted w-[36px] text-right cg-num">
              {amountPct}%
            </span>
          </div>
        </td>
      );
  }
}

export default function PeriodReportPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);
  const [grain, setGrain] = useState<Granularity>('harian');
  const [q, setQ] = useState('');

  const colPrefs = useColumnPrefs('laporan_periode', PERIOD_COLUMNS);

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
      if (!timeStr) continue;

      const { key, label } = getPeriodInfo(timeStr, tz, grain);
      const existing = map.get(key) || {
        label,
        count: 0,
        total: 0,
        subtotal: 0,
        discounts: 0,
      };

      existing.count += 1;
      existing.total += o.total;
      existing.subtotal += o.subtotal;
      existing.discounts += o.discountTotal;
      map.set(key, existing);
    }

    const result: PeriodRow[] = [];
    for (const [key, val] of map.entries()) {
      result.push({
        key,
        label: val.label,
        count: val.count,
        total: val.total,
        subtotal: val.subtotal,
        discounts: val.discounts,
        avgTicket: val.count > 0 ? Math.round(val.total / val.count) : 0,
      });
    }

    result.sort((a, b) => b.key.localeCompare(a.key));
    return result;
  }, [orders, tz, grain]);

  const totalAmount = useMemo(() => rows.reduce((a, r) => a + r.total, 0), [rows]);
  const totalCount = useMemo(() => rows.reduce((a, r) => a + r.count, 0), [rows]);
  const totalSubtotal = useMemo(() => rows.reduce((a, r) => a + r.subtotal, 0), [rows]);
  const totalDiscounts = useMemo(() => rows.reduce((a, r) => a + r.discounts, 0), [rows]);
  const maxAmount = useMemo(() => (rows.length > 0 ? Math.max(...rows.map((r) => r.total)) : 0), [rows]);

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
    if (rows.length === 0 || !colPrefs.hasVisible) return;
    const head = colPrefs.activeColumns.map((c) => c.label);
    const rowsCsv: (string | number)[][] = [head];

    for (const r of rows) {
      rowsCsv.push(
        colPrefs.activeColumns.map((c) => getPeriodCsvVal(c.key, r, totalCount, totalAmount))
      );
    }

    rowsCsv.push(
      colPrefs.activeColumns.map((c) =>
        getPeriodTotalCsvVal(c.key, totalCount, totalAmount, totalSubtotal, totalDiscounts)
      )
    );

    const fileName = `laporan-periode-${grain}-${range.label.replace(/\s+/g, '_')}.csv`;
    downloadCsvWithHistory({
      fileName,
      csvContent: toCsv(rowsCsv),
      reportName: `Laporan Periode (${grain})`,
      period: range.label,
      rowCount: rows.length,
      sourceUrl: `/laporan/periode`,
      params: { grain, from: range.from, to: range.to },
    });
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Laporan per periode"
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : range.label}
        actions={
          <div className="flex items-center gap-8">
            <ColumnChooser
              columns={PERIOD_COLUMNS}
              prefs={colPrefs.prefs}
              onToggle={colPrefs.toggle}
              onMoveUp={colPrefs.moveUp}
              onMoveDown={colPrefs.moveDown}
              onReset={colPrefs.reset}
            />
            <button
              className="cg-btn cg-btn--secondary"
              onClick={downloadCsv}
              disabled={!colPrefs.hasVisible || rows.length === 0}
            >
              <Download className="cg-icon" aria-hidden /> Unduh CSV
            </button>
          </div>
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

          {!colPrefs.hasVisible ? (
            <div className="cg-empty py-32">
              <p>
                <strong>Semua kolom disembunyikan.</strong>
              </p>
              <p className="text-text-muted mt-4">
                Klik tombol <strong>Atur kolom</strong> untuk memilih kolom yang ingin ditampilkan.
              </p>
            </div>
          ) : rows.length === 0 ? (
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
                      {colPrefs.activeColumns.map((c) => (
                        <th
                          key={c.key}
                          className={c.align === 'right' ? 'cg-num' : ''}
                          style={c.key === 'bar' ? { minWidth: 140 } : undefined}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => (
                      <tr key={r.key}>
                        {colPrefs.activeColumns.map((c) =>
                          renderPeriodCell(c.key, r, totalCount, totalAmount, maxAmount)
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      {colPrefs.activeColumns.map((c) => {
                        switch (c.key) {
                          case 'period':
                            return <td key={c.key}>Total</td>;
                          case 'txCount':
                            return (
                              <td key={c.key} className="cg-num">
                                {totalCount}
                              </td>
                            );
                          case 'txPct':
                            return (
                              <td key={c.key} className="cg-num">
                                100%
                              </td>
                            );
                          case 'avgTicket':
                            return (
                              <td key={c.key} className="cg-num">
                                {formatRp(
                                  totalCount > 0 ? Math.round(totalAmount / totalCount) : 0
                                )}
                              </td>
                            );
                          case 'subtotal':
                            return (
                              <td key={c.key} className="cg-num">
                                {formatRp(totalSubtotal)}
                              </td>
                            );
                          case 'discounts':
                            return (
                              <td key={c.key} className="cg-num text-danger">
                                {totalDiscounts > 0 ? `-${formatRp(totalDiscounts)}` : 'Rp 0'}
                              </td>
                            );
                          case 'totalSales':
                            return (
                              <td key={c.key} className="cg-num">
                                {formatRp(totalAmount)}
                              </td>
                            );
                          case 'salesPct':
                            return (
                              <td key={c.key} className="cg-num">
                                100%
                              </td>
                            );
                          case 'bar':
                            return <td key={c.key} />;
                        }
                      })}
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
