/** Kasir boleh mengubah harga jual satu baris, selama masih dalam batas persen dari harga daftar produk itu. */
export const PRICE_OVERRIDE_MAX_PCT = 100;

export function priceOverrideBounds(base: number, pct: number): { min: number; max: number } {
  const p = Math.max(0, Math.min(PRICE_OVERRIDE_MAX_PCT, pct));
  return { min: Math.max(0, Math.ceil(base * (1 - p / 100))), max: Math.floor(base * (1 + p / 100)) };
}
/** Pesan galat untuk harga baru, atau null bila boleh. */
export function priceOverrideProblem(base: number, pct: number, price: number): string | null {
  if (!(pct > 0)) return 'Produk ini tidak boleh diubah harganya di kasir.';
  if (!Number.isFinite(price) || price < 0) return 'Isi harga dalam rupiah, 0 atau lebih.';
  if (!Number.isInteger(price)) return 'Harga dalam rupiah penuh, tanpa pecahan.';
  const { min, max } = priceOverrideBounds(base, pct);
  if (price < min || price > max) return `Harga harus antara ${min.toLocaleString('id-ID')} dan ${max.toLocaleString('id-ID')} (batas ${pct}% dari harga daftar).`;
  return null;
}
/** Batas dari kolom produk: kosong atau 0 = tidak boleh. */
export function priceOverridePctProblem(pct: number): string | null {
  if (!Number.isFinite(pct) || pct < 0 || pct > PRICE_OVERRIDE_MAX_PCT) return `Batas harga antara 0 dan ${PRICE_OVERRIDE_MAX_PCT} persen.`;
  if (Math.round(pct * 100) / 100 !== pct) return 'Batas harga paling banyak 2 angka di belakang koma.';
  return null;
}
/**
 * `basePrice` yang dikirim ke server (kolom order_items.base_price): hanya bila harga baris benar-benar diubah dari harga daftar.
 * Baris yang tidak diubah tidak mengirim apa pun, supaya harga sah lain (item bebas, harga bertingkat, harga spesial) tidak dianggap override.
 */
export function declaredBasePrice(line: { unitPrice: number; basePrice?: number }): { basePrice?: number } {
  return line.basePrice != null && line.basePrice !== line.unitPrice ? { basePrice: line.basePrice } : {};
}
/** Pulihkan `basePrice` dan `overridePct` untuk baris keranjang saat memuat ulang pesanan dari daftar produk aktif. */
export function overridePricingForProduct(product?: { price: number; priceOverridePct?: number }): { basePrice?: number; overridePct?: number } {
  if (!product) return {};
  return {
    basePrice: product.price,
    ...(product.priceOverridePct && product.priceOverridePct > 0 ? { overridePct: product.priceOverridePct } : {}),
  };
}
