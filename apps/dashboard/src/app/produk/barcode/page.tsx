'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Barcode,
  Check,
  CheckSquare,
  Minus,
  Pencil,
  Plus,
  Printer,
  Search,
  Square,
} from 'lucide-react';
import {
  BUILTIN_LABEL_PAPER,
  clipLabelText,
  encodeCode128B,
  formatRp,
  labelGridStyle,
  labelPageCount,
  labelPrintCss,
  labelsPerPage,
  type LabelPaper,
  type Product,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { ErrorBox, PageHeader } from '@/components/page';
import { PaperDialog } from '@/components/label/paper-dialog';

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
  const [paperId, setPaperId] = useState(BUILTIN_LABEL_PAPER.id);
  const [paperDialog, setPaperDialog] = useState<{ paper: LabelPaper | null } | null>(null);
  const papersAsync = useAsync(() => data.listLabelPapers(), [data]);
  const ctxAsync = useAsync(() => data.getContext(), [data]);
  const papers = useMemo(() => [BUILTIN_LABEL_PAPER, ...(papersAsync.status === 'ready' ? papersAsync.data : [])], [papersAsync]);
  const paper = papers.find((p) => p.id === paperId) ?? BUILTIN_LABEL_PAPER;
  const content = paper.content;
  const merchant = ctxAsync.status === 'ready' ? ctxAsync.data.outletName : '';

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

  const pageCount = labelPageCount(paper, totalLabels);

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
          ${labelPrintCss(paper)}
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
            margin: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            border: 0 !important;
            background: white !important;
          }
          .label-print-unit {
            border: 0 !important;
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
              <div className="flex flex-wrap items-center justify-between gap-8 mb-8">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">1. Kertas dan isi label</span>
                <div className="flex gap-8">
                  <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => setPaperDialog({ paper: null })}><Plus className="w-[14px] h-[14px]" aria-hidden /> Tambah kertas</button>
                  <button type="button" className="cg-btn cg-btn--secondary cg-btn--sm" onClick={() => setPaperDialog({ paper })}><Pencil className="w-[14px] h-[14px]" aria-hidden /> Atur kertas</button>
                </div>
              </div>
              {papersAsync.status === 'error' && <p role="alert" className="text-danger-strong text-sm mb-8">Daftar kertas gagal dimuat: {papersAsync.message}</p>}
              <div role="radiogroup" aria-label="Kertas label" className="grid grid-cols-1 tablet:grid-cols-3 gap-[10px]">
                {papers.map((p) => {
                  const isSelected = paper.id === p.id;
                  return (
                    <button key={p.id} type="button" role="radio" aria-checked={isSelected} onClick={() => setPaperId(p.id)}
                      className={`p-12 rounded-lg border text-left flex flex-col justify-between transition-all ${isSelected ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border bg-surface hover:bg-surface-muted'}`}>
                      <strong className="text-sm font-bold text-text mb-4">{p.name}{p.builtin ? ' (baca-saja)' : ''}</strong>
                      <span className="text-xs text-text-muted leading-tight">{p.paperW} × {p.paperH} mm · {p.columns} kolom · label {p.labelW} × {p.labelH} mm · {labelsPerPage(p)} label per lembar</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-12 border-t border-border flex flex-wrap items-center justify-between gap-12">
              <p className="text-xs text-text-muted">Isi label mengikuti kertas yang dipilih dan diatur dari Atur kertas.</p>
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
                <div className="border border-border rounded-lg overflow-auto max-h-[480px] min-w-0">
                  <table className="w-full text-left text-sm" aria-label="Daftar produk untuk cetak barcode">
                    <thead className="bg-surface border-b border-border text-xs text-text-muted uppercase tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="py-8 px-[6px] tablet:px-[10px] w-[36px] text-center">Pilih</th>
                        <th className="py-8 px-[6px] tablet:px-[10px]">Produk</th>
                        <th className="hidden tablet:table-cell py-8 px-[10px] text-right">Harga</th>
                        <th className="py-8 px-[6px] tablet:px-[10px] text-center w-[110px] tablet:w-32">Jumlah</th>
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
                            <td className="py-8 px-[6px] tablet:px-[10px] text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!hasSku}
                                onChange={() => toggleProduct(p)}
                                className="rounded-sm border-border text-accent focus:ring-accent w-16 h-16 cursor-pointer disabled:cursor-not-allowed"
                                aria-label={`Pilih ${p.name}`}
                              />
                            </td>
                            <td className="py-8 px-[6px] tablet:px-[10px] min-w-0">
                              <strong
                                className="font-semibold text-text block line-clamp-2 leading-snug"
                                title={p.name}
                              >
                                {p.name}
                              </strong>
                              <div className="flex items-center gap-[6px] mt-[2px] flex-wrap">
                                {hasSku ? (
                                  <span className="font-mono text-[11px] px-[6px] py-[1px] bg-surface-raised border border-border rounded-sm text-text-muted cg-num font-semibold">
                                    {p.sku}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-danger font-medium flex items-center gap-[2px]">
                                    <AlertCircle className="w-12 h-12" aria-hidden /> Tanpa SKU
                                  </span>
                                )}
                                <span className="tablet:hidden text-[11px] font-medium text-text cg-num">
                                  • {formatRp(p.price)}
                                </span>
                              </div>
                            </td>
                            <td className="hidden tablet:table-cell py-8 px-[10px] text-right font-medium text-text cg-num whitespace-nowrap">
                              {formatRp(p.price)}
                            </td>
                            <td className="py-8 px-[6px] tablet:px-[10px] text-center">
                              {isSelected ? (
                                <div className="flex items-center justify-center gap-[2px]">
                                  <button
                                    type="button"
                                    onClick={() => updateQuantity(p.id, qty - 1)}
                                    className="w-32 h-32 p-0 flex items-center justify-center rounded-sm border border-border bg-surface hover:bg-surface-muted text-text shrink-0"
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
                                    className="w-32 h-32 text-center text-xs font-bold cg-num border border-border rounded-sm py-0 bg-surface text-text shrink-0"
                                    aria-label={`Jumlah label untuk ${p.name}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateQuantity(p.id, qty + 1)}
                                    className="w-32 h-32 p-0 flex items-center justify-center rounded-sm border border-border bg-surface hover:bg-surface-muted text-text shrink-0"
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
                    Kertas: <strong>{paper.name}</strong> ({totalLabels} label{pageCount > 0 ? `, ${pageCount} lembar` : ''})
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
                className="rounded-xl border border-border bg-surface-muted/40 min-h-[300px] max-h-[560px] overflow-auto"
                style={labelQueue.length === 0 ? undefined : labelGridStyle(paper)}
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
                      className="label-print-unit bg-white text-black border border-dashed border-border flex flex-col justify-between items-center text-center overflow-hidden select-none"
                      style={{ width: `${paper.labelW}mm`, height: `${paper.labelH}mm`, boxSizing: 'border-box', padding: '0.5mm', fontSize: `${content.fontMm}mm`, lineHeight: 1.15 }}
                    >
                      {content.showMerchant && merchant && <div className="w-full font-semibold truncate">{merchant}</div>}
                      {content.showName && <div className="w-full font-bold break-words" title={product.name}>{clipLabelText(product.name, content.maxChars)}</div>}
                      {content.showBarcode && (
                        <div className="w-full flex-1 flex items-center justify-center overflow-hidden">
                          <BarcodeSvg sku={product.sku!} height={Math.max(8, Math.round(content.barcodeHeightMm * 3.78))} showText={content.showCode} />
                        </div>
                      )}
                      {!content.showBarcode && content.showCode && <div className="w-full cg-num">{product.sku}</div>}
                      {content.showPrice && <div className="font-bold cg-num" style={{ fontSize: `${content.priceMm}mm` }}>{formatRp(product.price)}</div>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {paperDialog && (
        <PaperDialog paper={paperDialog.paper} onClose={() => setPaperDialog(null)} onSaved={(p) => { setPaperDialog(null); setPaperId(p.id); papersAsync.reload(); }} />
      )}
    </>
  );
}
