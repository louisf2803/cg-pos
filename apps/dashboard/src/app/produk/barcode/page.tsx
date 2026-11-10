'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Barcode,
  Check,
  CheckSquare,
  Minus,
  Plus,
  Printer,
  Search,
  Square,
} from 'lucide-react';
import {
  encodeCode128B,
  formatRp,
  type Product,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';

type LabelPreset = '30x20' | '40x30' | '58mm';

interface PresetConfig {
  id: LabelPreset;
  name: string;
  widthMm: number;
  heightMm: number;
  description: string;
}

const PRESETS: PresetConfig[] = [
  {
    id: '30x20',
    name: '30 × 20 mm',
    widthMm: 30,
    heightMm: 20,
    description: 'Ukuran mini (label rak, perhiasan, aksesoris)',
  },
  {
    id: '40x30',
    name: '40 × 30 mm',
    widthMm: 40,
    heightMm: 30,
    description: 'Ukuran standar retail & kemasan produk',
  },
  {
    id: '58mm',
    name: 'Gulungan 58 mm',
    widthMm: 54,
    heightMm: 32,
    description: 'Printer thermal struk / barcode roll 58 mm',
  },
];

const DEFAULT_PRESET: PresetConfig = PRESETS[1] as PresetConfig;

function BarcodeSvg({
  sku,
  height = 30,
  showText = true,
}: {
  sku: string;
  height?: number;
  showText?: boolean;
}) {
  const result = useMemo(() => {
    try {
      const encoded = encodeCode128B(sku);
      const quietZone = 8;
      const totalUnits = encoded.totalModules + quietZone * 2;
      return { ok: true as const, encoded, quietZone, totalUnits };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : 'Galat' };
    }
  }, [sku]);

  if (!result.ok) {
    return (
      <span className="text-[10px] text-danger text-center block">
        SKU tidak valid
      </span>
    );
  }

  const { encoded, quietZone, totalUnits } = result;
  const svgHeight = height + (showText ? 12 : 0);

  return (
    <svg
      viewBox={`0 0 ${totalUnits} ${svgHeight}`}
      className="w-full h-auto max-h-[36px]"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width="100%" height="100%" fill="white" />
      {encoded.bars.map((b, i) => (
        <rect
          key={i}
          x={b.x + quietZone}
          y={0}
          width={b.width}
          height={height}
          fill="black"
        />
      ))}
      {showText && (
        <text
          x={totalUnits / 2}
          y={height + 10}
          textAnchor="middle"
          fontFamily="monospace"
          fontSize="9"
          fill="black"
          className="font-bold tracking-widest"
        >
          {sku}
        </text>
      )}
    </svg>
  );
}

