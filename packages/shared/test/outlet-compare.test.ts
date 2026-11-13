import { describe, expect, it } from 'vitest';
import { barPercents, comparisonRow, fakeOutletComparison } from '../src/outlet-compare';

const row = (name: string, sales: number, orders: number, cogs: number) => comparisonRow({ outletId: name, name, sales, orders, cogs, topProducts: [] });

describe('perbandingan outlet', () => {
  it('menghitung rata-rata per transaksi, margin, dan persen margin', () => {
    expect(row('A', 1000000, 40, 400000)).toMatchObject({ avgTicket: 25000, margin: 600000, marginPct: 60 });
  });
  it('tanpa transaksi: rata-rata dan persen 0, bukan NaN', () => {
    expect(row('B', 0, 0, 0)).toMatchObject({ avgTicket: 0, margin: 0, marginPct: 0 });
  });
  it('batang relatif terhadap yang terbesar; negatif jadi 0', () => {
    const rows = [row('A', 1000, 1, 0), row('B', 500, 1, 0), row('C', 0, 0, 100)];
    expect(barPercents(rows, 'sales')).toEqual([100, 50, 0]);
    expect(barPercents(rows, 'margin')).toEqual([100, 50, 0]);
    expect(barPercents([row('Z', 0, 0, 0)], 'sales')).toEqual([0]);
  });
  it('mode demo: satu outlet dari ringkasan penjualan', async () => {
    const s = { orderCount: 2, total: 50000, topProducts: [{ productId: 'p', name: 'Kopi', qty: 3, amount: 45000 }] } as never;
    const r = await fakeOutletComparison({ id: 'o', name: 'Pusat' }, { from: 'a', to: 'b' }, async () => s);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: 'Pusat', sales: 50000, avgTicket: 25000 });
    expect(r[0]!.topProducts[0]).toMatchObject({ name: 'Kopi', qty: 3 });
  });
});
