import type { CatalogProduct, Product } from './types';

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

/** Urutan label ukuran S < M < L; label lain mengikuti harga lalu abjad. */
export function sortVariants<T extends { label: string; price: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => sizeRank(a.label) - sizeRank(b.label) || a.price - b.price || a.label.localeCompare(b.label));
}

/**
 * Rakit katalog gaya pemilik dari daftar produk datar: induk (isSellable=false) memuat anak-anaknya sebagai varian;
 * anak yatim (induk tak ada di daftar) dibuatkan grup dari nama dasarnya; produk lain tetap tunggal.
 */
export function assembleCatalog(all: Product[]): CatalogProduct[] {
  const products = all.filter((p): p is Product & { kind: 'goods' | 'service' } => p.kind !== 'bundle');   // paket punya halaman sendiri
  const children = new Map<string, Product[]>();
  for (const p of products) if (p.parentId) (children.get(p.parentId) ?? children.set(p.parentId, []).get(p.parentId)!).push(p);
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: CatalogProduct[] = [];
  const toVariants = (kids: Product[]) => sortVariants(kids.map((k) => ({ id: k.id, label: splitVariantName(k.name).label, price: k.price, sku: k.sku, isActive: k.isActive })));
  const group = (id: string, name: string, head: Product | undefined, kids: Product[]): CatalogProduct => {
    const variants = toVariants(kids);
    const first = kids[0]!;
    return {
      id, name, categoryId: head?.categoryId ?? first.categoryId, kind: (head?.kind ?? first.kind) as CatalogProduct['kind'], trackStock: head?.trackStock ?? first.trackStock,
      isActive: head ? head.isActive : kids.some((k) => k.isActive), isFavorite: head?.isFavorite ?? first.isFavorite,
      price: Math.min(...variants.map((v) => v.price)), variants,
      ...((head?.photoUrl ?? kids.find((k) => k.photoUrl)?.photoUrl) ? { photoUrl: (head?.photoUrl ?? kids.find((k) => k.photoUrl)?.photoUrl)! } : {}),
    };
  };
  const seen = new Set<string>();
  for (const p of products) {
    if (p.parentId) {
      if (byId.has(p.parentId) || seen.has(p.parentId)) continue; // induk ada: ditangani di induknya
      seen.add(p.parentId);
      const kids = children.get(p.parentId)!;
      out.push(group(p.parentId, splitVariantName(p.name).base, undefined, kids));
    } else if (p.isSellable === false) {
      const kids = children.get(p.id);
      if (kids?.length) out.push(group(p.id, p.name, p, kids));
    } else {
      out.push({ id: p.id, name: p.name, categoryId: p.categoryId, kind: p.kind as CatalogProduct['kind'], trackStock: p.trackStock, isActive: p.isActive, isFavorite: p.isFavorite, price: p.price, sku: p.sku, variants: [], ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}) });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'id'));
}

/** Nama produk anak dari nama induk dan label: "Americano" + "S" -> "Americano (S)". */
export const variantProductName = (base: string, label: string) => `${base.trim()} (${label.trim()})`;

/** Periksa isian varian; mengembalikan pesan galat atau null. */
export function variantsProblem(variants: { label: string; price: number }[]): string | null {
  const seen = new Set<string>();
  for (const v of variants) {
    const l = v.label.trim();
    if (!l) return 'Nama varian wajib diisi.';
    if (/[()]/.test(l)) return 'Nama varian tidak boleh memuat tanda kurung.';
    if (seen.has(l.toLowerCase())) return `Varian "${l}" dobel.`;
    seen.add(l.toLowerCase());
    if (!Number.isFinite(v.price) || v.price < 0) return `Harga varian "${l}" tidak valid.`;
  }
  return null;
}
