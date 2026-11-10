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

describe('laporan: refund dan pembatalan', () => {
  it('penjualan bersih = penjualan - refund; kontrol menghitung refund per alasan dan pesanan batal', () => {
    const paid = (id: string, total: number) => ({ id, number: id, type: 'takeaway', status: 'paid', items: [], subtotal: total, discountTotal: 0, serviceCharge: 0, taxTotal: 0, rounding: 0, total, paidTotal: total, payments: [], openedAt: '2026-11-10T03:00:00Z', closedAt: '2026-11-10T03:05:00Z', cashierId: 'e1' }) as never;
    const refund = (id: string, total: number, reason: string) => ({ id, number: id, orderId: 'a', total, reason, methodName: 'Tunai', createdAt: '2026-11-10T04:00:00Z', items: [] });
    const r = buildSalesReport({
      orders: [paid('a', 50000), paid('b', 30000)], products: [], categories: [], employees: [], timezone: 'Asia/Jakarta',
      refunds: [refund('r1', 10000, 'Pesanan salah'), refund('r2', 5000, 'pesanan salah')],
      voided: [{ ...paid('c', 20000), status: 'void' } as never],
    });
    expect(r.summary.total).toBe(80000);
    expect(r.control).toMatchObject({ refundCount: 2, refundTotal: 15000, net: 65000, voidCount: 1, voidTotal: 20000 });
    expect(r.control.byReason).toEqual([{ key: 'pesanan salah', label: 'Pesanan salah', count: 2, amount: 15000 }]);
  });
});

describe('laporan: komplimen', () => {
  it('mengumpulkan pembayaran gratis dengan alasan, terbaru dulu; tanpa alasan diberi penanda', () => {
    const order = (id: string, at: string, payments: unknown[]) => ({ id, number: id, type: 'takeaway', status: 'paid', items: [], subtotal: 25000, discountTotal: 0, serviceCharge: 0, taxTotal: 0, rounding: 0, total: 25000, paidTotal: 25000, payments, openedAt: at, closedAt: at, cashierId: 'e1' }) as never;
    const pay = (kind: string, amount: number, paidAt: string, reference?: string) => ({ id: 'p' + paidAt, methodId: 'm', methodName: kind, kind, amount, change: 0, paidAt, reference });
    const r = buildSalesReport({
      orders: [
        order('a', '2026-11-10T03:00:00Z', [pay('complimentary', 25000, '2026-11-10T03:00:00Z', 'Uji rasa · disetujui Sari')]),
        order('b', '2026-11-10T05:00:00Z', [pay('cash', 25000, '2026-11-10T05:00:00Z')]),
        order('c', '2026-11-10T06:00:00Z', [pay('complimentary', 10000, '2026-11-10T06:00:00Z')]),
      ],
      products: [], categories: [], employees: [], timezone: 'Asia/Jakarta',
    });
    expect(r.complimentary.count).toBe(2);
    expect(r.complimentary.total).toBe(35000);
    expect(r.complimentary.rows.map((x) => x.number)).toEqual(['c', 'a']);
    expect(r.complimentary.rows[0].reason).toBe('(tanpa alasan)');
    expect(r.complimentary.rows[1].reason).toBe('Uji rasa · disetujui Sari');
  });
});

describe('laporan pajak dan biaya layanan', () => {
  it('menjumlahkan per hari dan jenis order dari pesanan lunas saja', async () => {
    const { buildTaxReport } = await import('../src');
    const o = (id: string, type: string, status: string, at: string, subtotal: number, discountTotal: number, serviceCharge: number, taxTotal: number, rounding: number, total: number) =>
      ({ id, type, status, closedAt: at, openedAt: at, subtotal, discountTotal, serviceCharge, taxTotal, rounding, total, items: [], payments: [] }) as unknown as import('../src').Order;
    const r = buildTaxReport([
      o('1', 'dine_in', 'paid', '2026-11-09T03:00:00Z', 100000, 10000, 4500, 9450, 50, 104000),
      o('2', 'takeaway', 'paid', '2026-11-09T05:00:00Z', 50000, 0, 0, 5000, 0, 55000),
      o('3', 'dine_in', 'paid', '2026-11-10T03:00:00Z', 20000, 0, 0, 2000, 0, 22000),
      o('4', 'dine_in', 'void', '2026-11-10T04:00:00Z', 99000, 0, 0, 9900, 0, 108900),
    ], 'Asia/Jakarta');
    expect(r.totals).toMatchObject({ count: 3, afterDiscount: 160000, serviceCharge: 4500, tax: 16450, rounding: 50, total: 181000 });
    expect(r.byDay.map((d) => [d.key, d.count, d.tax])).toEqual([['2026-11-09', 2, 14450], ['2026-11-10', 1, 2000]]);
    expect(r.byType[0]).toMatchObject({ label: 'Makan di tempat', count: 2, total: 126000 });
    expect(buildTaxReport([], 'Asia/Jakarta').totals.count).toBe(0);
  });
});

describe('laporan meja', () => {
  it('mengelompokkan per meja dan lantai, tamu, rata-rata, dan pesanan tanpa meja', async () => {
    const { buildTableReport } = await import('../src');
    const o = (id: string, total: number, tableId?: string, guestCount?: number) => ({ id, status: 'paid', total, tableId, guestCount } as never);
    const tables = [{ id: 't1', floorId: 'f1', name: 'A1', sort: 1 }, { id: 't2', floorId: 'f1', name: 'A2', sort: 2 }, { id: 't3', floorId: null, name: 'Teras', sort: 3 }];
    const r = buildTableReport([o('1', 100000, 't1', 4), o('2', 50000, 't1', 2), o('3', 30000, 't2', 1), o('4', 20000), o('5', 10000, 'hilang', 1), { id: 'x', status: 'void', total: 999999, tableId: 't1', guestCount: 9 } as never], tables, [{ id: 'f1', name: 'Lantai 1', sort: 1 }]);
    expect(r.rows.map((x) => x.total)).toEqual([...r.rows.map((x) => x.total)].sort((a, b) => b - a));
    expect(r.rows[0]).toMatchObject({ label: 'A1', visits: 2, guests: 6, total: 150000, avgPerVisit: 75000, avgPerGuest: 25000 });
    expect(r.byFloor.find((x) => x.label === 'Lantai 1')).toMatchObject({ visits: 3, total: 180000 });
    expect(r.rows.find((x) => x.key === 'none')).toMatchObject({ visits: 1, guests: 0, avgPerGuest: null });
    expect(r.rows.find((x) => x.key === 'hilang')!.label).toBe('Meja dihapus');
    expect(r.totals).toMatchObject({ visits: 5, total: 210000 });
    expect(buildTableReport([], tables, []).totals.visits).toBe(0);
  });
});
