'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Search,
  Pencil,
  Tag,
  AlertCircle,
  Clock,
  Sparkles,
  Layers,
  ExternalLink,
} from 'lucide-react';
import {
  formatRp,
  purchasePriceProblem,
  PURCHASE_PRICE_SOURCE_LABEL,
  type PurchaseItem,
  type PurchasePriceMapping,
  type PurchasePriceSuggestion,
  type PurchasePriceInput,
  type PurchasePriceMode,
} from '@cgpos/shared';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader, ErrorBox } from '@/components/page';
import { useDialog, fmtDate } from '@/components/fin-common';

function formatPriceNum(n: number | undefined): string {
  if (n === undefined || n === null) return '-';
  if (Number.isInteger(n)) return formatRp(n);
  return `Rp ${new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)}`;
}

// Modal Ubah Pemetaan Harga Beli
function EditPriceMappingDialog({
  item,
  currentMapping,
  currentSuggestion,
  onClose,
  onSaved,
}: {
  item: PurchaseItem;
  currentMapping?: PurchasePriceMapping;
  currentSuggestion?: PurchasePriceSuggestion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const data = useData();
  const { props } = useDialog(onClose);

  const [mode, setMode] = useState<PurchasePriceMode>(currentMapping?.mode || 'last');
  const [price, setPrice] = useState(
    currentMapping?.manualPrice !== undefined
      ? String(currentMapping.manualPrice)
      : currentSuggestion?.price !== undefined
      ? String(currentSuggestion.price)
      : '',
  );
  const [unitId, setUnitId] = useState(
    currentMapping?.manualUnitId || currentSuggestion?.unitId || item.units[0]?.unitId || '',
  );

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload: PurchasePriceInput = {
      productId: item.productId,
      mode,
      price: mode === 'manual' ? Number(price) : null,
      unitId: mode === 'manual' ? unitId || null : null,
    };

    const problem = purchasePriceProblem(payload);
    if (problem) {
      setFormError(problem);
      return;
    }

    setSaving(true);
    try {
      await data.setPurchasePriceMapping(payload);
      onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan harga beli.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog {...props}>
      <form onSubmit={handleSubmit} className="p-24 space-y-16">
        <div className="flex items-start justify-between border-b border-border pb-12">
          <div>
            <h3 className="font-bold text-base text-text">Pengaturan Harga Beli Barang</h3>
            <p className="text-xs text-text-muted mt-4">{item.name}</p>
          </div>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={onClose}
            disabled={saving}
          >
            Tutup
          </button>
        </div>

        {formError && (
          <div role="alert" className="cg-banner cg-banner--danger">
            <AlertCircle className="cg-icon cg-icon--sm shrink-0" aria-hidden />
            <span>{formError}</span>
          </div>
        )}

        {/* Mode Selector */}
        <div className="space-y-8">
          <label className="text-xs font-semibold text-text-muted block">
            Metode Penentuan Harga Beli
          </label>
          <div className="space-y-8">
            <label
              className={`flex items-start gap-12 p-12 rounded-lg border cursor-pointer ${
                mode === 'last'
                  ? 'border-accent bg-accent/5'
                  : 'border-border bg-surface hover:bg-surface-raised'
              }`}
            >
              <input
                type="radio"
                name="price-mode"
                value="last"
                checked={mode === 'last'}
                onChange={() => setMode('last')}
                className="mt-4 text-accent"
                disabled={saving}
              />
              <div>
                <span className="font-bold text-sm text-text block flex items-center gap-8">
                  <Clock className="cg-icon cg-icon--xs text-accent" aria-hidden />
                  Pembelian Terakhir (Otomatis)
                </span>
                <span className="text-xs text-text-muted block mt-4">
                  Harga beli otomatis terisi mengikuti harga satuan pada faktur pembelian terbaru yang tidak batal.
                  Jika belum pernah ada faktur, harga akan dibiarkan kosong untuk diisi petugas.
                </span>
              </div>
            </label>

            <label
              className={`flex items-start gap-12 p-12 rounded-lg border cursor-pointer ${
                mode === 'manual'
                  ? 'border-accent bg-accent/5'
                  : 'border-border bg-surface hover:bg-surface-raised'
              }`}
            >
              <input
                type="radio"
                name="price-mode"
                value="manual"
                checked={mode === 'manual'}
                onChange={() => setMode('manual')}
                className="mt-4 text-accent"
                disabled={saving}
              />
              <div>
                <span className="font-bold text-sm text-text block flex items-center gap-8">
                  <Tag className="cg-icon cg-icon--xs text-accent" aria-hidden />
                  Manual (Harga Tetap)
                </span>
                <span className="text-xs text-text-muted block mt-4">
                  Tentukan harga beli tetap untuk barang ini (misalnya harga kontrak pengadaan dari vendor).
                </span>
              </div>
            </label>
          </div>
        </div>

        {mode === 'manual' && (
          <div className="p-16 rounded-xl bg-surface border border-border space-y-12">
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-16">
              <div className="space-y-4">
                <label htmlFor="manual-price" className="text-xs font-semibold text-text-muted block">
                  Harga Beli Tetap (Rp) <span className="text-danger">*</span>
                </label>
                <input
                  id="manual-price"
                  type="number"
                  min={0}
                  step="any"
                  required
                  placeholder="0"
                  className="cg-input text-sm w-full cg-num"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={saving}
                />
                <span className="text-[11px] text-text-muted">
                  Boleh memasukkan desimal hingga 4 angka di belakang koma.
                </span>
              </div>

              <div className="space-y-4">
                <label htmlFor="manual-unit" className="text-xs font-semibold text-text-muted block">
                  Satuan Pembelian
                </label>
                <select
                  id="manual-unit"
                  className="cg-input text-sm w-full"
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  disabled={saving}
                >
                  {item.units.map((u) => (
                    <option key={u.unitId} value={u.unitId}>
                      {u.name} {u.isBase ? '(Satuan Dasar)' : `(${u.conversion} ${item.baseUnit})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {mode === 'last' && currentMapping?.mode === 'manual' && (
          <div className="p-12 rounded-lg bg-warning/10 border border-warning/20 text-xs text-text">
            <span className="font-semibold text-warning block mb-4">Informasi:</span>
            Menyimpan pengaturan dengan mode &quot;Pembelian terakhir&quot; akan menghapus harga manual yang sebelumnya tersimpan (Rp {currentMapping.manualPrice}).
          </div>
        )}

        <div className="flex items-center justify-end gap-12 pt-12 border-t border-border">
          <button
            type="button"
            className="cg-btn cg-btn--secondary"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function PurchasePricePage() {
  const data = useData();

  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | PurchasePriceMode>('all');
  const [editingItem, setEditingItem] = useState<PurchaseItem | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const stateAsync = useAsync(async () => {
    const [items, mappings] = await Promise.all([
      data.listPurchaseItems(),
      data.listPurchasePriceMappings(),
    ]);

    // Query suggestions for all items in parallel
    const suggestionsArr = await Promise.all(
      items.map(async (item) => {
        const s = await data.suggestPurchasePrice(item.productId);
        return [item.productId, s] as const;
      }),
    );
    const suggestions = Object.fromEntries(suggestionsArr);

    return { items, mappings, suggestions };
  }, [data]);

  const items: readonly PurchaseItem[] = stateAsync.status === 'ready' ? stateAsync.data.items : [];
  const mappings: readonly PurchasePriceMapping[] =
    stateAsync.status === 'ready' ? stateAsync.data.mappings : [];
  const suggestions: Record<string, PurchasePriceSuggestion> =
    stateAsync.status === 'ready' ? stateAsync.data.suggestions : {};

  const mappingMap = useMemo(() => {
    const map = new Map<string, PurchasePriceMapping>();
    for (const m of mappings) map.set(m.productId, m);
    return map;
  }, [mappings]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchQ = q ? item.name.toLowerCase().includes(q) : true;
      const m = mappingMap.get(item.productId);
      const effectiveMode: PurchasePriceMode = m?.mode || 'last';
      const matchM = filterMode === 'all' ? true : effectiveMode === filterMode;
      return matchQ && matchM;
    });
  }, [items, query, filterMode, mappingMap]);

  const reloadData = () => {
    stateAsync.reload();
  };

  return (
    <div className="space-y-20 max-w-full">
      <PageHeader
        title="Pemetaan Harga Beli"
        subtitle="Atur referensi harga beli barang saat membuat dokumen pemesanan stok (PO) dan faktur pembelian, baik menggunakan harga tetap maupun harga faktur terakhir."
        actions={
          <div className="flex items-center gap-8">
            <Link href="/inventori/faktur" className="cg-btn cg-btn--secondary">
              <Layers className="cg-icon cg-icon--sm" aria-hidden />
              <span>Faktur Pembelian</span>
            </Link>
          </div>
        }
      />

      {toastMsg && (
        <div role="status" className="cg-banner cg-banner--success flex items-center justify-between">
          <span>{toastMsg}</span>
          <button
            type="button"
            className="text-xs font-semibold underline ml-12"
            onClick={() => setToastMsg(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col tablet:flex-row items-stretch tablet:items-center justify-between gap-12">
        <div className="relative flex-1 max-w-sm">
          <Search className="cg-icon cg-icon--sm absolute left-12 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="text"
            className="cg-input pl-[36px] text-sm w-full"
            placeholder="Cari nama barang..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-8">
          <label htmlFor="filter-price-mode" className="text-xs font-semibold text-text-muted whitespace-nowrap">
            Mode Harga:
          </label>
          <select
            id="filter-price-mode"
            className="cg-input text-xs"
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as 'all' | PurchasePriceMode)}
          >
            <option value="all">Semua Mode</option>
            <option value="last">Pembelian Terakhir</option>
            <option value="manual">Harga Manual</option>
          </select>
        </div>
      </div>

      {stateAsync.status === 'loading' && (
        <div className="cg-card p-24 space-y-16">
          <div className="cg-skeleton h-20 w-1/4" />
          <div className="cg-skeleton h-40 w-full" />
          <div className="cg-skeleton h-40 w-full" />
        </div>
      )}

      {stateAsync.status === 'error' && (
        <ErrorBox message={stateAsync.message} onRetry={reloadData} />
      )}

      {stateAsync.status === 'ready' && items.length === 0 && (
        <div className="cg-empty py-48 text-center bg-surface-raised rounded-xl border border-border">
          <Tag className="cg-icon cg-icon--xl mx-auto text-text-muted mb-12" aria-hidden />
          <h3 className="font-bold text-base text-text mb-4">Belum ada barang persediaan</h3>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            Tambahkan produk atau bahan baku yang dilacak stoknya untuk mengatur pemetaan harga beli.
          </p>
        </div>
      )}

      {stateAsync.status === 'ready' && items.length > 0 && (
        <div className="cg-card overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="p-32 text-center text-sm text-text-muted">
              Tidak ada barang yang cocok dengan pencarian &quot;{query}&quot;.
            </div>
          ) : (
            <>
              {/* Desktop Table (>= 768px) */}
              <div className="hidden tablet:block cg-data-wrap min-w-0">
                <table className="cg-data w-full text-left">
                  <thead>
                    <tr>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted">Nama Barang</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-center">Mode</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Harga Beli Terpakai</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted">Sumber Referensi</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Rata-rata Biaya (HPP)</th>
                      <th className="py-12 px-16 text-xs font-semibold text-text-muted text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredItems.map((item) => {
                      const m = mappingMap.get(item.productId);
                      const isManual = m?.mode === 'manual';
                      const s = suggestions[item.productId];
                      const activeUnit = item.units.find((u) => u.unitId === s?.unitId) || item.units[0];
                      const unitName = activeUnit?.name || item.baseUnit;

                      return (
                        <tr key={item.productId} className="hover:bg-surface/50">
                          <td className="py-12 px-16">
                            <span className="font-bold text-sm text-text block">{item.name}</span>
                            <span className="text-[11px] text-text-muted capitalize">
                              {item.kind === 'goods' ? 'Barang Jual' : 'Bahan Baku'} · Satuan dasar: {item.baseUnit}
                            </span>
                          </td>
                          <td className="py-12 px-16 text-center whitespace-nowrap">
                            <span
                              className={`px-8 py-[2px] rounded-full text-xs font-semibold ${
                                isManual
                                  ? 'bg-info/10 text-info border border-info/20'
                                  : 'bg-success/10 text-success border border-success/20'
                              }`}
                            >
                              {isManual ? 'Manual' : 'Pembelian Terakhir'}
                            </span>
                          </td>
                          <td className="py-12 px-16 text-right whitespace-nowrap">
                            <span className="text-sm font-bold text-accent cg-num block">
                              {formatPriceNum(s?.price)}
                            </span>
                            <span className="text-[11px] text-text-muted">per {unitName}</span>
                          </td>
                          <td className="py-12 px-16 text-xs text-text-muted">
                            {s?.source === 'manual' ? (
                              <span className="inline-flex items-center gap-4 text-info font-medium">
                                <Sparkles className="cg-icon cg-icon--xs" aria-hidden />
                                {PURCHASE_PRICE_SOURCE_LABEL.manual}
                              </span>
                            ) : s?.source === 'last' ? (
                              <div className="space-y-4">
                                <span className="font-semibold text-text block">
                                  Faktur {s.invoiceNumber || '-'}
                                </span>
                                {s.invoiceDate && (
                                  <span className="text-[11px] block">{fmtDate(s.invoiceDate)}</span>
                                )}
                              </div>
                            ) : (
                              <span className="italic text-text-muted">Belum ada riwayat faktur</span>
                            )}
                          </td>
                          <td className="py-12 px-16 text-right whitespace-nowrap">
                            <span className="text-sm font-medium text-text cg-num block">
                              {formatRp(item.avgCost)}
                            </span>
                            <span className="text-[11px] text-text-muted">per {item.baseUnit}</span>
                          </td>
                          <td className="py-12 px-16 text-right">
                            <button
                              type="button"
                              className="cg-btn cg-btn--secondary cg-btn--sm"
                              onClick={() => setEditingItem(item)}
                            >
                              <Pencil className="cg-icon cg-icon--xs" aria-hidden />
                              <span>Ubah</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards (< 768px) */}
              <div className="block tablet:hidden divide-y divide-border">
                {filteredItems.map((item) => {
                  const m = mappingMap.get(item.productId);
                  const isManual = m?.mode === 'manual';
                  const s = suggestions[item.productId];
                  const activeUnit = item.units.find((u) => u.unitId === s?.unitId) || item.units[0];
                  const unitName = activeUnit?.name || item.baseUnit;

                  return (
                    <div key={item.productId} className="p-16 space-y-12 min-w-0">
                      <div className="flex items-start justify-between gap-12">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-sm text-text truncate">{item.name}</h4>
                          <span
                            className={`inline-block px-8 py-[1px] rounded-full text-[10px] font-semibold mt-4 ${
                              isManual
                                ? 'bg-info/10 text-info border border-info/20'
                                : 'bg-success/10 text-success border border-success/20'
                            }`}
                          >
                            {isManual ? 'Manual' : 'Pembelian Terakhir'}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-sm text-accent cg-num block">
                            {formatPriceNum(s?.price)}
                          </span>
                          <span className="text-[10px] text-text-muted">per {unitName}</span>
                        </div>
                      </div>

                      <div className="text-xs text-text-muted pt-4 border-t border-border/50 flex justify-between">
                        <span>Sumber:</span>
                        <span className="font-medium text-text">
                          {s?.source === 'manual'
                            ? 'Manual'
                            : s?.source === 'last'
                            ? `Faktur ${s.invoiceNumber || ''}`
                            : 'Belum ada'}
                        </span>
                      </div>

                      <div className="text-xs text-text-muted flex justify-between">
                        <span>Rata-rata HPP:</span>
                        <span className="font-medium text-text cg-num">{formatRp(item.avgCost)} / {item.baseUnit}</span>
                      </div>

                      <div className="pt-8 border-t border-border flex justify-end">
                        <button
                          type="button"
                          className="cg-btn cg-btn--secondary cg-btn--sm w-full justify-center"
                          onClick={() => setEditingItem(item)}
                        >
                          <Pencil className="cg-icon cg-icon--xs" aria-hidden />
                          <span>Ubah Pengaturan</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal Dialog */}
      {editingItem && (
        <EditPriceMappingDialog
          item={editingItem}
          currentMapping={mappingMap.get(editingItem.productId)}
          currentSuggestion={suggestions[editingItem.productId]}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            reloadData();
            setToastMsg(`Pengaturan harga beli untuk "${editingItem.name}" berhasil disimpan.`);
          }}
        />
      )}
    </div>
  );
}
