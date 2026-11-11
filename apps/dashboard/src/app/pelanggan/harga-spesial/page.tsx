'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  formatRp,
  MAX_TIERED_PRICE_TIERS,
  normalizeTieredPrices,
  resolveTieredPrice,
  validateTieredPrices,
  type CatalogProduct,
  type CustomerGroup,
  type GroupProductTieredPricing,
  type TieredPriceRule,
} from '@cgpos/shared';
import { Layers, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useData } from '@/lib/data';
import { useAsync } from '@/lib/use-async';
import { PageHeader } from '@/components/page';
import { useDialog } from '@/components/fin-common';
import {
  formatJakartaDateTime,
  loadCustomerGroups,
  loadTieredPricings,
  saveTieredPricings,
} from '@/lib/pricing-preview';

interface DraftTierRow {
  minQty: string;
  unitPrice: string;
}

function TierEditorDialog({
  group,
  products,
  existingProductIds,
  initial,
  onSave,
  onClose,
}: {
  group: CustomerGroup;
  products: CatalogProduct[];
  existingProductIds: Set<string>;
  initial: GroupProductTieredPricing | null;
  onSave: (productId: string, tiers: TieredPriceRule[]) => void;
  onClose: () => void;
}) {
  const dialog = useDialog(onClose);
  const availableProducts = useMemo(() => {
    if (initial) return products;
    return products.filter((p) => !existingProductIds.has(p.id) && p.isActive);
  }, [products, existingProductIds, initial]);

  const [productId, setProductId] = useState(
    initial?.productId ?? availableProducts[0]?.id ?? products[0]?.id ?? '',
  );
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId],
  );
  const basePrice = selectedProduct?.price ?? 0;

  const [rows, setRows] = useState<DraftTierRow[]>(() => {
    if (initial && initial.tiers.length > 0) {
      return initial.tiers.map((t) => ({
        minQty: String(t.minQty),
        unitPrice: String(t.unitPrice),
      }));
    }
    const defaultP1 = Math.max(0, Math.round((basePrice * 0.9) / 100) * 100);
    const defaultP2 = Math.max(0, Math.round((basePrice * 0.85) / 100) * 100);
    return [
      { minQty: '5', unitPrice: String(defaultP1) },
      { minQty: '10', unitPrice: String(Math.max(0, defaultP2 < defaultP1 ? defaultP2 : defaultP1 - 500)) },
    ];
  });
  const [simQty, setSimQty] = useState('5');
  const [error, setError] = useState('');

  const parsedTiers: TieredPriceRule[] = useMemo(
    () =>
      rows.map((r, idx) => ({
        tier: idx + 1,
        minQty: Number(r.minQty),
        unitPrice: Number(r.unitPrice),
      })),
    [rows],
  );

  const liveError = useMemo(
    () =>
      validateTieredPrices(parsedTiers, {
        basePrice: selectedProduct ? selectedProduct.price : undefined,
      }),
    [parsedTiers, selectedProduct],
  );

  const simulation = useMemo(() => {
    const qtyNum = Number(simQty) || 0;
    const validSubset = liveError ? [] : normalizeTieredPrices(parsedTiers);
    return resolveTieredPrice(validSubset, qtyNum, basePrice);
  }, [liveError, parsedTiers, simQty, basePrice]);

  const updateRow = (idx: number, field: keyof DraftTierRow, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    if (error) setError('');
  };

  const addRow = () => {
    if (rows.length >= MAX_TIERED_PRICE_TIERS) return;
    const last = rows[rows.length - 1];
    const nextQty = (Number(last?.minQty) || 0) + 10;
    const lastPrice = Number(last?.unitPrice) || basePrice;
    const nextPrice = Math.max(0, Math.round(lastPrice - Math.max(500, lastPrice * 0.05)));
    setRows((prev) => [...prev, { minQty: String(nextQty), unitPrice: String(nextPrice) }]);
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
    if (error) setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) {
      setError('Pilih produk terlebih dahulu.');
      return;
    }
    if (liveError) {
      setError(liveError);
      return;
    }
    onSave(productId, normalizeTieredPrices(parsedTiers));
    onClose();
  };

  return (
    <dialog
      {...dialog.props}
      style={{ ...dialog.props.style, width: 'min(700px, calc(100vw - 16px))' }}
      aria-labelledby="dlg-tier-title"
    >
      <form onSubmit={handleSubmit} className="grid gap-16">
        <div className="flex items-start justify-between gap-12">
          <div className="min-w-0">
            <h2 id="dlg-tier-title" className="text-lg font-bold break-words">
              {initial ? 'Ubah harga grosir bertingkat' : 'Atur harga grosir bertingkat'}
            </h2>
            <p className="text-sm text-text-muted mt-4">
              Grup pelanggan: <strong>{group.name}</strong> · Maksimal {MAX_TIERED_PRICE_TIERS} tingkat. Qty minimum harus naik dan harga per unit harus turun.
            </p>
          </div>
          <button type="button" className="cg-btn cg-btn--ghost cg-btn--sm shrink-0" onClick={onClose}>
            Tutup
          </button>
        </div>

        <div className="cg-field">
          <label htmlFor="tier-product" className="cg-label">
            Produk *
          </label>
          <select
            id="tier-product"
            className="cg-select"
            value={productId}
            disabled={Boolean(initial)}
            onChange={(e) => {
              const nextId = e.target.value;
              setProductId(nextId);
              const prod = products.find((p) => p.id === nextId);
              if (prod && !initial) {
                const p1 = Math.max(0, Math.round((prod.price * 0.9) / 100) * 100);
                const p2 = Math.max(0, Math.round((prod.price * 0.85) / 100) * 100);
                setRows([
                  { minQty: '5', unitPrice: String(p1) },
                  { minQty: '10', unitPrice: String(Math.max(0, p2 < p1 ? p2 : p1 - 500)) },
                ]);
              }
            }}
          >
            {(initial ? products : availableProducts).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — Harga normal {formatRp(p.price)}
              </option>
            ))}
          </select>
          {selectedProduct && (
            <p className="text-xs text-text-muted mt-4">
              Harga dasar produk saat ini: <strong>{formatRp(selectedProduct.price)}</strong>
            </p>
          )}
        </div>

        <div className="grid gap-8">
          <div className="flex items-center justify-between gap-12">
            <span className="text-sm font-semibold">
              Tingkatan harga ({rows.length}/{MAX_TIERED_PRICE_TIERS})
            </span>
            <button
              type="button"
              className="cg-btn cg-btn--secondary cg-btn--sm"
              disabled={rows.length >= MAX_TIERED_PRICE_TIERS}
              onClick={addRow}
            >
              <Plus className="cg-icon cg-icon--sm" aria-hidden />
              Tambah tingkat
            </button>
          </div>

          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="cg-data">
              <thead>
                <tr>
                  <th>Tingkat</th>
                  <th>Qty minimum</th>
                  <th>Harga / unit (Rp)</th>
                  <th>Hemat</th>
                  <th className="text-right">Hapus</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const unitNum = Number(row.unitPrice) || 0;
                  const diffPct =
                    basePrice > 0 && unitNum <= basePrice
                      ? Math.round(((basePrice - unitNum) / basePrice) * 100)
                      : 0;
                  return (
                    <tr key={idx}>
                      <td className="font-semibold whitespace-nowrap">Tingkat {idx + 1}</td>
                      <td>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            aria-label={`Qty minimum tingkat ${idx + 1}`}
                            className="cg-input min-w-[76px]"
                            value={row.minQty}
                            onChange={(e) => updateRow(idx, 'minQty', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step={100}
                            aria-label={`Harga per unit tingkat ${idx + 1}`}
                            className="cg-input min-w-[112px]"
                            value={row.unitPrice}
                            onChange={(e) => updateRow(idx, 'unitPrice', e.target.value)}
                          />
                      </td>
                      <td className="whitespace-nowrap text-sm">
                        {diffPct > 0 ? (
                          <span className="cg-badge cg-badge--success">-{diffPct}%</span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                          disabled={rows.length <= 1}
                          aria-label={`Hapus tingkat ${idx + 1}`}
                          onClick={() => removeRow(idx)}
                        >
                          <Trash2 className="cg-icon cg-icon--sm" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {(error || liveError) && (
          <p role="alert" className="cg-banner cg-banner--danger">
            {error || liveError}
          </p>
        )}

        <div className="p-12 rounded-lg bg-surface border border-border grid gap-8">
          <div className="flex flex-wrap items-center justify-between gap-12">
            <label htmlFor="sim-qty" className="text-sm font-semibold">
              Simulasi perhitungan jumlah beli:
            </label>
            <input
              id="sim-qty"
              type="number"
              min={1}
              step={1}
              className="cg-input w-[112px]"
              value={simQty}
              onChange={(e) => setSimQty(e.target.value)}
            />
          </div>
          <div className="text-sm">
            {liveError ? (
              <span className="text-text-muted">Perbaiki validasi tingkat di atas untuk melihat simulasi.</span>
            ) : simulation.isTiered && simulation.appliedTier ? (
              <span>
                Beli <strong>{simulation.qty}</strong> unit → masuk{' '}
                <strong className="text-accent-strong">Tingkat {simulation.appliedTier.tier}</strong> (min.{' '}
                {simulation.appliedTier.minQty}): harga satuan{' '}
                <strong>{formatRp(simulation.unitPrice)}</strong> (total {formatRp(simulation.totalPrice)}, hemat{' '}
                {formatRp(simulation.savingsPerUnit)}/unit).
              </span>
            ) : (
              <span>
                Beli <strong>{simulation.qty}</strong> unit → belum mencapai tingkat grosir, memakai harga normal{' '}
                <strong>{formatRp(simulation.basePrice)}</strong>/unit.
              </span>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-8 pt-8 border-t border-border">
          <button type="button" className="cg-btn cg-btn--ghost" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="cg-btn cg-btn--primary" disabled={Boolean(liveError) || !productId}>
            Simpan harga bertingkat
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function SpecialPriceGroupsPage() {
  const data = useData();
  const catalogRes = useAsync(() => data.listCatalog(), [data]);

  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [pricings, setPricings] = useState<GroupProductTieredPricing[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [hydrated, setHydrated] = useState(false);

  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<GroupProductTieredPricing | null | 'new'>(null);

  useEffect(() => {
    const loadedGroups = loadCustomerGroups();
    const loadedPricings = loadTieredPricings();
    setGroups(loadedGroups);
    setPricings(loadedPricings);
    setSelectedGroupId((prev) => prev || loadedGroups[0]?.id || '');
    setHydrated(true);
  }, []);

  const persistPricings = (next: GroupProductTieredPricing[]) => {
    setPricings(next);
    saveTieredPricings(next);
  };

  const products = useMemo(
    () => (catalogRes.status === 'ready' ? catalogRes.data : []),
    [catalogRes],
  );
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  const groupPricings = useMemo(
    () => pricings.filter((p) => p.groupId === selectedGroupId),
    [pricings, selectedGroupId],
  );

  const existingProductIds = useMemo(
    () => new Set(groupPricings.map((p) => p.productId)),
    [groupPricings],
  );

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groupPricings;
    return groupPricings.filter((item) => {
      const prod = productMap.get(item.productId);
      return (
        (prod?.name ?? item.productId).toLowerCase().includes(q) ||
        (prod?.sku ?? '').toLowerCase().includes(q)
      );
    });
  }, [groupPricings, productMap, search]);

  const canAddMoreProducts = useMemo(
    () => products.some((p) => p.isActive && !existingProductIds.has(p.id)),
    [products, existingProductIds],
  );

  const handleSaveTiered = (productId: string, tiers: TieredPriceRule[]) => {
    if (!selectedGroup) return;
    const now = new Date().toISOString();
    const exists = pricings.some(
      (p) => p.groupId === selectedGroup.id && p.productId === productId,
    );
    const next = exists
      ? pricings.map((p) =>
          p.groupId === selectedGroup.id && p.productId === productId
            ? { ...p, tiers, updatedAt: now }
            : p,
        )
      : [{ groupId: selectedGroup.id, productId, tiers, updatedAt: now }, ...pricings];
    persistPricings(next);
    const prodName = productMap.get(productId)?.name ?? 'produk';
    setNotice(`Harga grosir bertingkat untuk ${prodName} (${selectedGroup.name}) berhasil disimpan.`);
  };

  const handleDelete = (item: GroupProductTieredPricing) => {
    const next = pricings.filter(
      (p) => !(p.groupId === item.groupId && p.productId === item.productId),
    );
    persistPricings(next);
    const prodName = productMap.get(item.productId)?.name ?? 'produk';
    setNotice(`Aturan harga grosir ${prodName} dihapus.`);
  };

  return (
    <div className="grid gap-16 min-w-0">
      <PageHeader
        title="Grup harga spesial"
        subtitle="Atur harga grosir bertingkat (tingkat 1 sampai 5) per grup pelanggan dan produk."
        helpText="Pilih grup pelanggan lalu tentukan harga grosir per produk. Jumlah beli minimum harus naik dan harga per unit harus turun di tiap tingkat."
        actions={
          <div className="flex flex-wrap items-center gap-8">
            <Link href="/pelanggan/grup" className="cg-btn cg-btn--secondary">
              Kelola grup pelanggan
            </Link>
            <button
              type="button"
              className="cg-btn cg-btn--primary"
              disabled={!selectedGroup || !canAddMoreProducts}
              onClick={() => setEditing('new')}
            >
              <Plus className="cg-icon cg-icon--sm" aria-hidden />
              Tambah produk bertingkat
            </button>
          </div>
        }
      />

      <div className="cg-banner cg-banner--warning">
        <p className="font-semibold">Pratinjau — belum tersambung server</p>
        <p className="text-sm mt-4">
          Aturan harga grosir bertingkat disimpan sementara di peramban sambil menunggu tabel
          <code> tiered_prices </code> di server dan penyambungan otomatis ke kasir.
        </p>
      </div>

      {notice && (
        <div role="status" className="cg-banner cg-banner--info flex items-center justify-between gap-12">
          <span>{notice}</span>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm"
            onClick={() => setNotice('')}
          >
            Tutup
          </button>
        </div>
      )}

      {catalogRes.status === 'error' && (
        <div role="alert" className="cg-banner cg-banner--danger flex flex-wrap items-center justify-between gap-12">
          <span>Gagal memuat katalog produk: {catalogRes.message}</span>
          <button
            type="button"
            className="cg-btn cg-btn--secondary cg-btn--sm"
            onClick={catalogRes.reload}
          >
            Muat ulang
          </button>
        </div>
      )}

      {!hydrated || catalogRes.status === 'loading' ? (
        <div className="cg-card grid gap-8" aria-busy="true" aria-label="Memuat harga spesial">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cg-skeleton h-[52px]" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="cg-card cg-empty">
          <p className="font-semibold">Belum ada grup pelanggan</p>
          <p className="text-sm text-text-muted mt-4">
            Buat minimal satu grup pelanggan terlebih dahulu sebelum mengatur harga grosir bertingkat.
          </p>
          <Link href="/pelanggan/grup" className="cg-btn cg-btn--primary mt-12">
            Buka Grup pelanggan
          </Link>
        </div>
      ) : (
        <div className="cg-card grid gap-16 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-12">
            <div className="flex flex-wrap items-center gap-8" role="tablist" aria-label="Pilih grup pelanggan">
              {groups.map((g) => {
                const count = pricings.filter((p) => p.groupId === g.id).length;
                const active = g.id === selectedGroupId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={
                      active ? 'cg-btn cg-btn--primary cg-btn--sm' : 'cg-btn cg-btn--secondary cg-btn--sm'
                    }
                    onClick={() => setSelectedGroupId(g.id)}
                  >
                    <span className="max-w-[160px] truncate">{g.name}</span>
                    <span className="cg-badge">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <Search
                className="cg-icon cg-icon--sm absolute left-12 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                aria-hidden
              />
              <input
                type="search"
                className="cg-input pl-40"
                placeholder="Cari produk di grup ini..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {visibleRows.length === 0 ? (
            <div className="cg-empty">
              <Layers className="cg-icon cg-icon--lg mx-auto text-text-muted mb-8" aria-hidden />
              <p className="font-semibold">
                {groupPricings.length === 0
                  ? `Belum ada harga grosir untuk grup ${selectedGroup?.name ?? ''}`
                  : 'Produk tidak ditemukan'}
              </p>
              <p className="text-sm text-text-muted mt-4">
                {groupPricings.length === 0
                  ? 'Tambahkan produk untuk menetapkan harga bertingkat hingga 5 tingkat berdasarkan jumlah beli.'
                  : 'Coba ubah kata kunci pencarian produk.'}
              </p>
              {groupPricings.length === 0 && canAddMoreProducts && (
                <button
                  type="button"
                  className="cg-btn cg-btn--primary mt-12"
                  onClick={() => setEditing('new')}
                >
                  <Plus className="cg-icon cg-icon--sm" aria-hidden />
                  Atur harga grosir produk
                </button>
              )}
            </div>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className="cg-data">
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>Harga normal</th>
                    <th>Tingkat grosir (min. qty → harga/unit)</th>
                    <th>Diperbarui</th>
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((item) => {
                    const prod = productMap.get(item.productId);
                    return (
                      <tr key={item.productId}>
                        <td className="max-w-[240px]">
                          <div className="font-semibold break-words">
                            {prod?.name ?? 'Produk tidak ditemukan'}
                          </div>
                          {prod?.sku && (
                            <div className="text-xs text-text-muted whitespace-nowrap">SKU: {prod.sku}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap font-medium">
                          {prod ? formatRp(prod.price) : '—'}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-4">
                            {item.tiers.map((t) => (
                              <span key={t.tier} className="cg-badge cg-badge--accent">
                                T{t.tier}: ≥{t.minQty} → {formatRp(t.unitPrice)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="whitespace-nowrap text-sm text-text-muted">
                          {formatJakartaDateTime(item.updatedAt)}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-8">
                            <button
                              type="button"
                              className="cg-btn cg-btn--secondary cg-btn--sm"
                              onClick={() => setEditing(item)}
                            >
                              <Pencil className="cg-icon cg-icon--sm" aria-hidden />
                              Ubah
                            </button>
                            <button
                              type="button"
                              className="cg-btn cg-btn--ghost cg-btn--sm text-danger"
                              aria-label={`Hapus aturan harga ${prod?.name ?? item.productId}`}
                              onClick={() => handleDelete(item)}
                            >
                              <Trash2 className="cg-icon cg-icon--sm" aria-hidden />
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editing !== null && selectedGroup && (
        <TierEditorDialog
          group={selectedGroup}
          products={products}
          existingProductIds={existingProductIds}
          initial={editing === 'new' ? null : editing}
          onSave={handleSaveTiered}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

