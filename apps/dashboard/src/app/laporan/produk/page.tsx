'use client';
import { useMemo, useState } from 'react';
import { ArrowDownUp, Download, Package } from 'lucide-react';
import { formatRp, toCsv, type Category, type Product } from '@cgpos/shared';
import { ErrorBox, PageHeader } from '@/components/page';
import { RangePicker } from '@/components/range-picker';
import { useReport } from '@/lib/use-report';
import { useAsync } from '@/lib/use-async';
import { useData } from '@/lib/data';

interface ProductStat {
  id: string;
  name: string;
  sku?: string;
  categoryId: string | null;
  categoryName: string;
  qty: number;
  totalSales: number;
  avgPrice: number;
  percentSales: number;
  percentQty: number;
}

type SortBy = 'revenue' | 'qty';

export default function LaporanProduk() {
  const data = useData();
  const { ctx, value, setValue, range, today, state } = useReport();
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('revenue');
  const [q, setQ] = useState('');

  const metaAsync = useAsync(async (): Promise<{ products: Product[]; categories: Category[] }> => {
    const [products, categories] = await Promise.all([
      data.listProducts({ includeInactive: true }).catch(() => []),
      data.listCategories().catch(() => []),
    ]);
    return { products, categories };
  }, [data]);

  const stats = useMemo(() => {
    if (state.status !== 'ready' || !state.data || metaAsync.status !== 'ready' || !metaAsync.data) {
      return null;
    }

    const { orders, report } = state.data;
    const { products, categories } = metaAsync.data;
    const catMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));
    const prodMap = new Map<string, Product>(products.map((p) => [p.id, p]));

    const paidOrders = orders.filter((o) => o.status === 'paid');
    const productStatsMap = new Map<string, { qty: number; totalSales: number }>();

    let grandTotalSales = 0;
    let grandTotalQty = 0;

    for (const o of paidOrders) {
      for (const item of o.items) {
        const cur = productStatsMap.get(item.productId) ?? { qty: 0, totalSales: 0 };
        cur.qty += item.qty;
        cur.totalSales += item.lineTotal;
        productStatsMap.set(item.productId, cur);
        grandTotalSales += item.lineTotal;
        grandTotalQty += item.qty;
      }
    }

    const list: ProductStat[] = [];

    for (const [pid, agg] of productStatsMap.entries()) {
      const p = prodMap.get(pid);
      const categoryId = p?.categoryId ?? null;
      const categoryName = categoryId && catMap.get(categoryId) ? catMap.get(categoryId)! : 'Tanpa Kategori';
      const name = p?.name ?? 'Produk Dihapus';
      const sku = p?.sku;
      const percentSales = grandTotalSales > 0 ? (agg.totalSales / grandTotalSales) * 100 : 0;
      const percentQty = grandTotalQty > 0 ? (agg.qty / grandTotalQty) * 100 : 0;
      const avgPrice = agg.qty > 0 ? Math.round(agg.totalSales / agg.qty) : 0;

      list.push({
        id: pid,
        name,
        sku,
        categoryId,
        categoryName,
        qty: agg.qty,
        totalSales: agg.totalSales,
        avgPrice,
        percentSales,
        percentQty,
      });
    }

    const topBySales = [...list].sort((a, b) => b.totalSales - a.totalSales)[0] ?? null;
    const topByQty = [...list].sort((a, b) => b.qty - a.qty)[0] ?? null;

    return {
      list,
      categories,
      byCategory: report.byCategory,
      grandTotalSales,
      grandTotalQty,
      topBySales,
      topByQty,
    };
  }, [state, metaAsync]);

  const filteredList = useMemo(() => {
    if (!stats) return [];
    const needle = q.trim().toLowerCase();
    const result = stats.list.filter((item) => {
      if (selectedCat !== 'all' && item.categoryId !== selectedCat) return false;
      if (needle) {
        const hitName = item.name.toLowerCase().includes(needle);
        const hitSku = (item.sku ?? '').toLowerCase().includes(needle);
        const hitCat = item.categoryName.toLowerCase().includes(needle);
        if (!hitName && !hitSku && !hitCat) return false;
      }
      return true;
    });

    if (sortBy === 'revenue') {
      result.sort((a, b) => b.totalSales - a.totalSales);
    } else {
      result.sort((a, b) => b.qty - a.qty);
    }

    return result;
  }, [stats, selectedCat, sortBy, q]);

  function downloadCsv() {
    if (!stats) return;
    const rows: (string | number)[][] = [
      ['Produk', 'SKU', 'Kategori', 'Jumlah Terjual', 'Harga Rata-rata', 'Total Omzet', 'Kontribusi Omzet %', 'Kontribusi Jumlah %'],
    ];

    for (const item of filteredList) {
      rows.push([
        item.name,
        item.sku ?? '-',
        item.categoryName,
        item.qty,
        item.avgPrice,
        item.totalSales,
        item.percentSales.toFixed(1) + '%',
        item.percentQty.toFixed(1) + '%',
      ]);
    }

    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-produk-${range.label.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Laporan penjualan per produk"
        subtitle={ctx.status === 'ready' ? `${ctx.data.outletName} · ${range.label}` : undefined}
        actions={
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={downloadCsv}
            disabled={!stats || filteredList.length === 0}
          >
            <Download className="cg-icon" aria-hidden /> Unduh CSV
          </button>
        }
      />

      <RangePicker value={value} today={today} onChange={setValue} />

      {ctx.status === 'error' && <ErrorBox message={ctx.message} onRetry={ctx.reload} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={state.reload} />}
      {metaAsync.status === 'error' && <ErrorBox message={metaAsync.message} onRetry={metaAsync.reload} />}

      {(ctx.status === 'loading' || state.status === 'loading' || metaAsync.status === 'loading') && (
        <div className="grid gap-8" aria-busy="true" aria-label="Memuat">
          {[0, 1, 2, 3].map((i) => <div key={i} className="cg-skeleton" style={{ height: 60 }} />)}
        </div>
      )}

      {stats && (
        <>
          {/* Ringkasan KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-12 mb-16">
            <div className="p-16 rounded-md border border-border bg-surface">
              <span className="text-xs text-text-muted font-medium">Total Omzet Produk</span>
              <div className="text-xl font-bold mt-4 cg-num">{formatRp(stats.grandTotalSales)}</div>
              <span className="text-xs text-text-muted">{stats.list.length} jenis produk terjual</span>
            </div>
            <div className="p-16 rounded-md border border-border bg-surface">
              <span className="text-xs text-text-muted font-medium">Total Item Terjual</span>
              <div className="text-xl font-bold mt-4 cg-num">{stats.grandTotalQty} item</div>
              <span className="text-xs text-text-muted">selama periode laporan</span>
            </div>
            <div className="p-16 rounded-md border border-border bg-surface">
              <span className="text-xs text-text-muted font-medium">Terlaris (Omzet)</span>
              <div className="text-lg font-bold mt-4 truncate">
                {stats.topBySales ? stats.topBySales.name : '-'}
              </div>
              <span className="text-xs text-text-muted">
                {stats.topBySales ? formatRp(stats.topBySales.totalSales) : '-'}
              </span>
            </div>
            <div className="p-16 rounded-md border border-border bg-surface">
              <span className="text-xs text-text-muted font-medium">Terlaris (Jumlah)</span>
              <div className="text-lg font-bold mt-4 truncate">
                {stats.topByQty ? stats.topByQty.name : '-'}
              </div>
              <span className="text-xs text-text-muted">
                {stats.topByQty ? `${stats.topByQty.qty} item` : '-'}
              </span>
            </div>
          </div>

          {/* Pengelompokan Berdasarkan Kategori Ringkas */}
          {stats.byCategory.length > 0 && (
            <div className="mb-16 p-16 rounded-md border border-border bg-surface">
              <h2 className="text-sm font-semibold mb-8">Ringkasan Kategori Teratas</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
                {stats.byCategory.slice(0, 4).map((c) => (
                  <div key={c.key} className="p-8 rounded border border-border bg-surface-raised">
                    <div className="font-semibold text-xs truncate">{c.label}</div>
                    <div className="text-base font-bold cg-num mt-2">{formatRp(c.amount)}</div>
                    <div className="text-xs text-text-muted">{c.count} item</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter Bar & Urutan */}
          <div className="flex flex-wrap items-center gap-8 mb-12">
            <div className="flex flex-wrap gap-6" role="group" aria-label="Filter kategori">
              <button
                type="button"
                className="cg-chip"
                aria-pressed={selectedCat === 'all'}
                onClick={() => setSelectedCat('all')}
              >
                Semua Kategori
              </button>
              {stats.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="cg-chip"
                  aria-pressed={selectedCat === c.id}
                  onClick={() => setSelectedCat(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-8 ml-auto w-full sm:w-auto">
              {/* Pilihan urut */}
              <div className="flex items-center gap-4 border border-border rounded-md p-2 bg-surface">
                <ArrowDownUp className="w-14 h-14 text-text-muted ml-4" aria-hidden />
                <button
                  type="button"
                  className={`text-xs px-8 py-4 rounded ${sortBy === 'revenue' ? 'bg-accent text-white font-semibold' : 'text-text-muted'}`}
                  onClick={() => setSortBy('revenue')}
                >
                  Omzet
                </button>
                <button
                  type="button"
                  className={`text-xs px-8 py-4 rounded ${sortBy === 'qty' ? 'bg-accent text-white font-semibold' : 'text-text-muted'}`}
                  onClick={() => setSortBy('qty')}
                >
                  Jumlah
                </button>
              </div>

              {/* Cari */}
              <label className="cg-search grow">
                <span className="cg-sr">Cari produk</span>
                <input
                  className="cg-input"
                  type="search"
                  placeholder="Cari produk atau SKU..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
            </div>
          </div>

          {filteredList.length === 0 ? (
            <div className="cg-empty">
              <Package className="cg-icon" aria-hidden />
              <p><strong>{q ? `Tidak ada produk yang cocok dengan "${q}".` : 'Belum ada produk terjual pada rentang ini.'}</strong></p>
              <p className="text-text-muted">Transaksi penjualan lunas akan langsung muncul pada laporan ini.</p>
            </div>
          ) : (
            <div className="cg-data-wrap min-w-0">
              <table className="cg-data">
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>Kategori</th>
                    <th className="cg-num">Jumlah</th>
                    <th className="cg-num">Harga Rata-rata</th>
                    <th className="cg-num">Total Omzet</th>
                    <th style={{ width: '180px' }}>
                      {sortBy === 'revenue' ? 'Kontribusi Omzet' : 'Kontribusi Jumlah'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((item) => {
                    const percent = sortBy === 'revenue' ? item.percentSales : item.percentQty;
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="font-semibold break-words">{item.name}</div>
                          {item.sku && <span className="text-xs text-text-muted">SKU: {item.sku}</span>}
                        </td>
                        <td className="text-text-muted text-sm whitespace-nowrap">{item.categoryName}</td>
                        <td className="cg-num font-medium">{item.qty}</td>
                        <td className="cg-num text-sm text-text-muted">{formatRp(item.avgPrice)}</td>
                        <td className="cg-num font-semibold">{formatRp(item.totalSales)}</td>
                        <td>
                          <div className="flex items-center gap-8">
                            <div
                              className="h-8 rounded-pill bg-accent-soft grow overflow-hidden"
                              style={{ height: '8px', minWidth: '40px' }}
                            >
                              <div
                                className="h-full bg-accent rounded-pill"
                                style={{ width: `${Math.min(Math.max(percent, 0), 100)}%`, height: '100%' }}
                              />
                            </div>
                            <span className="text-xs text-text-muted cg-num shrink-0 w-36 text-right">
                              {percent.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-bold border-t-2 border-border">
                    <td>Total</td>
                    <td>-</td>
                    <td className="cg-num">{stats.grandTotalQty}</td>
                    <td className="cg-num">
                      {formatRp(stats.grandTotalQty > 0 ? Math.round(stats.grandTotalSales / stats.grandTotalQty) : 0)}
                    </td>
                    <td className="cg-num">{formatRp(stats.grandTotalSales)}</td>
                    <td>100.0%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

