import type { Product } from './types';

export interface VariantOption { product: Product; label: string }
export type CatalogTile =
  | { kind: 'single'; key: string; product: Product }
  | { kind: 'group'; key: string; name: string; categoryId: string | null; options: VariantOption[]; minPrice: number; maxPrice: number; soldOut: boolean };

/** Nama varian "Es teh (M)" -> induk "Es teh", label "M". Tanpa tanda kurung di akhir: label = nama utuh. */
export function splitVariantName(name: string): { base: string; label: string } {
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(name);
  return m && m[1] ? { base: m[1], label: m[2]! } : { base: name, label: name };
}

const SIZE_ORDER: Record<string, number> = { XS: 0, S: 1, M: 2, L: 3, XL: 4 };
const sizeRank = (label: string) => SIZE_ORDER[label.trim().toUpperCase()] ?? 99;

const isOut = (p: Product) => p.trackStock && (p.stock ?? 0) <= 0;

/**
 * Susun produk jual menjadi ubin katalog: produk tunggal tetap satu ubin, varian dengan induk yang sama
 * digabung menjadi satu ubin grup (ukuran S/M/L dipilih di dialog). Urutan ubin mengikuti kemunculan pertama.
 * Satu varian yatim (induknya tak punya saudara aktif) tampil sebagai produk tunggal.
 */
export function groupVariants(products: Product[]): CatalogTile[] {
  const byParent = new Map<string, Product[]>();
  for (const p of products) if (p.parentId) (byParent.get(p.parentId) ?? byParent.set(p.parentId, []).get(p.parentId)!).push(p);
  const tiles: CatalogTile[] = [];
  const done = new Set<string>();
  for (const p of products) {
    const siblings = p.parentId ? byParent.get(p.parentId)! : null;
    if (!p.parentId || !siblings || siblings.length < 2) { tiles.push({ kind: 'single', key: p.id, product: p }); continue; }
    if (done.has(p.parentId)) continue;
    done.add(p.parentId);
    const options = siblings
      .map((product) => ({ product, label: splitVariantName(product.name).label }))
      .sort((a, b) => sizeRank(a.label) - sizeRank(b.label) || a.product.price - b.product.price);
    const prices = options.map((o) => o.product.price);
    tiles.push({
      kind: 'group', key: `g:${p.parentId}`, name: splitVariantName(p.name).base, categoryId: p.categoryId, options,
      minPrice: Math.min(...prices), maxPrice: Math.max(...prices), soldOut: options.every((o) => isOut(o.product)),
    });
  }
  return tiles;
}
