import { describe, expect, it } from 'vitest';
import { buildPromoReport, createFakeData, type DiscountUse } from '../src';

const promo = (id: string, name: string) => ({ id, name, kind: 'percent', value: 10, minSpend: 0, productIds: [], orderTypes: [], isActive: true }) as never;
describe('laporan promo dan diskon', () => {
  const uses: DiscountUse[] = [
    { orderId: 'o1', source: 'promo', promotionId: 'p1', points: 0, amount: 5000 },
    { orderId: 'o2', source: 'promo', promotionId: 'p1', points: 0, amount: 3000 },
    { orderId: 'o2', source: 'coupon', promotionId: 'p2', couponId: 'c1', points: 0, amount: 2000 },
    { orderId: 'o3', source: 'manual', points: 0, amount: 10000, authorizedBy: 'e1' },
    { orderId: 'o4', source: 'manual', points: 0, amount: 1000 },
    { orderId: 'o5', source: 'points', points: 50, amount: 500 },
    { orderId: 'o6', source: 'promo', promotionId: 'hilang', points: 0, amount: 1500 },
  ];
  const r = buildPromoReport({ uses, promotions: [promo('p1', 'Happy hour'), promo('p2', 'Kupon tahun baru')], coupons: [{ id: 'c1', promotionId: 'p2', code: 'NEW26', usedCount: 1, isActive: true }], grossSales: 1_000_000, orderCount: 20, employeeNames: new Map([['e1', 'Budi']]) });
  it('total, pesanan berdiskon, dan persen dari penjualan kotor', () => {
    expect(r.totalAmount).toBe(23000);
    expect(r.discountedOrders).toBe(6);
    expect(r.ratePct).toBe(2.3);
  });
  it('per jalur, per promo, kupon, dan pemberi izin', () => {
    expect(r.bySource.map((x) => [x.key, x.amount])).toEqual([['manual', 11000], ['promo', 9500], ['coupon', 2000], ['points', 500]]);
    expect(r.byPromotion[0]).toMatchObject({ label: 'Happy hour', orders: 2, amount: 8000 });
    expect(r.byPromotion.find((x) => x.key === 'hilang')!.label).toBe('Promo yang sudah dihapus');
    expect(r.byCoupon[0]!.label).toBe('NEW26 (Kupon tahun baru)');
    expect(r.byAuthorizer.map((x) => x.label)).toEqual(['Budi', 'Tanpa pemberi izin']);
    expect(r.pointsRedeemed).toBe(50);
    expect(r.bySource.reduce((n, x) => n + x.share, 0)).toBeGreaterThan(99.5);
  });
  it('kosong dan penjualan nol tidak membagi nol', () => {
    const e = buildPromoReport({ uses: [], promotions: [], coupons: [], grossSales: 0, orderCount: 0 });
    expect(e).toMatchObject({ totalAmount: 0, ratePct: null, discountedOrders: 0, bySource: [] });
  });
  it('data tiruan: jumlah potongan sama dengan diskon pesanan lunas yang punya rincian', async () => {
    const d = createFakeData({ now: () => new Date('2026-11-09T09:00:00Z') }); d.reset();
    const uses2 = await d.listDiscountUses({ from: '2020-01-01', to: '2030-01-01' });
    const orders = await d.listOrders({ status: 'paid', all: true, by: 'closed' });
    expect(uses2.reduce((n, u) => n + u.amount, 0)).toBe(orders.flatMap((o) => o.discounts ?? []).reduce((n, x) => n + x.amount, 0));
  });
});
