'use client';

import { useMemo, useState } from 'react';
import { ArrowUpDown, Download, RefreshCw, Search } from 'lucide-react';
import {
  HPP_COST_SOURCE_LABEL,
  buildHppReport,
  filterAndSortHppItems,
  formatRp,
  getActiveColumns,
  hasVisibleColumns,
  toCsv,
  type Category,
  type ColumnDef,
  type HppCostSource,
  type HppFilterStatus,
  type HppSalesFilter,
  type HppSortField,
  type Order,
  type Product,
  type ProductHppItem,
  type RecipeIngredient,
  type RecipeProduct,
  type SortDirection,
  type StockItem,
} from '@cgpos/shared';
import { ColumnChooser, useColumnPrefs } from '@/components/column-chooser';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useData } from '@/lib/data';
import { downloadCsvWithHistory } from '@/lib/export';
import { useAsync } from '@/lib/use-async';
import { useRange } from '@/lib/use-range';

type HppColKey =
  | 'product'
  | 'category'
  | 'costSource'
  | 'unitPrice'
  | 'unitHpp'
  | 'unitMarginRp'
  | 'unitMarginPct'
  | 'soldQty'
  | 'totalSales'
  | 'totalHpp'
  | 'totalGrossMargin'
  | 'totalMarginPct';

const HPP_COLUMNS: ColumnDef<HppColKey>[] = [
  { key: 'product', label: 'Produk', align: 'left' },
  { key: 'category', label: 'Kategori', align: 'left' },
  { key: 'costSource', label: 'Sumber Biaya HPP', align: 'left' },
  { key: 'unitPrice', label: 'Harga Jual', align: 'right' },
  { key: 'unitHpp', label: 'HPP Satuan', align: 'right' },
  { key: 'unitMarginRp', label: 'Margin Satuan (Rp)', align: 'right' },
  { key: 'unitMarginPct', label: 'Margin Satuan (%)', align: 'right' },
  { key: 'soldQty', label: 'Terjual', align: 'right' },
  { key: 'totalSales', label: 'Total Penjualan', align: 'right' },
  { key: 'totalHpp', label: 'Total HPP', align: 'right' },
  { key: 'totalGrossMargin', label: 'Laba Kotor', align: 'right' },
  { key: 'totalMarginPct', label: 'Margin Total (%)', align: 'right' },
];

const SOURCE_BADGE: Record<HppCostSource, string> = {
  recipe_average: 'cg-badge--ok',
  recipe_buy_price: 'cg-badge--accent',
  recipe_incomplete: 'cg-badge--warn',
  stock_average: 'cg-badge--ok',
  none: 'cg-badge--muted',
};

