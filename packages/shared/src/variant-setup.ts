import type { ExtraGroup, ProductGroupSetup, ProductVariantsSetup, VariantStockLine } from './types';

/** Paling banyak dua varian induk per produk (kolom resep = kombinasi isi induk). */
export const MAX_PARENT_VARIANTS = 2;

/** Kolom resep dari daftar varian induk (urutan induk di produk). Tanpa induk: satu kolom '*'. */
export function variantColumns(parents: { options: { id: string; name: string }[] }[]): { key: string; label: string }[] {
  if (parents.length === 0) return [{ key: '*', label: 'Semua' }];
  let cols: { ids: string[]; names: string[] }[] = [{ ids: [], names: [] }];
  for (const p of parents) cols = cols.flatMap((c) => p.options.map((o) => ({ ids: [...c.ids, o.id], names: [...c.names, o.name] })));
  return cols.map((c) => ({ key: c.ids.join('|'), label: c.names.join(' · ') }));
}

/** Kunci kolom dari pilihan kasir; null bila ada induk yang belum dipilih. Sama dengan pos.variant_combo_key di server. */
export function comboKeyFor(parents: { options: { id: string }[] }[], chosenOptionIds: string[]): string | null {
  if (parents.length === 0) return '*';
  const parts: string[] = [];
  for (const p of parents) {
    const hit = p.options.find((o) => chosenOptionIds.includes(o.id));
    if (!hit) return null;
    parts.push(hit.id);
  }
  return parts.join('|');
}

/** Varian induk dari hasil groupsForProduct (urutan tampil). */
export const parentGroups = (groups: ExtraGroup[]): ExtraGroup[] => groups.filter((g) => g.isParent);

export interface StockPreviewLine { ingredientId: string; qty: number; unitId: string }
/** Bahan yang akan terpotong untuk satu porsi dengan pilihan ini (sebelum dikalikan jumlah). Kosong bila kolom induk belum lengkap. */
export function variantStockPreview(lines: VariantStockLine[], parents: { options: { id: string }[] }[], chosenOptionIds: string[]): StockPreviewLine[] {
  const key = comboKeyFor(parents, chosenOptionIds);
  if (key == null) return [];
  const sum = new Map<string, StockPreviewLine>();
  for (const l of lines) {
    if (l.comboKey !== key) continue;
    if (l.optionId && !chosenOptionIds.includes(l.optionId)) continue;
    const k = `${l.ingredientId}|${l.unitId}`;
    const cur = sum.get(k);
    if (cur) cur.qty += l.qty; else sum.set(k, { ingredientId: l.ingredientId, qty: l.qty, unitId: l.unitId });
  }
  return [...sum.values()];
}

/** Galat pertama pada pengaturan varian produk, atau null. */
export function variantSetupProblem(s: ProductVariantsSetup): string | null {
  if (s.groups.filter((g) => g.isParent).length > MAX_PARENT_VARIANTS) return `Paling banyak ${MAX_PARENT_VARIANTS} varian induk.`;
  const ids = new Set<string>();
  for (const g of s.groups) {
    if (ids.has(g.groupId)) return 'Varian yang sama tidak boleh dipasang dua kali.';
    ids.add(g.groupId);
    if (g.isParent && g.options && g.options.length === 0) return 'Varian induk perlu minimal satu isi yang boleh.';
    for (const o of g.options ?? []) if (!Number.isFinite(o.priceDelta) || o.priceDelta < 0 || Math.round(o.priceDelta) !== o.priceDelta) return 'Tambahan harga harus rupiah bulat, 0 atau lebih.';
  }
  for (const l of s.lines) if (!(l.qty > 0) || !Number.isFinite(l.qty)) return 'Takaran harus lebih dari 0 (kosongkan bila tidak dipakai).';
  return null;
}

/** Dari ExtraGroup + id produk jadi pengaturan awal (dipakai layar Pasang di produk). */
export function setupFromGroups(groups: ExtraGroup[], productId: string): ProductVariantsSetup['groups'] {
  return groups
    .filter((g) => g.productSetups?.[productId] || g.productIds.includes(productId))
    .map((g) => ({ g, s: (g.productSetups?.[productId] ?? { sort: 0, isParent: false, options: null }) as ProductGroupSetup }))
    .sort((a, b) => a.s.sort - b.s.sort)
    .map(({ g, s }) => ({ groupId: g.id, isParent: s.isParent, options: s.options ? Object.entries(s.options).map(([optionId, priceDelta]) => ({ optionId, priceDelta })) : null }));
}
