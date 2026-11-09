import { describe, expect, it } from 'vitest';
import { buildSalesReport, createFakeData, toCsv } from '../src';

describe('laporan penjualan', () => {
  it('jumlah per kategori, jenis, kasir, dan hari konsisten dengan ringkasan', async () => {
    const d = createFakeData({ now: () => new Date('2026-11-09T09:00:00Z') }); d.reset();
    const [orders, products, categories, employees] = await Promise.all([d.listOrders({ status: 'paid', all: true, by: 'closed' }), d.listProducts({ includeInactive: true }), d.listCategories(), d.listEmployees()]);
    expect(orders.length).toBeGreaterThan(0);
    const r = buildSalesReport({ orders, products, categories, employees, timezone: 'Asia/Jakarta' });
    const total = orders.reduce((a, o) => a + o.total, 0);
    expect(r.summary.total).toBe(total);
    expect(r.byType.reduce((a, x) => a + x.amount, 0)).toBe(total);
    expect(r.byCashier.reduce((a, x) => a + x.amount, 0)).toBe(total);
    expect(r.byDay.reduce((a, x) => a + x.amount, 0)).toBe(total);
    expect(r.byCategory.reduce((a, x) => a + x.amount, 0)).toBe(orders.reduce((a, o) => a + o.items.reduce((b, i) => b + i.lineTotal, 0), 0));
    expect(r.byDay.map((x) => x.key)).toEqual([...r.byDay.map((x) => x.key)].sort());
  });
  it('pesanan belum lunas tidak dihitung', () => {
    const r = buildSalesReport({ orders: [{ id: '1', status: 'open', total: 5000, items: [], payments: [], type: 'takeaway', cashierId: 'x', openedAt: '2026-11-09T01:00:00Z' } as never], products: [], categories: [], employees: [], timezone: 'Asia/Jakarta' });
    expect(r.summary.orderCount).toBe(0);
  });
  it('CSV: pemisah titik koma, kutip, dan penangkal rumus', () => {
    const c = toCsv([['a;b', '=1+1', 'x"y'], [5, 'ok', '-2']]);
    expect(c).toBe('﻿"a;b";\'=1+1;"x""y"\r\n5;ok;\'-2');
  });
});
