'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Printer,
  Package,
  Layers,
  ArrowRight,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowLeft,
  X,
  Filter,
  CheckSquare,
  Square,
  Sparkles,
} from 'lucide-react';
import {
  stationKindLabel,
  type PrintStation,
  type CatalogProduct,
  type Category,
} from '@cgpos/shared';
import { PageHeader, ErrorBox } from '@/components/page';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';

export default function StationAssignmentPage() {
  const data = useData();

  // Search & Filters
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [selectedStationFilter, setSelectedStationFilter] = useState<string>('all');

  // Bulk Selection
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // Category Shortcut
  const [shortcutCatId, setShortcutCatId] = useState<string>('');
  const [shortcutStationId, setShortcutStationId] = useState<string>('');

  // Floating Bar Action Station
  const [bulkStationTarget, setBulkStationTarget] = useState<string>('');

  // Status Banners
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load Data
  const stationsAsync = useAsync(() => data.listPrintStations(), [data]);
  const productsAsync = useAsync(() => data.listProducts(), [data]);
  const categoriesAsync = useAsync(() => data.listCategories(), [data]);

  const stations = stationsAsync.status === 'ready' ? stationsAsync.data : [];
  const products = productsAsync.status === 'ready' ? productsAsync.data : [];
  const categories = categoriesAsync.status === 'ready' ? categoriesAsync.data : [];

  const stationsMap = useMemo(() => {
    const map = new Map<string, PrintStation>();
    for (const s of stations) {
      map.set(s.id, s);
    }
    return map;
  }, [stations]);

  const categoriesMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  // Station product counts
  const stationProductCounts = useMemo(() => {
    const map = new Map<string, number>();
    let unassigned = 0;
    for (const p of products) {
      if (p.printStationId) {
        map.set(p.printStationId, (map.get(p.printStationId) || 0) + 1);
      } else {
        unassigned++;
      }
    }
    return { map, unassigned };
  }, [products]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search by name or SKU
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.sku ? p.sku.toLowerCase().includes(q) : false;
        if (!matchName && !matchSku) return false;
      }

      // Filter by category
      if (selectedCat !== 'all' && p.categoryId !== selectedCat) {
        return false;
      }

      // Filter by station
      if (selectedStationFilter === 'unassigned') {
        if (Boolean(p.printStationId)) return false;
      } else if (selectedStationFilter !== 'all') {
        if (p.printStationId !== selectedStationFilter) return false;
      }

      return true;
    });
  }, [products, search, selectedCat, selectedStationFilter]);

  // Master checkbox selection
  const allFilteredSelected = useMemo(() => {
    if (filteredProducts.length === 0) return false;
    return filteredProducts.every((p) => selectedProductIds.has(p.id));
  }, [filteredProducts, selectedProductIds]);

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      // Unselect filtered
      const next = new Set(selectedProductIds);
      for (const p of filteredProducts) {
        next.delete(p.id);
      }
      setSelectedProductIds(next);
    } else {
      // Select all filtered
      const next = new Set(selectedProductIds);
      for (const p of filteredProducts) {
        next.add(p.id);
      }
      setSelectedProductIds(next);
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedProductIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedProductIds(next);
  };

  // Perform bulk assignment
  const handleBulkAssign = async (targetStationId: string | null) => {
    if (selectedProductIds.size === 0) return;

    setIsProcessing(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    const ids = Array.from(selectedProductIds);
    try {
      const res = await data.assignProductsToStation({
        stationId: targetStationId,
        productIds: ids,
      });

      const stationName = targetStationId ? (stationsMap.get(targetStationId)?.name || 'Stasiun') : 'tanpa stasiun';
      setSuccessBanner(`Berhasil! ${res.changed} produk berhasil ditetapkan ke ${stationName}.`);
      setSelectedProductIds(new Set());
      productsAsync.reload();
      stationsAsync.reload();
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : 'Gagal memperbarui stasiun produk');
    } finally {
      setIsProcessing(false);
    }
  };

  // Perform single inline change
  const handleInlineStationChange = async (productId: string, newStationId: string | null) => {
    setIsProcessing(true);
    setErrorBanner(null);
    setSuccessBanner(null);
    try {
      await data.assignProductsToStation({
        stationId: newStationId,
        productIds: [productId],
      });
      productsAsync.reload();
      stationsAsync.reload();
      setSuccessBanner('Stasiun produk berhasil diperbarui.');
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : 'Gagal mengubah stasiun');
    } finally {
      setIsProcessing(false);
    }
  };

  // Perform category shortcut assignment
  const handleCategoryShortcut = async () => {
    if (!shortcutCatId) {
      setErrorBanner('Pilih kategori yang ingin dipetakan.');
      return;
    }

    setIsProcessing(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    const targetStation = shortcutStationId ? shortcutStationId : null;
    const catName = categoriesMap.get(shortcutCatId)?.name || 'Kategori';
    const targetName = targetStation ? (stationsMap.get(targetStation)?.name || 'Stasiun') : 'tanpa stasiun';

    try {
      const res = await data.assignProductsToStation({
        stationId: targetStation,
        categoryId: shortcutCatId,
      });

      setSuccessBanner(`Berhasil! ${res.changed} produk dalam kategori "${catName}" dipetakan ke ${targetName}.`);
      setShortcutCatId('');
      setShortcutStationId('');
      productsAsync.reload();
      stationsAsync.reload();
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : 'Gagal memetakan kategori');
    } finally {
      setIsProcessing(false);
    }
  };

  const isLoading = stationsAsync.status === 'loading' || productsAsync.status === 'loading' || categoriesAsync.status === 'loading';
  const hasError = stationsAsync.status === 'error' || productsAsync.status === 'error' || categoriesAsync.status === 'error';
  const errorMessage =
    stationsAsync.status === 'error'
      ? stationsAsync.message
      : productsAsync.status === 'error'
      ? productsAsync.message
      : categoriesAsync.status === 'error'
      ? categoriesAsync.message
      : 'Gagal memuat data';

  return (
    <div className="space-y-20 min-w-0 pb-[80px]">
      {/* Header */}
      <PageHeader
        title="Penetapan Stasiun Cetak"
        subtitle="Petakan produk ke stasiun cetak agar pesanan diteruskan otomatis ke dapur, bar, atau printer label"
        helpText="Pilih produk dan tentukan stasiun tujuannya, atau gunakan pintasan per kategori untuk pemetaan massal."
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <Link
              href="/pengaturan/stasiun-cetak"
              className="cg-btn cg-btn--secondary flex items-center gap-[6px] text-xs font-semibold"
            >
              <Printer className="w-16 h-16" aria-hidden />
              <span>Daftar Stasiun</span>
            </Link>
            <Link
              href="/produk"
              className="cg-btn cg-btn--secondary flex items-center gap-[6px] text-xs font-semibold"
            >
              <Package className="w-16 h-16" aria-hidden />
              <span>Katalog Produk</span>
            </Link>
          </div>
        }
      />

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="cg-banner cg-banner--success flex items-center justify-between gap-12" role="status">
          <div className="flex items-center gap-8">
            <CheckCircle2 className="w-16 h-16 text-success shrink-0" aria-hidden />
            <span className="text-xs font-medium">{successBanner}</span>
          </div>
          <button
            type="button"
            className="text-xs underline hover:text-text shrink-0"
            onClick={() => setSuccessBanner(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Error Notification Banner */}
      {errorBanner && (
        <div className="cg-banner cg-banner--danger flex items-center justify-between gap-12" role="alert">
          <div className="flex items-center gap-8">
            <AlertCircle className="w-16 h-16 text-danger shrink-0" aria-hidden />
            <span className="text-xs font-medium">{errorBanner}</span>
          </div>
          <button
            type="button"
            className="text-xs underline hover:text-text shrink-0"
            onClick={() => setErrorBanner(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Server Error */}
      {hasError && (
        <ErrorBox
          message={errorMessage}
          onRetry={() => {
            stationsAsync.reload();
            productsAsync.reload();
            categoriesAsync.reload();
          }}
        />
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-16" aria-busy="true" aria-label="Memuat penetapan stasiun">
          <div className="grid grid-cols-2 tablet:grid-cols-4 gap-12">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="cg-skeleton h-[80px] rounded-xl" />
            ))}
          </div>
          <div className="cg-skeleton h-[360px] rounded-xl" />
        </div>
      )}

      {!isLoading && !hasError && (
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 tablet:grid-cols-4 gap-12 min-w-0" aria-label="Ringkasan pemetaan stasiun">
            <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface min-w-0 flex flex-col justify-between">
              <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left">
                Total Produk
              </span>
              <strong className="text-xl font-bold block text-text cg-num">
                {products.length} produk
              </strong>
              <span className="text-[11px] text-text-muted mt-[2px] block">
                {categories.length} kategori terdaftar
              </span>
            </div>

            <div className="p-12 tablet:p-16 border border-border rounded-xl bg-surface min-w-0 flex flex-col justify-between">
              <span className="text-xs text-text-muted font-medium block mb-4 truncate text-left">
                Belum Punya Stasiun
              </span>
              <strong
                className={`text-xl font-bold block cg-num ${
                  stationProductCounts.unassigned > 0 ? 'text-warning-strong' : 'text-text-muted'
                }`}
              >
                {stationProductCounts.unassigned} produk
              </strong>
              <span className="text-[11px] text-text-muted mt-[2px] block">
                {stationProductCounts.unassigned > 0 ? 'Perlu dipetakan' : 'Semua telah terpetakan'}
              </span>
            </div>

            {stations.map((st) => {
              const count = stationProductCounts.map.get(st.id) || 0;
              return (
                <div
                  key={st.id}
                  className="p-12 tablet:p-16 border border-border rounded-xl bg-surface min-w-0 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between gap-[6px] mb-4">
                    <span className="text-xs text-text-muted font-medium truncate text-left">
                      {st.name}
                    </span>
                    <span
                      className={`text-[10px] px-[6px] py-[1px] rounded-full font-medium shrink-0 ${
                        st.kind === 'checker' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent-strong'
                      }`}
                    >
                      {stationKindLabel(st.kind)}
                    </span>
                  </div>
                  <strong className="text-xl font-bold block text-accent-strong cg-num">
                    {count} produk
                  </strong>
                  <span className="text-[11px] text-text-muted mt-[2px] block">
                    Mode {st.printMode} • {st.paper} mm
                  </span>
                </div>
              );
            })}
          </div>

          {/* Category Bulk Shortcut Card */}
          <div className="p-16 border border-border rounded-xl bg-surface-raised min-w-0">
            <div className="flex items-center gap-8 mb-8">
              <Sparkles className="w-16 h-16 text-accent-strong" aria-hidden />
              <h2 className="text-sm font-bold text-text">Pintasan Pemetaan Per Kategori</h2>
            </div>
            <p className="text-xs text-text-muted mb-12">
              Petakan sekaligus seluruh produk dalam satu kategori ke stasiun tertentu tanpa harus mencentang satu per satu.
            </p>

            <div className="flex flex-col tablet:flex-row tablet:items-center gap-8">
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="shortcut-cat" className="cg-sr">Pilih Kategori</label>
                <select
                  id="shortcut-cat"
                  className="cg-input w-full text-xs"
                  value={shortcutCatId}
                  onChange={(e) => setShortcutCatId(e.target.value)}
                >
                  <option value="">-- Pilih Kategori --</option>
                  {categories.map((c) => {
                    const countInCat = products.filter((p) => p.categoryId === c.id).length;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({countInCat} produk)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-center justify-center text-text-muted shrink-0">
                <ArrowRight className="w-16 h-16 hidden tablet:block" aria-hidden />
                <span className="tablet:hidden text-xs">diteruskan ke:</span>
              </div>

              <div className="flex-1 min-w-[200px]">
                <label htmlFor="shortcut-station" className="cg-sr">Pilih Stasiun Tujuan</label>
                <select
                  id="shortcut-station"
                  className="cg-input w-full text-xs"
                  value={shortcutStationId}
                  onChange={(e) => setShortcutStationId(e.target.value)}
                >
                  <option value="">-- Lepas dari stasiun (Kosongkan) --</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({stationKindLabel(s.kind)})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="cg-btn cg-btn--primary text-xs shrink-0 whitespace-nowrap"
                disabled={isProcessing || !shortcutCatId}
                onClick={handleCategoryShortcut}
              >
                {isProcessing ? 'Menerapkan…' : 'Terapkan ke Kategori'}
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="border border-border rounded-xl bg-surface overflow-hidden min-w-0">
            {/* Filter Bar */}
            <div className="p-16 border-b border-border flex flex-col tablet:flex-row tablet:items-center justify-between gap-12">
              {/* Search Bar */}
              <div className="relative w-full tablet:w-[260px]">
                <Search
                  className="w-16 h-16 absolute left-12 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                  aria-hidden
                />
                <input
                  type="text"
                  placeholder="Cari nama atau SKU produk…"
                  className="cg-input pl-[36px] text-xs w-full"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-8 self-start tablet:self-auto">
                <select
                  className="cg-input text-xs"
                  value={selectedCat}
                  onChange={(e) => setSelectedCat(e.target.value)}
                  aria-label="Filter kategori"
                >
                  <option value="all">Semua Kategori</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select
                  className="cg-input text-xs"
                  value={selectedStationFilter}
                  onChange={(e) => setSelectedStationFilter(e.target.value)}
                  aria-label="Filter stasiun"
                >
                  <option value="all">Semua Stasiun</option>
                  <option value="unassigned">Belum Punya Stasiun ({stationProductCounts.unassigned})</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({stationProductCounts.map.get(s.id) || 0})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Empty Filter State */}
            {filteredProducts.length === 0 ? (
              <div className="cg-empty py-40 text-center">
                <Package className="w-40 h-40 mx-auto text-text-muted mb-8" aria-hidden />
                <p className="text-sm font-semibold text-text">
                  {search ? `Tidak ada produk yang cocok dengan "${search}".` : 'Tidak ada produk yang memenuhi filter.'}
                </p>
                <p className="text-xs text-text-muted mt-[2px]">
                  Coba ubah kata kunci pencarian atau bersihkan filter di atas.
                </p>
              </div>
            ) : (
              /* Products Assignment Table */
              <div className="overflow-x-auto min-w-0">
                <table className="w-full text-xs text-left border-collapse" aria-label="Tabel penetapan stasiun produk">
                  <thead>
                    <tr className="bg-surface-raised border-b border-border text-text-muted font-medium">
                      <th className="py-12 px-12 w-[44px] text-center">
                        <button
                          type="button"
                          onClick={toggleSelectAllFiltered}
                          className="p-[2px] text-text hover:text-accent transition-colors"
                          title={allFilteredSelected ? 'Batalkan pilih semua' : 'Pilih semua yang tampil'}
                          aria-label={allFilteredSelected ? 'Batalkan pilih semua' : 'Pilih semua yang tampil'}
                        >
                          {allFilteredSelected ? (
                            <CheckSquare className="w-16 h-16 text-accent" aria-hidden />
                          ) : (
                            <Square className="w-16 h-16 text-text-muted" aria-hidden />
                          )}
                        </button>
                      </th>
                      <th className="py-12 px-12 uppercase font-semibold">Produk</th>
                      <th className="py-12 px-12 uppercase font-semibold hidden tablet:table-cell">Kategori</th>
                      <th className="py-12 px-12 uppercase font-semibold">Stasiun Saat Ini</th>
                      <th className="py-12 px-12 uppercase font-semibold text-right">Ubah Stasiun</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredProducts.map((p) => {
                      const isSelected = selectedProductIds.has(p.id);
                      const currentStation = p.printStationId ? stationsMap.get(p.printStationId) : null;
                      const cat = p.categoryId ? categoriesMap.get(p.categoryId) : null;

                      return (
                        <tr
                          key={p.id}
                          className={`transition-colors ${
                            isSelected ? 'bg-accent/5' : 'hover:bg-surface-raised/60'
                          }`}
                        >
                          <td className="py-12 px-12 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOne(p.id)}
                              className="rounded-xs border-border text-accent focus:ring-accent w-16 h-16 cursor-pointer"
                              aria-label={`Pilih ${p.name}`}
                            />
                          </td>
                          <td className="py-12 px-12 min-w-0">
                            <strong
                              className="font-semibold text-text block truncate max-w-[240px] tablet:max-w-[360px]"
                              title={p.name}
                            >
                              {p.name}
                            </strong>
                            <div className="flex items-center gap-[6px] mt-[2px] flex-wrap">
                              {p.sku && (
                                <span className="font-mono text-[10px] px-4 py-[1px] bg-surface-raised border border-border rounded text-text-muted cg-num">
                                  SKU: {p.sku}
                                </span>
                              )}
                              <span className="tablet:hidden text-[10px] text-text-muted">
                                {cat?.name || 'Tanpa kategori'}
                              </span>
                            </div>
                          </td>
                          <td className="py-12 px-12 text-text-muted hidden tablet:table-cell whitespace-nowrap">
                            {cat?.name || '—'}
                          </td>
                          <td className="py-12 px-12 whitespace-nowrap">
                            {currentStation ? (
                              <span
                                className={`inline-flex items-center gap-4 text-xs px-8 py-[2px] rounded-full font-medium ${
                                  currentStation.kind === 'checker'
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : 'bg-accent/10 text-accent-strong border border-accent/20'
                                }`}
                              >
                                <Printer className="w-12 h-12" aria-hidden />
                                <span>{currentStation.name}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-xs px-8 py-[2px] rounded-full font-medium bg-surface-raised text-text-muted border border-border">
                                Belum diatur
                              </span>
                            )}
                          </td>
                          <td className="py-12 px-12 text-right whitespace-nowrap">
                            <select
                              className="cg-input text-xs py-[4px] px-8"
                              style={{ width: 'auto' }}
                              value={p.printStationId || ''}
                              disabled={isProcessing}
                              onChange={(e) => {
                                const val = e.target.value;
                                handleInlineStationChange(p.id, val ? val : null);
                              }}
                              aria-label={`Ubah stasiun untuk ${p.name}`}
                            >
                              <option value="">-- Tanpa stasiun --</option>
                              {stations.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.kind})
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Floating Bulk Action Bar (Visible when items selected) */}
      {selectedProductIds.size > 0 && (
        <div
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-32px)] max-w-2xl bg-surface border border-border shadow-pop rounded-2xl p-12 tablet:p-16 flex flex-col tablet:flex-row tablet:items-center justify-between gap-12 min-w-0"
          role="region"
          aria-label="Bilah aksi massal produk"
        >
          <div className="flex items-center justify-between tablet:justify-start gap-8 min-w-0">
            <span className="text-xs font-bold text-text whitespace-nowrap">
              {selectedProductIds.size} produk dipilih
            </span>
            <button
              type="button"
              className="text-xs text-text-muted hover:text-text underline"
              onClick={() => setSelectedProductIds(new Set())}
            >
              Batalkan
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-8 min-w-0">
            <label htmlFor="bulk-station-select" className="cg-sr">Pilih Stasiun Tujuan</label>
            <select
              id="bulk-station-select"
              className="cg-input text-xs flex-1 tablet:flex-none min-w-[140px]"
              value={bulkStationTarget}
              onChange={(e) => setBulkStationTarget(e.target.value)}
            >
              <option value="">-- Pilih Stasiun --</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.kind})
                </option>
              ))}
            </select>

            <button
              type="button"
              className="cg-btn cg-btn--primary text-xs shrink-0"
              disabled={isProcessing || !bulkStationTarget}
              onClick={() => handleBulkAssign(bulkStationTarget)}
            >
              Tetapkan
            </button>

            <button
              type="button"
              className="cg-btn cg-btn--secondary text-xs text-danger hover:bg-danger/10 shrink-0"
              disabled={isProcessing}
              onClick={() => handleBulkAssign(null)}
            >
              Lepas Stasiun
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

