/**
 * Bahan habis (migrasi 0150). Penanda MANUAL oleh pengelola per outlet; stok 0 atau minus tidak otomatis menandai.
 * Menu yang berisi bahan itu (resep, paket, atau barang jual langsung) ikut tidak tersedia di kasir; pesanan tersimpan tetap boleh dibayar.
 * Penanda hilang sendiri saat stok diisi lagi (penerimaan pembelian, transfer masuk, produksi masuk, stok awal, opname yang menambah).
 */
export interface IngredientUnavailable { productId: string; outletId: string; markedAt: string }
export interface IngredientUnavailableInput { productId: string; unavailable: boolean; /** kosong = outlet perangkat/akun ini */ outletId?: string }
/** Menu yang tidak tersedia di satu outlet dan bahan penyebabnya. */
export interface UnavailableProduct { productId: string; ingredientIds: string[]; ingredientNames: string[] }

/** Peta id menu -> bahan penyebab, untuk pencarian cepat di kasir. */
export function unavailableMap(list: readonly UnavailableProduct[]): Map<string, UnavailableProduct> {
  return new Map(list.map((u) => [u.productId, u]));
}

/** Keterangan singkat untuk label menu: "Habis: matcha bubuk" atau "Habis: matcha bubuk, susu uht". */
export function unavailableLabel(u: UnavailableProduct | undefined): string {
  if (!u) return '';
  return u.ingredientNames.length ? `Habis: ${u.ingredientNames.join(', ')}` : 'Habis';
}

/** Menu (resep) yang memuat bahan tertentu: dasar pratinjau "menu yang ikut nonaktif" sebelum menandai habis. */
export function menusUsingIngredient(recipes: readonly { id: string; name: string; lines: readonly { ingredientId: string }[] }[], ingredientId: string): { id: string; name: string }[] {
  return recipes.filter((r) => r.lines.some((l) => l.ingredientId === ingredientId)).map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name, 'id'));
}