export default function BarcodePrintPage() {
  const data = useData();

  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<LabelPreset>('40x30');
  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showSku, setShowSku] = useState(true);

  // Map of productId -> quantity of labels
  const [selectedCounts, setSelectedCounts] = useState<Record<string, number>>({});

  const productsAsync = useAsync(async () => {
    return data.listProducts();
  }, [data]);

  const products = productsAsync.status === 'ready' ? productsAsync.data : [];

  const printableProducts = useMemo(() => {
    return products.filter((p) => p.sku && p.sku.trim().length > 0);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q))
    );
  }, [products, search]);

  const toggleProduct = (p: Product) => {
    if (!p.sku) return;
    setSelectedCounts((prev) => {
      const next = { ...prev };
      if (next[p.id]) {
        delete next[p.id];
      } else {
        next[p.id] = 1;
      }
      return next;
    });
  };

  const updateQuantity = (productId: string, qty: number) => {
    const clamped = Math.max(1, Math.min(999, qty));
    setSelectedCounts((prev) => ({
      ...prev,
      [productId]: clamped,
    }));
  };

  const selectAllPrintable = () => {
    const next: Record<string, number> = {};
    for (const p of printableProducts) {
      next[p.id] = selectedCounts[p.id] || 1;
    }
    setSelectedCounts(next);
  };

  const clearSelection = () => {
    setSelectedCounts({});
  };

  // Flattened array of items for preview/printing
  const labelQueue = useMemo(() => {
    const queue: { product: Product; index: number }[] = [];
    for (const p of products) {
      const qty = selectedCounts[p.id] || 0;
      for (let i = 0; i < qty; i++) {
        queue.push({ product: p, index: i });
      }
    }
    return queue;
  }, [products, selectedCounts]);

  const totalLabels = labelQueue.length;
  const selectedProductCount = Object.keys(selectedCounts).length;

  const currentPresetConfig: PresetConfig =
    PRESETS.find((p) => p.id === preset) ?? DEFAULT_PRESET;

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <>
      {/* Print-only CSS styling */}
      <style jsx global>{`
        @media print {
          @page {
            margin: ${preset === '58mm' ? '0' : '5mm'};
            size: ${preset === '58mm' ? '58mm auto' : 'auto'};
          }
          body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Hide all app chrome during print */
          header,
          aside,
          nav,
          .cg-topbar,
          .no-print {
            display: none !important;
          }
          #barcode-print-canvas {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 2mm !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }
          .label-print-unit {
            border: 1px dotted #ccc !important;
            box-shadow: none !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            background: white !important;
          }
        }
      `}</style>

      <div className="no-print">
        <PageHeader
          title="Cetak Barcode Produk"
          subtitle="Pilih produk, sesuaikan ukuran label, dan cetak label barcode Code 128"
          actions={
            <button
              type="button"
              className="cg-btn cg-btn--primary flex items-center gap-[6px]"
              onClick={handlePrint}
              disabled={totalLabels === 0}
              title={
                totalLabels === 0
                  ? 'Pilih minimal satu produk untuk dicetak'
                  : 'Cetak label barcode'
              }
            >
              <Printer className="w-16 h-16 shrink-0" aria-hidden />
              Cetak {totalLabels > 0 ? `(${totalLabels} label)` : ''}
            </button>
          }
        />
      </div>

      {productsAsync.status === 'error' && (
        <div className="no-print mb-16">
          <ErrorBox message={productsAsync.message} onRetry={productsAsync.reload} />
        </div>
      )}

      {productsAsync.status === 'loading' && (
        <div className="no-print grid gap-16" aria-busy="true" aria-label="Memuat produk">
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cg-skeleton h-[90px] rounded-xl" />
            ))}
          </div>
          <div className="cg-skeleton h-[300px] rounded-xl" />
        </div>
      )}

      {productsAsync.status === 'ready' && products.length === 0 && (
        <div className="cg-empty py-32 no-print">
          <Barcode className="w-16 h-16 text-text-muted mb-8" aria-hidden />
          <p>
            <strong>Belum ada produk yang terdaftar.</strong>
          </p>
          <p className="text-text-muted text-sm mt-4">
            Tambahkan produk beserta kode SKU di katalog terlebih dahulu.
          </p>
        </div>
      )}

      {productsAsync.status === 'ready' && products.length > 0 && (
        <div className="space-y-20 min-w-0">
          {/* Top Configuration Card (no-print) */}
          <div className="no-print p-16 rounded-xl border border-border bg-surface-raised space-y-16 min-w-0">
            <div>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-8">
                1. Ukuran Kertas & Format Label
              </span>
              <div className="grid grid-cols-1 tablet:grid-cols-3 gap-[10px]">
                {PRESETS.map((p) => {
                  const isSelected = preset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPreset(p.id)}
                      className={`p-12 rounded-lg border text-left flex flex-col justify-between transition-all ${
                        isSelected
                          ? 'border-accent bg-accent/5 ring-1 ring-accent'
                          : 'border-border bg-surface hover:bg-surface-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <strong className="text-sm font-bold text-text">
                          {p.name}
                        </strong>
                        {isSelected && (
                          <span className="w-8 h-8 rounded-full bg-accent" />
                        )}
                      </div>
                      <span className="text-xs text-text-muted leading-tight">
                        {p.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-12 border-t border-border flex flex-wrap items-center justify-between gap-12">
              <div>
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-8">
                  2. Isi Label
                </span>
                <div className="flex flex-wrap items-center gap-16 text-sm">
                  <label className="flex items-center gap-8 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showName}
                      onChange={(e) => setShowName(e.target.checked)}
                      className="rounded-sm border-border text-accent focus:ring-accent w-16 h-16"
                    />
                    <span>Nama Produk</span>
                  </label>

                  <label className="flex items-center gap-8 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showPrice}
                      onChange={(e) => setShowPrice(e.target.checked)}
                      className="rounded-sm border-border text-accent focus:ring-accent w-16 h-16"
                    />
                    <span>Harga Jual</span>
                  </label>

                  <label className="flex items-center gap-8 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showSku}
                      onChange={(e) => setShowSku(e.target.checked)}
                      className="rounded-sm border-border text-accent focus:ring-accent w-16 h-16"
                    />
                    <span>Kode SKU (di bawah bar)</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <span className="text-xs text-text-muted">
                  Total antrean: <strong>{totalLabels} label</strong> ({selectedProductCount} produk)
                </span>
                <button
                  type="button"
                  className="cg-btn cg-btn--primary cg-btn--sm flex items-center gap-[6px]"
                  onClick={handlePrint}
                  disabled={totalLabels === 0}
                >
                  <Printer className="w-[14px] h-[14px]" aria-hidden /> Cetak
                </button>
              </div>
            </div>
          </div>

          {/* Two-Column Area: Selection (Left) and Preview (Right) */}
          <div className="grid grid-cols-1 laptop:grid-cols-12 gap-16 min-w-0">
            {/* Left: Product Selection List (no-print) */}
            <div className="no-print laptop:col-span-6 space-y-12 min-w-0">
              <div className="p-12 rounded-xl border border-border bg-surface-raised space-y-12">
                <div className="flex items-center justify-between gap-8 flex-wrap">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                    3. Pilih Produk
                  </span>
                  <div className="flex items-center gap-8 text-xs">
                    <button
                      type="button"
                      onClick={selectAllPrintable}
                      className="text-accent-strong font-semibold hover:underline flex items-center gap-4"
                    >
                      <CheckSquare className="w-[14px] h-[14px]" aria-hidden /> Pilih semua ber-SKU
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="text-text-muted hover:underline"
                    >
                      Batal pilih
                    </button>
                  </div>
                </div>

                {/* Search Box */}
                <div className="relative">
                  <Search
                    className="w-16 h-16 text-text-muted absolute left-[10px] top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden
                  />
                  <input
                    type="search"
                    className="cg-input pl-[34px] w-full text-sm"
                    placeholder="Cari nama atau kode SKU produk…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                {/* Products Table */}
                <div className="border border-border rounded-lg overflow-hidden max-h-[480px] overflow-y-auto">
                  <table className="w-full text-left text-sm" aria-label="Daftar produk untuk cetak barcode">
                    <thead className="bg-surface border-b border-border text-xs text-text-muted uppercase tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="py-8 px-[10px] w-[36px] text-center">Pilih</th>
                        <th className="py-8 px-[10px]">Produk</th>
                        <th className="py-8 px-[10px] text-right">Harga</th>
                        <th className="py-8 px-[10px] text-center w-32">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredProducts.map((p) => {
                        const hasSku = Boolean(p.sku && p.sku.trim().length > 0);
                        const isSelected = Boolean(selectedCounts[p.id]);
                        const qty = selectedCounts[p.id] || 1;

                        return (
                          <tr
                            key={p.id}
                            className={`transition-colors ${
                              !hasSku
                                ? 'opacity-50 bg-surface-muted/30'
                                : isSelected
                                ? 'bg-accent/5'
                                : 'hover:bg-surface-muted'
                            }`}
                          >
                            <td className="py-8 px-[10px] text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!hasSku}
                                onChange={() => toggleProduct(p)}
                                className="rounded-sm border-border text-accent focus:ring-accent w-16 h-16 cursor-pointer disabled:cursor-not-allowed"
                                aria-label={`Pilih ${p.name}`}
                              />
                            </td>
                            <td className="py-8 px-[10px] min-w-0">
                              <strong
                                className="font-semibold text-text block line-clamp-2 leading-snug"
                                title={p.name}
                              >
                                {p.name}
                              </strong>
                              <div className="flex items-center gap-[6px] mt-[2px]">
                                {hasSku ? (
                                  <span className="font-mono text-[11px] px-[6px] py-[1px] bg-surface-raised border border-border rounded-sm text-text-muted cg-num font-semibold">
                                    {p.sku}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-danger font-medium flex items-center gap-[2px]">
                                    <AlertCircle className="w-12 h-12" aria-hidden /> Tanpa SKU
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-8 px-[10px] text-right font-medium text-text cg-num whitespace-nowrap">
                              {formatRp(p.price)}
                            </td>
                            <td className="py-8 px-[10px] text-center">
                              {isSelected ? (
                                <div className="flex items-center justify-center gap-[2px]">
                                  <button
                                    type="button"
                                    onClick={() => updateQuantity(p.id, qty - 1)}
                                    className="p-4 rounded-sm border border-border bg-surface hover:bg-surface-muted text-text"
                                    aria-label="Kurangi jumlah"
                                  >
                                    <Minus className="w-12 h-12" aria-hidden />
                                  </button>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={qty}
                                    onChange={(e) => {
                                      const n = parseInt(e.target.value.replace(/[^\d]/g, ''), 10);
                                      updateQuantity(p.id, isNaN(n) ? 1 : n);
                                    }}
                                    className="w-10 text-center text-xs font-bold cg-num border border-border rounded-sm py-[2px] bg-surface text-text"
                                    aria-label={`Jumlah label untuk ${p.name}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateQuantity(p.id, qty + 1)}
                                    className="p-4 rounded-sm border border-border bg-surface hover:bg-surface-muted text-text"
                                    aria-label="Tambah jumlah"
                                  >
                                    <Plus className="w-12 h-12" aria-hidden />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-text-muted">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right: Barcode Preview Area & Print Canvas */}
            <div className="laptop:col-span-6 space-y-12 min-w-0">
              <div className="no-print p-12 rounded-xl border border-border bg-surface-raised flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
                    Pratinjau Hasil Cetak
                  </span>
                  <span className="text-xs text-text-muted">
                    Format: <strong>{currentPresetConfig.name}</strong> ({totalLabels} label)
                  </span>
                </div>
                <button
                  type="button"
                  className="cg-btn cg-btn--primary cg-btn--sm flex items-center gap-[6px]"
                  onClick={handlePrint}
                  disabled={totalLabels === 0}
                >
                  <Printer className="w-[14px] h-[14px]" aria-hidden /> Cetak Sekarang
                </button>
              </div>

              {/* Canvas Area (rendered on screen in preview box, and full width on print) */}
              <div
                id="barcode-print-canvas"
                className="p-16 rounded-xl border border-border bg-surface-muted/40 min-h-[300px] max-h-[560px] overflow-y-auto flex flex-wrap gap-8 items-start content-start"
              >
                {labelQueue.length === 0 ? (
                  <div className="w-full text-center py-48 text-text-muted text-sm no-print">
                    <Barcode className="w-24 h-24 mx-auto mb-8 opacity-40" aria-hidden />
                    <p className="font-semibold">Belum ada label yang dipilih.</p>
                    <p className="text-xs mt-4">
                      Centang produk di daftar sebelah kiri untuk melihat pratinjau barcode.
                    </p>
                  </div>
                ) : (
                  labelQueue.map(({ product, index }) => (
                    <div
                      key={`${product.id}-${index}`}
                      className="label-print-unit bg-white text-black border border-dashed border-gray-400 rounded-sm p-4 flex flex-col justify-between items-center text-center overflow-hidden shadow-xs select-none"
                      style={{
                        width: `${currentPresetConfig.widthMm}mm`,
                        height: `${currentPresetConfig.heightMm}mm`,
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* Product Name (truncated to max 2 lines) */}
                      {showName && (
                        <div
                          className="text-[9px] font-bold leading-tight line-clamp-2 w-full break-words text-black mb-[1px]"
                          title={product.name}
                        >
                          {product.name}
                        </div>
                      )}

                      {/* Barcode SVG */}
                      <div className="w-full flex-1 flex items-center justify-center my-0.5 overflow-hidden">
                        <BarcodeSvg
                          sku={product.sku!}
                          height={preset === '30x20' ? 22 : 28}
                          showText={showSku}
                        />
                      </div>

                      {/* Price */}
                      {showPrice && (
                        <div className="text-[9px] font-bold cg-num leading-tight text-black mt-0.5">
                          {formatRp(product.price)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
