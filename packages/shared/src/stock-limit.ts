/**
 * Batas jual saat stok habis (dipakai kasir). Murni, tanpa efek samping.
 * Hanya berlaku bila outlet menonaktifkan "izinkan stok minus" dan produk melacak stok.
 * Stok yang belum diketahui (undefined) dianggap tidak membatasi, supaya kasir offline tidak macet.
 */
export interface StockLimitInput {
  allowNegative: boolean;
  trackStock: boolean;
  /** stok di rak saat ini; undefined = belum diketahui */
  stock: number | undefined;
  /** jumlah produk yang sudah ada di pesanan ini */
  inCart: number;
  /** jumlah yang akan ditambahkan */
  adding?: number;
}
export interface StockLimitResult { ok: boolean; available: number }

export function checkStockLimit(i: StockLimitInput): StockLimitResult {
  const adding = i.adding ?? 1;
  if (i.allowNegative || !i.trackStock || i.stock === undefined || i.stock === null) return { ok: true, available: Number.POSITIVE_INFINITY };
  const available = Math.max(0, i.stock - i.inCart);
  return { ok: adding <= available, available };
}

export function stockLimitMessage(name: string, available: number): string {
  if (!Number.isFinite(available)) return '';
  return available <= 0 ? `${name} stoknya habis.` : `Sisa stok ${name} hanya ${available}.`;
}
