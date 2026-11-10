/** Laporan promo dan diskon: berapa potongan yang diberikan, lewat jalur apa, dan oleh siapa. Murni; data diambil DataLayer. */
import type { Coupon, Promotion } from './types';

export type DiscountSource = 'promo' | 'coupon' | 'manual' | 'points';
export interface DiscountUse { orderId: string; source: DiscountSource; promotionId?: string; couponId?: string; points: number; amount: number; authorizedBy?: string }

export interface PromoRow { key: string; label: string; orders: number; amount: number; /** share of total potongan, 0 to 100 */ share: number }
export interface PromoReport {
  grossSales: number; orderCount: number;
  totalAmount: number; discountedOrders: number; /** potongan dibanding penjualan kotor, persen satu desimal; null bila penjualan 0 */ ratePct: number | null;
  bySource: PromoRow[]; byPromotion: PromoRow[]; byCoupon: PromoRow[]; byAuthorizer: PromoRow[]; pointsRedeemed: number;
}
export const DISCOUNT_SOURCE_LABEL: Record<DiscountSource, string> = { promo: 'Promo otomatis', coupon: 'Kupon', manual: 'Diskon manual', points: 'Tukar poin' };

const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildPromoReport(input: {
  uses: DiscountUse[]; promotions: Promotion[]; coupons: Coupon[]; grossSales: number; orderCount: number; employeeNames?: Map<string, string>;
}): PromoReport {
  const promoName = new Map(input.promotions.map((p) => [p.id, p.name]));
  const coupon = new Map(input.coupons.map((c) => [c.id, c]));
  const total = input.uses.reduce((n, u) => n + u.amount, 0);
  const group = (keyOf: (u: DiscountUse) => { key: string; label: string } | null): PromoRow[] => {
    const m = new Map<string, { label: string; orders: Set<string>; amount: number }>();
    for (const u of input.uses) {
      const k = keyOf(u);
      if (!k) continue;
      const cur = m.get(k.key) ?? m.set(k.key, { label: k.label, orders: new Set(), amount: 0 }).get(k.key)!;
      cur.orders.add(u.orderId); cur.amount += u.amount;
    }
    return [...m.entries()].map(([key, v]): PromoRow => ({ key, label: v.label, orders: v.orders.size, amount: v.amount, share: total > 0 ? r1((v.amount / total) * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, 'id'));
  };
  return {
    grossSales: input.grossSales, orderCount: input.orderCount, totalAmount: total,
    discountedOrders: new Set(input.uses.map((u) => u.orderId)).size,
    ratePct: input.grossSales > 0 ? r1((total / input.grossSales) * 100) : null,
    bySource: group((u) => ({ key: u.source, label: DISCOUNT_SOURCE_LABEL[u.source] ?? u.source })),
    byPromotion: group((u) => (u.promotionId ? { key: u.promotionId, label: promoName.get(u.promotionId) ?? 'Promo yang sudah dihapus' } : null)),
    byCoupon: group((u) => { if (!u.couponId) return null; const c = coupon.get(u.couponId); return { key: u.couponId, label: c ? `${c.code}${promoName.get(c.promotionId) ? ` (${promoName.get(c.promotionId)})` : ''}` : 'Kupon yang sudah dihapus' }; }),
    byAuthorizer: group((u) => (u.source === 'manual' ? { key: u.authorizedBy ?? 'none', label: u.authorizedBy ? input.employeeNames?.get(u.authorizedBy) ?? 'Pemberi izin tidak dikenal' : 'Tanpa pemberi izin' } : null)),
    pointsRedeemed: input.uses.filter((u) => u.source === 'points').reduce((n, u) => n + u.points, 0),
  };
}
