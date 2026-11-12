import type { Order, PriceChange } from './types';

export type PriceChangeDirection = 'all' | 'lowered' | 'raised';

export const PRICE_CHANGE_ORDER_STATUS_LABEL: Record<Order['status'], string> = {
  open: 'Terbuka',
  partially_paid: 'Bayar sebagian',
  paid: 'Lunas',
  void: 'Batal',
};

/** Menyaring daftar perubahan harga menurut kasir, arah perubahan harga, serta nomor pesanan/produk. */
export function filterPriceChanges(
  list: PriceChange[],
  q: { cashierId?: string; direction?: PriceChangeDirection; search?: string },
): PriceChange[] {
  const needle = (q.search ?? '').trim().toLowerCase();
  const dir = q.direction ?? 'all';
  return list.filter((c) => {
    if (q.cashierId && c.cashierId !== q.cashierId) return false;
    if (dir === 'lowered' && c.diff >= 0) return false;
    if (dir === 'raised' && c.diff <= 0) return false;
    if (!needle) return true;
    return (
      c.orderNumber.toLowerCase().includes(needle) ||
      c.itemName.toLowerCase().includes(needle) ||
      c.cashierName.toLowerCase().includes(needle)
    );
  });
}

/**
 * Hanya perubahan harga dari pesanan yang TIDAK dibatalkan (`void`), agar ringkasan dampak ke pendapatan
 * dan tabel per kasir mencerminkan pendapatan efektif yang nyata.
 */
export function splitVoidPriceChanges(list: PriceChange[]): { active: PriceChange[]; voidCount: number } {
  const active: PriceChange[] = [];
  let voidCount = 0;
  for (const item of list) {
    if (item.orderStatus === 'void') voidCount += 1;
    else active.push(item);
  }
  return { active, voidCount };
}