function fmtPct(pct: number | null): string {
  if (pct === null) return '—';
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(pct)}%`;
}

export default function LaporanHppPage() {
  const data = useData();
  const ctx = useAsync(() => data.getContext(), [data]);
  const tz = ctx.status === 'ready' ? ctx.data.timezone : 'Asia/Jakarta';
  const { value, setValue, range, today } = useRange(tz);

  const colPrefs = useColumnPrefs<HppColKey>('report-hpp', HPP_COLUMNS);

  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');
  const [statusFilter, setStatusFilter] = useState<HppFilterStatus>('all');
  const [salesFilter, setSalesFilter] = useState<HppSalesFilter>('all');
  const [sortField, setSortField] = useState<HppSortField>('margin_pct');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const state = useAsync(async () => {
    if (ctx.status !== 'ready') return null;
    const [products, categories, recipes, ingredients, stockItems, orders] = await Promise.all([
      data.listProducts({ includeInactive: true }).catch(() => [] as Product[]),
      data.listCategories().catch(() => [] as Category[]),
      data.listRecipes().catch(() => [] as RecipeProduct[]),
      data.listRecipeIngredients().catch(() => [] as RecipeIngredient[]),
      data.listStock().catch(() => [] as StockItem[]),
      data.listOrders({ from: range.from, to: range.to }).catch(() => [] as Order[]),
    ]);
    return { products, categories, recipes, ingredients, stockItems, orders };
  }, [data, ctx.status, range.from, range.to]);

  const rawReport = useMemo(() => {
    if (state.status !== 'ready' || !state.data) return null;
    return buildHppReport(state.data);
  }, [state]);

  const items = useMemo(() => {
    if (!rawReport) return [];
    return filterAndSortHppItems(rawReport.items, {
      search,
      categoryId: selectedCat,
      statusFilter,
      salesFilter,
      sortField,
      sortDirection: sortDir,
    });
  }, [rawReport, search, selectedCat, statusFilter, salesFilter, sortField, sortDir]);

  const summary = rawReport?.summary;
  const activeCols = useMemo(() => getActiveColumns(HPP_COLUMNS, colPrefs.prefs), [colPrefs.prefs]);
  const hasCols = hasVisibleColumns(colPrefs.prefs);

  function handleExportCsv() {
    if (!items.length || !hasCols) return;
    const headers = activeCols.map((c) => c.label);

    const body = items.map((r) =>
      activeCols.map((c) => {
        switch (c.key) {
          case 'product':
            return r.name + (r.sku ? ` (${r.sku})` : '');
          case 'category':
            return r.categoryName;
          case 'costSource':
            return HPP_COST_SOURCE_LABEL[r.costSource];
          case 'unitPrice':
            return r.unitPrice;
          case 'unitHpp':
            return r.unitHpp;
          case 'unitMarginRp':
            return r.unitMarginRp;
          case 'unitMarginPct':
            return r.unitMarginPct !== null ? `${r.unitMarginPct}%` : '';
          case 'soldQty':
            return r.soldQty;
          case 'totalSales':
            return r.totalSales;
          case 'totalHpp':
            return r.totalHpp;
          case 'totalGrossMargin':
            return r.totalGrossMargin;
          case 'totalMarginPct':
            return r.totalMarginPct !== null ? `${r.totalMarginPct}%` : '';
        }
      })
    );

    const csvContent = toCsv([headers, ...body]);
    downloadCsvWithHistory({
      fileName: `laporan-hpp-margin-${today}.csv`,
      csvContent,
      reportName: 'HPP dan margin produk',
      period: value.from === value.to ? value.from : `${value.from} – ${value.to}`,
      rowCount: items.length,
      sourceUrl: '/laporan/hpp',
    });
  }

  function renderCell(key: HppColKey, row: ProductHppItem) {
    switch (key) {
      case 'product':
        return (
          <td key={key} className="break-words max-w-[200px]">
            <strong className="block text-text">{row.name}</strong>
            {row.sku && <span className="block text-xs font-mono text-text-muted">{row.sku}</span>}
          </td>
        );
      case 'category':
        return (
          <td key={key} className="whitespace-nowrap text-sm text-text-muted">
            {row.categoryName}
          </td>
        );
      case 'costSource':
        return (
          <td key={key} className="whitespace-nowrap">
            <span className={`cg-badge ${SOURCE_BADGE[row.costSource]}`}>
              {HPP_COST_SOURCE_LABEL[row.costSource]}
            </span>
          </td>
        );
      case 'unitPrice':
        return (
          <td key={key} className="whitespace-nowrap text-right cg-num">
            {formatRp(row.unitPrice)}
          </td>
        );
      case 'unitHpp':
        return (
          <td key={key} className="whitespace-nowrap text-right cg-num">
            {row.unitHpp > 0 ? formatRp(row.unitHpp) : <span className="text-text-muted">—</span>}
          </td>
        );
      case 'unitMarginRp':
        return (
          <td
            key={key}
            className={`whitespace-nowrap text-right cg-num font-semibold ${
              row.unitMarginRp < 0 ? 'text-danger-strong' : ''
            }`}
          >
            {formatRp(row.unitMarginRp)}
          </td>
        );
      case 'unitMarginPct':
        return (
          <td
            key={key}
            className={`whitespace-nowrap text-right cg-num font-bold ${
              row.unitMarginPct !== null && row.unitMarginPct < 30 ? 'text-danger-strong' : ''
            }`}
          >
            {fmtPct(row.unitMarginPct)}
          </td>
        );
      case 'soldQty':
        return (
          <td key={key} className="whitespace-nowrap text-right cg-num">
            {row.soldQty}
          </td>
        );
      case 'totalSales':
        return (
          <td key={key} className="whitespace-nowrap text-right cg-num">
            {formatRp(row.totalSales)}
          </td>
        );
      case 'totalHpp':
        return (
          <td key={key} className="whitespace-nowrap text-right cg-num">
            {formatRp(row.totalHpp)}
          </td>
        );
      case 'totalGrossMargin':
        return (
          <td
            key={key}
            className={`whitespace-nowrap text-right cg-num font-bold ${
              row.totalGrossMargin < 0 ? 'text-danger-strong' : ''
            }`}
          >
            {formatRp(row.totalGrossMargin)}
          </td>
        );
      case 'totalMarginPct':
        return (
          <td
            key={key}
            className={`whitespace-nowrap text-right cg-num font-bold ${
              row.totalMarginPct !== null && row.totalMarginPct < 30 ? 'text-danger-strong' : ''
            }`}
          >
            {fmtPct(row.totalMarginPct)}
          </td>
        );
    }
  }

  return (
    <>
      <PageHeader
        title="Laporan HPP dan Margin Produk"
        subtitle="Analisa Harga Pokok Penjualan (HPP) berbasis biaya rata-rata bergerak, harga jual, margin keuntungan kotor, dan kontribusi per produk."
      />

      <div className="flex flex-wrap items-center justify-between gap-12 mb-16">
        <RangePicker value={value} onChange={setValue} today={today} />
        <div className="flex items-center gap-8">
          <button
            type="button"
            className="cg-btn cg-btn--secondary cg-btn--sm"
            onClick={() => void state.reload()}
            title="Muat ulang data"
          >
            <RefreshCw className="cg-icon w-16 h-16" aria-hidden /> Muat ulang
          </button>
          <ColumnChooser
            columns={HPP_COLUMNS}
            prefs={colPrefs.prefs}
            onToggle={colPrefs.toggle}
            onMoveUp={colPrefs.moveUp}
            onMoveDown={colPrefs.moveDown}
            onReset={colPrefs.reset}
          />
          <button
            type="button"
            className="cg-btn cg-btn--secondary cg-btn--sm"
            onClick={handleExportCsv}
            disabled={!items.length || !hasCols}
            title="Unduh laporan dalam format CSV"
          >
            <Download className="cg-icon w-16 h-16" aria-hidden /> Unduh CSV
          </button>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="grid gap-12 mb-24" aria-busy="true" aria-label="Memuat laporan HPP">
          <div className="grid grid-cols-2 tablet:grid-cols-4 gap-12">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cg-skeleton h-[80px] rounded-lg" />
            ))}
          </div>
          <div className="cg-skeleton h-[360px] rounded-lg" />
        </div>
      )}

      {state.status === 'error' && (
        <ErrorBox message={state.message} onRetry={() => void state.reload()} />
      )}

      {state.status === 'ready' && summary && (
        <>
          {/* Kartu Ringkasan KPI */}
          <div
            className="grid grid-cols-2 tablet:grid-cols-4 gap-12 mb-20"
            aria-label="Ringkasan Margin dan HPP"
          >
            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <span className="block text-xs font-medium text-text-muted mb-4">Total Penjualan</span>
              <strong className="block text-base tablet:text-xl cg-num font-bold">
                {formatRp(summary.totalSales)}
              </strong>
              <span className="block text-xs text-text-muted mt-4">
                {summary.totalSoldQty} item terjual
              </span>
            </div>

            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <span className="block text-xs font-medium text-text-muted mb-4">Total HPP Produk</span>
              <strong className="block text-base tablet:text-xl cg-num font-bold">
                {formatRp(summary.totalHpp)}
              </strong>
              <span className="block text-xs text-text-muted mt-4">
                {summary.withHppCount} produk berbiaya
              </span>
            </div>

            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <span className="block text-xs font-medium text-text-muted mb-4">Total Laba Kotor</span>
              <strong
                className={`block text-base tablet:text-xl cg-num font-bold ${
                  summary.totalGrossMargin < 0 ? 'text-danger-strong' : ''
                }`}
              >
                {formatRp(summary.totalGrossMargin)}
              </strong>
              <span className="block text-xs text-text-muted mt-4">
                Omzet dikurangi HPP
              </span>
            </div>

            <div className="border border-border rounded-lg bg-surface-raised p-16">
              <span className="block text-xs font-medium text-text-muted mb-4">Rata-rata Margin</span>
              <strong
                className={`block text-base tablet:text-xl cg-num font-bold ${
                  summary.overallMarginPct !== null && summary.overallMarginPct < 30
                    ? 'text-danger-strong'
                    : ''
                }`}
              >
                {fmtPct(summary.overallMarginPct)}
              </strong>
              <span className="block text-xs text-text-muted mt-4">
                {summary.thinMarginCount} produk margin tipis
              </span>
            </div>
          </div>

          {/* Kotak Filter & Pencarian */}
          <div className="border border-border rounded-lg bg-surface-raised p-16 mb-20">
            <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-12 items-end">
              <div className="cg-field">
                <label className="cg-label" htmlFor="hpp-cari">
                  Cari Produk / SKU
                </label>
                <div className="relative">
                  <Search
                    className="absolute left-[10px] top-[10px] w-16 h-16 text-text-muted pointer-events-none"
                    aria-hidden
                  />
                  <input
                    id="hpp-cari"
                    className="cg-input pl-[34px] w-full"
                    placeholder="Nama produk atau SKU…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="cg-field">
                <label className="cg-label" htmlFor="hpp-kategori">
                  Kategori
                </label>
                <select
                  id="hpp-kategori"
                  className="cg-input w-full"
                  value={selectedCat}
                  onChange={(e) => setSelectedCat(e.target.value)}
                >
                  <option value="all">Semua Kategori</option>
                  {state.data?.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cg-field">
                <label className="cg-label" htmlFor="hpp-status">
                  Status HPP
                </label>
                <select
                  id="hpp-status"
                  className="cg-input w-full"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as HppFilterStatus)}
                >
                  <option value="all">Semua Status HPP</option>
                  <option value="with_hpp">Sudah Ada HPP</option>
                  <option value="without_hpp">Belum Ada Resep / Biaya</option>
                  <option value="thin_margin">Margin Tipis (&lt; 30%)</option>
                  <option value="negative_margin">Margin Negatif (&lt; 0%)</option>
                </select>
              </div>

              <div className="cg-field">
                <label className="cg-label" htmlFor="hpp-sales">
                  Filter Penjualan
                </label>
                <select
                  id="hpp-sales"
                  className="cg-input w-full"
                  value={salesFilter}
                  onChange={(e) => setSalesFilter(e.target.value as HppSalesFilter)}
                >
                  <option value="all">Semua Katalog Produk</option>
                  <option value="sold_only">Hanya yang Terjual di Periode Ini</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-12 mt-16 pt-12 border-t border-border">
              <div className="flex flex-wrap items-center gap-8 text-xs text-text-muted">
                <span>Urutkan:</span>
                <select
                  className="cg-input text-xs py-4 h-[32px]"
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as HppSortField)}
                >
                  <option value="margin_pct">Margin (%)</option>
                  <option value="margin_rp">Laba Kotor Satuan (Rp)</option>
                  <option value="hpp">HPP Satuan</option>
                  <option value="sold_qty">Jumlah Terjual</option>
                  <option value="sales">Total Penjualan</option>
                  <option value="name">Nama Produk</option>
                </select>
                <button
                  type="button"
                  className="cg-btn cg-btn--ghost cg-btn--sm h-[32px]"
                  onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  title="Balik arah urutan"
                >
                  <ArrowUpDown className="cg-icon w-12 h-12" aria-hidden />
                  {sortDir === 'desc' ? 'Terbesar ke terkecil' : 'Terkecil ke terbesar'}
                </button>
              </div>
            </div>
          </div>

          {/* Banner Informasi Resep */}
          {summary.withoutHppCount > 0 && (
            <div className="cg-banner cg-banner--info mb-20">
              <span>
                Ada {summary.withoutHppCount} produk yang belum memiliki resep atau catatan harga pokok.
                Kamu dapat melengkapi komposisi bahan di menu{' '}
                <a href="/inventori/resep" className="underline font-semibold">
                  Inventori &gt; Perubahan resep
                </a>.
              </span>
            </div>
          )}

          {/* Tabel Desktop */}
          {items.length === 0 ? (
            <div className="cg-empty">
              <p>
                <strong>Tidak ada produk yang cocok dengan filter.</strong>
              </p>
              <p className="text-text-muted">
                Coba ubah kata kunci pencarian, kategori, atau opsi penyaringan di atas.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden tablet:block border border-border rounded-lg bg-surface-raised overflow-hidden">
                <div className="cg-data-wrap min-w-0">
                  <table className="cg-data w-full" style={{ minWidth: 0 }}>
                    <thead>
                      <tr>
                        {activeCols.map((col) => (
                          <th
                            key={col.key}
                            style={{ textAlign: col.align }}
                            className="whitespace-nowrap"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row) => (
                        <tr key={row.id}>
                          {activeCols.map((col) => renderCell(col.key, row))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tampilan Kartu Mobile (390 px) */}
              <div className="tablet:hidden grid gap-12" aria-label="Daftar HPP Produk Mobile">
                {items.map((row) => (
                  <div
                    key={row.id}
                    className="border border-border rounded-lg bg-surface-raised p-16 grid gap-8 min-w-0"
                  >
                    <div className="flex justify-between items-start gap-8">
                      <div className="min-w-0">
                        <strong className="block text-text break-words">{row.name}</strong>
                        <span className="block text-xs text-text-muted">{row.categoryName}</span>
                      </div>
                      <span className={`cg-badge ${SOURCE_BADGE[row.costSource]} shrink-0 text-xs`}>
                        {HPP_COST_SOURCE_LABEL[row.costSource]}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-8 text-xs pt-8 border-t border-border">
                      <div>
                        <span className="text-text-muted block">Harga Jual</span>
                        <span className="font-semibold text-text cg-num">
                          {formatRp(row.unitPrice)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-text-muted block">HPP Satuan</span>
                        <span className="font-semibold text-text cg-num">
                          {row.unitHpp > 0 ? formatRp(row.unitHpp) : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted block">Margin Satuan</span>
                        <span
                          className={`font-bold cg-num ${
                            row.unitMarginRp < 0 ? 'text-danger-strong' : ''
                          }`}
                        >
                          {formatRp(row.unitMarginRp)} ({fmtPct(row.unitMarginPct)})
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-text-muted block">Terjual</span>
                        <span className="font-semibold text-text cg-num">
                          {row.soldQty} item
                        </span>
                      </div>
                    </div>

                    {row.soldQty > 0 && (
                      <div className="grid grid-cols-2 gap-8 text-xs pt-8 border-t border-border/60 bg-surface/50 p-8 rounded">
                        <div>
                          <span className="text-text-muted block">Total Penjualan</span>
                          <span className="font-medium text-text cg-num">
                            {formatRp(row.totalSales)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-text-muted block">Laba Kotor</span>
                          <span
                            className={`font-bold cg-num ${
                              row.totalGrossMargin < 0 ? 'text-danger-strong' : ''
                            }`}
                          >
                            {formatRp(row.totalGrossMargin)} ({fmtPct(row.totalMarginPct)})
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
