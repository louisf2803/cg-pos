import type { ExtraGroup, ExtraGroupInput, ItemExtra, Product } from './types';

/** Jumlah harga Ekstra untuk satu unit produk. */
export const extrasPerUnit = (extras?: ItemExtra[]): number => (extras ?? []).reduce((a, e) => a + e.price, 0);
/** Total Ekstra untuk seluruh jumlah pada baris (masuk ke extrasTotal di computeOrder). */
export const extrasLineTotal = (qty: number, extras?: ItemExtra[]): number => Math.round(qty * extrasPerUnit(extras));
/** Kunci untuk menggabungkan baris yang sama persis (produk + pilihan Ekstra yang sama). */
export const extrasKey = (extras?: ItemExtra[]): string => (extras ?? []).map((e) => e.optionId).sort().join(',');

/** Grup Ekstra yang berlaku untuk sebuah produk. Varian (S/M/L) memakai grup milik produk induknya. */
export function groupsForProduct(groups: ExtraGroup[], product: Pick<Product, 'id' | 'parentId'>): ExtraGroup[] {
  const key = product.parentId ?? product.id;
  return groups.filter((g) => g.options.length > 0 && (g.productIds.includes(key) || g.productIds.includes(product.id)));
}

/** Galat pertama untuk pilihan pelanggan pada satu grup, atau null. */
export function selectionProblem(group: ExtraGroup, chosenOptionIds: string[]): string | null {
  const ids = chosenOptionIds.filter((id) => group.options.some((o) => o.id === id));
  if (group.required && ids.length === 0) return `${group.name}: pilih salah satu.`;
  if (group.mode === 'single' && ids.length > 1) return `${group.name}: hanya boleh satu pilihan.`;
  if (group.maxSelect && ids.length > group.maxSelect) return `${group.name}: maksimal ${group.maxSelect} pilihan.`;
  return null;
}

/** Ubah pilihan (id opsi) menjadi ItemExtra, dalam urutan grup lalu urutan opsi. */
export function pickedExtras(groups: ExtraGroup[], chosenOptionIds: string[]): ItemExtra[] {
  const out: ItemExtra[] = [];
  for (const g of groups) for (const o of [...g.options].sort((a, b) => a.sort - b.sort)) if (chosenOptionIds.includes(o.id)) out.push({ optionId: o.id, name: o.name, price: o.price });
  return out;
}

/** Galat pertama untuk isian grup Ekstra di dashboard, atau null. */
export function extraGroupProblem(i: ExtraGroupInput): string | null {
  if (!i.name.trim()) return 'Nama grup wajib diisi.';
  const opts = i.options.filter((o) => o.name.trim());
  if (opts.length === 0) return 'Isi minimal satu pilihan.';
  const seen = new Set<string>();
  for (const o of opts) {
    const k = o.name.trim().toLowerCase();
    if (seen.has(k)) return `Pilihan "${o.name.trim()}" muncul dua kali.`;
    seen.add(k);
    if (!Number.isFinite(o.price) || o.price < 0 || Math.round(o.price) !== o.price) return `Harga "${o.name.trim()}" harus rupiah bulat, 0 atau lebih.`;
  }
  if (i.maxSelect != null && (!Number.isInteger(i.maxSelect) || i.maxSelect < 1)) return 'Batas pilihan harus angka bulat 1 atau lebih.';
  if (i.mode === 'single' && i.maxSelect != null && i.maxSelect !== 1) return 'Grup satu pilihan tidak memakai batas.';
  return null;
}
