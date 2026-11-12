import { describe, expect, it } from 'vitest';
import { createFakeData, newId, priceDelta, summarizePriceChanges, type PriceChange } from '../src';

describe('selisih harga', () => {
  it('menghitung selisih per unit dan persen 1 desimal; tanpa perubahan atau harga dasar tidak sah menghasilkan null', () => {
    expect(priceDelta(22000, 20000)).toEqual({ diff: -2000, diffPct: -9.1 });
    expect(priceDelta(20000, 22000)).toEqual({ diff: 2000, diffPct: 10 });
    expect(priceDelta(20000, 20000)).toBeNull();
    expect(priceDelta(0, 5000)).toBeNull();
    expect(priceDelta(Number.NaN, 5000)).toBeNull();
  });
  it('meringkas: jumlah turun dan naik, dampak total, dan per kasir (paling merugikan dulu)', () => {
    const c = (cashierId: string, name: string, diff: number, qty: number): PriceChange => ({
      orderId: 'o', orderNumber: 'N', orderStatus: 'paid', itemId: newId(), itemName: 'x', qty, basePrice: 10000, unitPrice: 10000 + diff, diff, diffPct: diff / 100,
      lineImpact: diff * qty, cashierId, cashierName: name, at: '2026-11-12T01:00:00.000Z',
    });
    const s = summarizePriceChanges([c('a', 'Ani', -1000, 2), c('b', 'Budi', 500, 1), c('a', 'Ani', -500, 4)]);
    expect(s).toMatchObject({ count: 3, lowered: 2, raised: 1, totalImpact: -2000 + 500 - 2000 });
    expect(s.byCashier).toEqual([{ cashierId: 'a', cashierName: 'Ani', count: 2, impact: -4000 }, { cashierId: 'b', cashierName: 'Budi', count: 1, impact: 500 }]);
    expect(summarizePriceChanges([])).toEqual({ count: 0, lowered: 0, raised: 0, totalImpact: 0, byCashier: [] });
  });
});

describe('listPriceChanges di data demo', () => {
  it('hanya baris yang harganya diubah, dengan dampak, kasir, dan filter rentang', async () => {
    const d = createFakeData({ now: () => new Date('2026-11-12T03:00:00.000Z') });
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const [p1, p2] = await d.listProducts();
    const draft = { id: newId(), type: 'takeaway' as const, items: [
      { id: newId(), productId: p1!.id, name: p1!.name, qty: 2, unitPrice: 20000, basePrice: 22000 },   // diturunkan
      { id: newId(), productId: p2!.id, name: p2!.name, qty: 1, unitPrice: 9000 },                      // tidak diubah
    ] };
    const o = await d.saveOrder(draft, 'e-sari');
    const all = await d.listPriceChanges({ from: '2026-11-12T00:00:00.000Z', to: '2026-11-13T00:00:00.000Z' });
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ orderId: o.id, orderNumber: o.number, itemName: p1!.name, qty: 2, basePrice: 22000, unitPrice: 20000, diff: -2000, diffPct: -9.1, lineImpact: -4000, cashierName: 'Sari', orderStatus: 'open' });
    expect(await d.listPriceChanges({ from: '2026-11-13T00:00:00.000Z', to: '2026-11-14T00:00:00.000Z' })).toEqual([]);
  });
  it('harga dasar sama dengan harga jual tidak dihitung perubahan', async () => {
    const d = createFakeData({ now: () => new Date('2026-11-12T03:00:00.000Z') });
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const [p1] = await d.listProducts();
    await d.saveOrder({ id: newId(), type: 'takeaway', items: [{ id: newId(), productId: p1!.id, name: p1!.name, qty: 1, unitPrice: 20000, basePrice: 20000 }] }, 'e-sari');
    expect(await d.listPriceChanges({ from: '2026-11-12T00:00:00.000Z', to: '2026-11-13T00:00:00.000Z' })).toEqual([]);
  });
});
