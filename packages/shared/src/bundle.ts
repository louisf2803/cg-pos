import type { BundleInput } from './types';

/** Galat pertama untuk isian paket, atau null. Dipakai kedua lapisan data dan formulir. */
export function bundleProblem(i: BundleInput): string | null {
  if (!i.name.trim()) return 'Nama paket wajib diisi.';
  if (!Number.isFinite(i.price) || i.price < 0 || Math.round(i.price) !== i.price) return 'Harga paket harus rupiah bulat, 0 atau lebih.';
  if (i.items.length === 0) return 'Isi minimal satu produk dalam paket.';
  const seen = new Set<string>();
  for (const it of i.items) {
    if (!it.productId) return 'Pilih produk untuk setiap baris isi paket.';
    if (seen.has(it.productId)) return 'Satu produk hanya boleh muncul sekali; ubah jumlahnya.';
    seen.add(it.productId);
    if (!Number.isFinite(it.qty) || it.qty <= 0 || Math.round(it.qty * 1000) !== it.qty * 1000) return 'Jumlah tiap produk dalam paket harus lebih dari 0.';
  }
  if (i.id && seen.has(i.id)) return 'Paket tidak boleh berisi dirinya sendiri.';
  return null;
}

/** Harga bila produk dibeli satuan, untuk menunjukkan penghematan paket. */
export function bundleSeparatePrice(items: { productId: string; qty: number }[], priceOf: (productId: string) => number): number {
  return Math.round(items.reduce((a, i) => a + i.qty * priceOf(i.productId), 0));
}
