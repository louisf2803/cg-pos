'use client';

import { useMemo, useState } from 'react';
import { Download, RefreshCw, Search, Tag } from 'lucide-react';
import {
  PRICE_CHANGE_ORDER_STATUS_LABEL,
  filterPriceChanges,
  formatRp,
  getActiveColumns,
  hasVisibleColumns,
  splitVoidPriceChanges,
  summarizePriceChanges,
  toCsv,
  type ColumnDef,
  type Order,
  type PriceChange,
  type PriceChangeDirection,
} from '@cgpos/shared';
import { ColumnChooser, useColumnPrefs } from '@/components/column-chooser';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

type PriceColKey =
  | 'orderNumber'
  | 'time'
  | 'cashier'
  | 'product'
  | 'qty'
  | 'basePrice'
  | 'unitPrice'
  | 'diff'
  | 'diffPct'
  | 'lineImpact'
  | 'orderStatus'
  | 'reason';

const PRICE_CHANGE_COLUMNS: ColumnDef<PriceColKey>[] = [
  { key: 'orderNumber', label: 'Nomor pesanan', align: 'left' },
  { key: 'time', label: 'Waktu', align: 'left' },
  { key: 'cashier', label: 'Kasir', align: 'left' },
  { key: 'product', label: 'Produk', align: 'left' },
  { key: 'qty', label: 'Jumlah', align: 'right' },
  { key: 'basePrice', label: 'Harga dasar', align: 'right' },
  { key: 'unitPrice', label: 'Harga jual', align: 'right' },
  { key: 'diff', label: 'Selisih / unit', align: 'right' },
  { key: 'diffPct', label: 'Persen (%)', align: 'right' },
  { key: 'lineImpact', label: 'Dampak', align: 'right' },
  { key: 'orderStatus', label: 'Status pesanan', align: 'left' },
  { key: 'reason', label: 'Alasan / Catatan', align: 'left' },
];

const STATUS_BADGE: Record<Order['status'], string> = {
  open: 'cg-badge--warn',
  partially_paid: 'cg-badge--warn',
  paid: 'cg-badge--ok',
  void: 'cg-badge--danger',
};

function fmtDateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function fmtSignedPct(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

function renderCell(key: PriceColKey, row: PriceChange, tz: string) {
  switch (key) {
    case 'orderNumber':
      return (
        <td key={key} className="whitespace-nowrap font-medium">
          {row.orderNumber}
        </td>
      );
    case 'time':
      return (
        <td key={key} className="whitespace-nowrap text-xs text-text-muted">
          {fmtDateTime(row.at, tz)}
        </td>
      );
    case 'cashier':
      return (
        <td key={key} className="break-words">
          {row.cashierName}
        </td>
      );
    case 'product':
      return (
        <td key={key} className="break-words max-w-[220px]">
          {row.itemName}
        </td>
      );
    case 'qty':
      return (
        <td key={key} className="cg-num whitespace-nowrap">
          {row.qty}
        </td>
      );
    case 'basePrice':
      return (
        <td key={key} className="cg-num whitespace-nowrap">
          {formatRp(row.basePrice)}
        </td>
      );
    case 'unitPrice':
      return (
        <td key={key} className="cg-num whitespace-nowrap font-medium">
          {formatRp(row.unitPrice)}
        </td>
      );
    case 'diff':
      return (
        <td
          key={key}
          className={`cg-num whitespace-nowrap ${row.diff < 0 ? 'text-danger' : 'text-accent-strong'}`}
        >
          {row.diff > 0 ? `+${formatRp(row.diff)}` : formatRp(row.diff)}
        </td>
      );
    case 'diffPct':
      return (
        <td
          key={key}
          className={`cg-num whitespace-nowrap ${row.diff < 0 ? 'text-danger' : 'text-accent-strong'}`}
        >
          {fmtSignedPct(row.diffPct)}
        </td>
      );
    case 'lineImpact':
      return (
        <td
          key={key}
          className={`cg-num whitespace-nowrap font-semibold ${row.lineImpact < 0 ? 'text-danger' : 'text-accent-strong'}`}
        >
          {row.lineImpact > 0 ? `+${formatRp(row.lineImpact)}` : formatRp(row.lineImpact)}
        </td>
      );
    case 'orderStatus':
      return (
        <td key={key} className="whitespace-nowrap">
          <span className={`cg-badge ${STATUS_BADGE[row.orderStatus]}`}>
            {PRICE_CHANGE_ORDER_STATUS_LABEL[row.orderStatus]}
          </span>
        </td>
      );
    case 'reason':
      return (
        <td key={key} className="break-words max-w-[200px] text-xs text-text-muted">
          {row.reason || '—'}
        </td>
      );
  }
}

export default function LaporanHargaDiubahPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);

  const [cashierFilter, setCashierFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState<PriceChangeDirection>('all');
  const [search, setSearch] = useState('');

  const colPrefs = useColumnPrefs('laporan_harga_diubah', PRICE_CHANGE_COLUMNS);

  const state = useAsync(async () => {
    if (ctx.status !== 'ready') return null;
    const [changes, employees] = await Promise.all([
      data.listPriceChanges({ from: range.from, to: range.to }),
      data.listManagedEmployees(),
    ]);
    return { changes, employees };
  }, [data, ctx.status, range.from, range.to]);

  const payload = state.status === 'ready' ? state.data : null;

  const cashierOptions = useMemo(() => {
    const map = new Map<string, string>();
    if (payload) {
      for (const emp of payload.employees) map.set(emp.id, emp.name);
      for (const ch of payload.changes) {
        if (!map.has(ch.cashierId)) map.set(ch.cashierId, ch.cashierName);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [payload]);

  const filtered = useMemo(() => {
    if (!payload) return [];
    return filterPriceChanges(payload.changes, {
      cashierId: cashierFilter || undefined,
      direction: directionFilter,
      search,
    });
  }, [payload, cashierFilter, directionFilter, search]);

  const { active: activeRows, voidCount } = useMemo(() => splitVoidPriceChanges(filtered), [filtered]);
  const summary = useMemo(() => summarizePriceChanges(activeRows), [activeRows]);

  const activeCols = useMemo(
    () => getActiveColumns(PRICE_CHANGE_COLUMNS, colPrefs.prefs),
    [colPrefs.prefs],
  );
  const hasCols = hasVisibleColumns(colPrefs.prefs);

  function handleDownloadCsv() {
    if (filtered.length === 0 || !hasCols) return;
    const headers = activeCols.map((c) => c.label);
    const body = filtered.map((row) =>
      activeCols.map((c) => {
        switch (c.key) {
          case 'orderNumber':
            return row.orderNumber;
          case 'time':
            return fmtDateTime(row.at, tz);
          case 'cashier':
            return row.cashierName;
          case 'product':
            return row.itemName;
          case 'qty':
            return row.qty;
          case 'basePrice':
            return row.basePrice;
          case 'unitPrice':
            return row.unitPrice;
          case 'diff':
            return row.diff;
          case 'diffPct':
            return row.diffPct;
          case 'lineImpact':
            return row.lineImpact;
          case 'orderStatus':
            return PRICE_CHANGE_ORDER_STATUS_LABEL[row.orderStatus];
          case 'reason':
            return row.reason ?? '';
        }
      }),
    );
    const csv = toCsv([headers, ...body]);
    downloadCsvWithHistory({
      fileName: `laporan-perubahan-harga-${today}.csv`,
      csvContent: csv,
      reportName: 'Perubahan harga kasir',
      period: value.from === value.to ? value.from : `${value.from} – ${value.to}`,
      rowCount: filtered.length,
      sourceUrl: '/laporan/harga-diubah',
    });
  }

  return (
    <div className="grid gap-16 min-w-0">
      <PageHeader
        title="Laporan perubahan harga kasir"
        subtitle="Pantau item yang harga jualnya diubah kasir dibanding harga dasar, beserta dampak pendapatan dan rincian per kasir."
        actions={
          <div className="flex flex-wrap gap-8">
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              onClick={() => state.reload()}
              aria-label="Muat ulang laporan"
            >
              <RefreshCw className="cg-icon cg-icon--xs" aria-hidden />
              <span>Muat ulang</span>
            </button>
            <ColumnChooser
              columns={PRICE_CHANGE_COLUMNS}
              prefs={colPrefs.prefs}
              onToggle={colPrefs.toggle}
              onMoveUp={colPrefs.moveUp}
              onMoveDown={colPrefs.moveDown}
              onReset={colPrefs.reset}
            />
            <button
              type="button"
              className="cg-btn cg-btn--primary cg-btn--sm"
              disabled={filtered.length === 0 || !hasCols}
              onClick={handleDownloadCsv}
            >
              <Download className="cg-icon cg-icon--xs" aria-hidden />
              <span>Unduh CSV</span>
            </button>
          </div>
        }
      />

      <div className="cg-card p-16 grid gap-12 min-w-0">
        <RangePicker value={value} onChange={setValue} today={today} />

        <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12 min-w-0">
          <div className="cg-field min-w-0">
            <label className="cg-label" htmlFor="harga-diubah-cari">
              Cari pesanan atau produk
            </label>
            <div className="cg-search m-0">
              <Search className="cg-icon cg-icon--sm" aria-hidden />
              <input
                id="harga-diubah-cari"
                type="search"
                className="cg-input w-full"
                placeholder="Nomor pesanan, produk, kasir..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="cg-field min-w-0">
            <label className="cg-label" htmlFor="harga-diubah-kasir">
              Kasir
            </label>
            <select
              id="harga-diubah-kasir"
              className="cg-input"
              value={cashierFilter}
              onChange={(e) => setCashierFilter(e.target.value)}
            >
              <option value="">Semua kasir</option>
              {cashierOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="cg-field min-w-0">
            <label className="cg-label" htmlFor="harga-diubah-arah">
              Arah perubahan harga
            </label>
            <select
              id="harga-diubah-arah"
              className="cg-input"
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as PriceChangeDirection)}
            >
              <option value="all">Semua perubahan</option>
              <option value="lowered">Diturunkan</option>
              <option value="raised">Dinaikkan</option>
            </select>
          </div>
        </div>
      </div>

      {(ctx.status === 'loading' || state.status === 'loading') && (
        <div className="grid gap-12" aria-busy="true" aria-label="Memuat laporan perubahan harga">
          <div className="cg-skeleton h-[84px]" />
          <div className="cg-skeleton h-[260px]" />
        </div>
      )}

      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}

      {state.status === 'ready' && payload && (
        <>
          <div className="grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-12 min-w-0">
            <div className="cg-card p-16 min-w-0">
              <span className="text-xs text-text-muted">Jumlah perubahan</span>
              <strong className="block text-xl cg-num mt-4" data-testid="kpi-price-count">
                {summary.count}
              </strong>
              {voidCount > 0 && (
                <span className="text-xs text-text-muted block mt-4">+{voidCount} pesanan batal dikecualikan</span>
              )}
            </div>
            <div className="cg-card p-16 min-w-0">
              <span className="text-xs text-text-muted">Diturunkan</span>
              <strong className="block text-xl cg-num mt-4 text-danger" data-testid="kpi-price-lowered">
                {summary.lowered}
              </strong>
            </div>
            <div className="cg-card p-16 min-w-0">
              <span className="text-xs text-text-muted">Dinaikkan</span>
              <strong className="block text-xl cg-num mt-4 text-accent-strong" data-testid="kpi-price-raised">
                {summary.raised}
              </strong>
            </div>
            <div className="cg-card p-16 min-w-0">
              <span className="text-xs text-text-muted">Dampak ke pendapatan</span>
              <strong
                className={`block text-xl cg-num mt-4 ${summary.totalImpact < 0 ? 'text-danger' : summary.totalImpact > 0 ? 'text-accent-strong' : ''}`}
                data-testid="kpi-price-impact"
              >
                {summary.totalImpact > 0 ? `+${formatRp(summary.totalImpact)}` : formatRp(summary.totalImpact)}
              </strong>
            </div>
          </div>

          <div className="cg-card p-16 grid gap-12 min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-8 min-w-0">
              <h2 className="text-base font-semibold m-0">Ringkasan per kasir</h2>
              <span className="text-xs text-text-muted">Hanya menghitung pesanan aktif/lunas (pesanan batal tidak dihitung)</span>
            </div>
            {summary.byCashier.length === 0 ? (
              <div className="cg-empty">
                <p className="text-xs text-text-muted m-0">Belum ada perubahan harga non-batal pada rentang dan filter ini.</p>
              </div>
            ) : (
              <div className="cg-data-wrap min-w-0">
                <table className="cg-data" aria-label="Ringkasan perubahan harga per kasir">
                  <thead>
                    <tr>
                      <th>Kasir</th>
                      <th className="cg-num">Jumlah item diubah</th>
                      <th className="cg-num">Total dampak pendapatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byCashier.map((c) => (
                      <tr key={c.cashierId}>
                        <td>
                          <strong>{c.cashierName}</strong>
                        </td>
                        <td className="cg-num">{c.count}</td>
                        <td
                          className={`cg-num font-semibold ${c.impact < 0 ? 'text-danger' : c.impact > 0 ? 'text-accent-strong' : ''}`}
                        >
                          {c.impact > 0 ? `+${formatRp(c.impact)}` : formatRp(c.impact)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="cg-card p-16 grid gap-12 min-w-0">
            <h2 className="text-base font-semibold m-0">Rincian perubahan harga ({filtered.length})</h2>
            {!hasCols ? (
              <div className="cg-empty">
                <p className="text-xs text-text-muted m-0">
                  Semua kolom disembunyikan. Gunakan tombol <strong>Atur Kolom</strong> untuk menampilkan kolom laporan.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="cg-empty">
                <Tag className="cg-icon cg-icon--lg text-text-muted" aria-hidden />
                <strong>Tidak ada perubahan harga pada rentang ini</strong>
                <p className="text-xs text-text-muted m-0">
                  Item yang harganya diubah kasir di bawah atau di atas harga dasar akan muncul di sini.
                </p>
              </div>
            ) : (
              <div className="cg-data-wrap min-w-0">
                <table className="cg-data" aria-label="Rincian perubahan harga kasir">
                  <thead>
                    <tr>
                      {activeCols.map((col) => (
                        <th key={col.key} className={col.align === 'right' ? 'cg-num' : ''}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={`${row.orderId}-${row.itemId}`}>
                        {activeCols.map((col) => renderCell(col.key, row, tz))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

