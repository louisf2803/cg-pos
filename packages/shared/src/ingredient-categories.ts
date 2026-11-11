/**
 * Kategori bahan baku (bukan kategori produk jual) — dipakai untuk mengelompokkan "Daftar bahan baku"
 * (mis. Powder, Gourmet Syrup, Snack), terpisah dari kategori produk yang dijual ke pelanggan
 * (lihat `types.ts` -> `Category`). Daftar ini mencerminkan pengelompokan nyata yang Louis pakai di
 * aplikasi resep/HPP terpisah miliknya ("Menu Coffee Ground") per 11 Nov 2026.
 *
 * Ini masih di sisi data pengembangan (fake.ts) — keputusan skema produksi (apakah kategori bahan baku
 * berbagi tabel `categories` yang sama dengan kategori produk jual, atau tabel sendiri) belum dibuat;
 * lihat docs/REQUESTS-FOR-CLAUDE.md.
 */
export interface IngredientCategory { id: string; name: string; }

export const INGREDIENT_CATEGORIES: IngredientCategory[] = [
  { id: 'bahan-makanan', name: 'Bahan makanan' },
  { id: 'basic-minuman', name: 'Basic Minuman' },
  { id: 'gourmet-syrup', name: 'Gourmet Syrup' },
  { id: 'indomie', name: 'Indomie' },
  { id: 'liquid', name: 'Liquid' },
  { id: 'odeng', name: 'Odeng' },
  { id: 'powder', name: 'Powder' },
  { id: 'snack', name: 'Snack' },
];

export const ingredientCategoryName = (id: string | undefined): string | undefined =>
  id ? INGREDIENT_CATEGORIES.find((c) => c.id === id)?.name : undefined;
