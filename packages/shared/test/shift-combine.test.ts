import { describe, expect, it } from 'vitest';
import { buildShiftReport, combineShiftReports, createFakeData } from '../src';

const shift = (id: string, status: 'open' | 'closed', extra = {}) => ({ id, cashierId: 'c', openedAt: '2026-11-10T01:00:00Z', openingCash: 100000, status, ...extra });
const rep = (id: string, status: 'open' | 'closed', amount: number, counted?: number) => buildShiftReport({
  shift: shift(id, status), payments: [{ methodName: 'Tunai', kind: 'cash', amount }, { methodName: 'QRIS', kind: 'gateway', amount: 5000 }],
  cashIn: 0, cashOut: 0, cashRefunds: 0, paidOrderCount: 2, soldLines: [{ productId: 'p', name: 'Kopi', qty: 2, amount }],
}, counted);

describe('combineShiftReports', () => {
  it('menjumlah dua shift tertutup dan menandai siap ditutup', () => {
    const c = combineShiftReports([rep('a', 'closed', 50000, 150000), rep('b', 'closed', 30000, 125000)]);
    expect(c.canClose).toBe(true);
    expect(c.orderCount).toBe(4);
    expect(c.cashSales).toBe(80000);
    expect(c.byMethod.find((m) => m.methodName === 'Tunai')).toMatchObject({ count: 2, amount: 80000 });
    expect(c.productsSold).toEqual([{ productId: 'p', name: 'Kopi', qty: 4, amount: 80000 }]);
    // shift a: seharusnya 150.000, hitung 150.000 -> 0; shift b: seharusnya 130.000, hitung 125.000 -> -5.000
    expect(c.variance).toBe(-5000);
  });
  it('belum bisa tutup toko bila masih ada shift terbuka, dan selisihnya tidak ikut', () => {
    const c = combineShiftReports([rep('a', 'closed', 50000, 140000), rep('b', 'open', 30000)]);
    expect(c.openCount).toBe(1);
    expect(c.canClose).toBe(false);
    expect(c.variance).toBe(-10000);
  });
  it('tanpa shift tidak bisa ditutup', () => {
    expect(combineShiftReports([]).canClose).toBe(false);
  });
});

describe('listShiftReports (data palsu)', () => {
  it('memuat shift contoh dengan nama kasir dan selisih -5.000', async () => {
    const d = createFakeData({ kitchenDemo: true });
    const rows = await d.listShiftReports({ from: '2000-01-01T00:00:00Z', to: '2100-01-01T00:00:00Z' });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const closed = rows.find((r) => r.shift.status === 'closed')!;
    expect(closed.cashierName).toBe('Sari');
    expect(closed.variance).toBe(-5000);
    expect(rows.some((r) => r.shift.status === 'open' && r.cashierName === 'Budi')).toBe(true);
  });
});
