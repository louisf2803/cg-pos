import { describe, expect, it } from 'vitest';
import {
  buildProductPeakHours,
  buildSalesHeatmap,
  buildStockTurnoverReport,
} from '../src/analysis';
import type { StockItem } from '../src/stock';
import type { Order } from '../src/types';

describe('buildProductPeakHours', () => {
  it('menghitung matriks produk x jam untuk 10 produk teratas', () => {
    const orders: Order[] = [
      {
        id: 'ord-1',
        number: 'ORD-01',
        type: 'dine_in',
        status: 'paid',
        items: [
          { productId: 'p-kopi', name: 'Kopi Susu', qty: 3, unitPrice: 15000, lineTotal: 45000 },
          { productId: 'p-roti', name: 'Roti Bakar', qty: 1, unitPrice: 20000, lineTotal: 20000 },
        ],
        subtotal: 65000,
        discountTotal: 0,
        serviceCharge: 0,
        taxTotal: 0,
        rounding: 0,
        total: 65000,
        paidTotal: 65000,
        payments: [],
        openedAt: '2026-11-10T08:15:00Z',
        closedAt: '2026-11-10T08:30:00Z', // Jam 15:30 WIB (UTC+7)
        cashierId: 'e1',
      },
      {
        id: 'ord-2',
        number: 'ORD-02',
        type: 'takeaway',
        status: 'paid',
        items: [
          { productId: 'p-kopi', name: 'Kopi Susu', qty: 2, unitPrice: 15000, lineTotal: 30000 },
        ],
        subtotal: 30000,
        discountTotal: 0,
        serviceCharge: 0,
        taxTotal: 0,
        rounding: 0,
        total: 30000,
        paidTotal: 30000,
        payments: [],
        openedAt: '2026-11-10T08:40:00Z',
        closedAt: '2026-11-10T08:50:00Z', // Jam 15:50 WIB (UTC+7)
        cashierId: 'e1',
      },
    ];

    const report = buildProductPeakHours({ orders, timezone: 'Asia/Jakarta' });
    expect(report.topProducts.length).toBe(2);

    // Kopi Susu teratas dengan 5 item terjual
    const kopi = report.topProducts[0];
    expect(kopi.productId).toBe('p-kopi');
    expect(kopi.totalQty).toBe(5);
    expect(kopi.totalAmount).toBe(75000);
    expect(kopi.peakHour).toBe(15);
    expect(kopi.peakHourQty).toBe(5);
    expect(kopi.cells[15].qty).toBe(5);
    expect(kopi.cells[15].intensity).toBe(1);

    // Jam lain bernilai 0
    expect(kopi.cells[10].qty).toBe(0);
    expect(kopi.cells[10].intensity).toBe(0);

    // Roti Bakar
    const roti = report.topProducts[1];
    expect(roti.productId).toBe('p-roti');
    expect(roti.totalQty).toBe(1);
    expect(roti.cells[15].qty).toBe(1);
    expect(roti.cells[15].intensity).toBe(0.2); // 1 / 5 = 0.2
  });

  it('menangani daftar order kosong dengan aman', () => {
    const report = buildProductPeakHours({ orders: [] });
    expect(report.topProducts.length).toBe(0);
    expect(report.overallMaxQty).toBe(0);
    expect(report.hourlyTotals.length).toBe(24);
  });
});

describe('buildSalesHeatmap', () => {
  it('mengagregasi transaksi ke dalam matriks 7 hari x 24 jam dengan intensitas warna', () => {
    const orders: Order[] = [
      {
        id: 'ord-1',
        number: 'ORD-01',
        type: 'dine_in',
        status: 'paid',
        items: [],
        subtotal: 50000,
        discountTotal: 0,
        serviceCharge: 0,
        taxTotal: 0,
        rounding: 0,
        total: 50000,
        paidTotal: 50000,
        payments: [],
        openedAt: '2026-11-10T03:00:00Z',
        closedAt: '2026-11-10T03:15:00Z', // 2026-11-10 adalah Selasa (dayOfWeek: 2), jam 10 WIB
        cashierId: 'e1',
      },
      {
        id: 'ord-2',
        number: 'ORD-02',
        type: 'takeaway',
        status: 'paid',
        items: [],
        subtotal: 75000,
        discountTotal: 0,
        serviceCharge: 0,
        taxTotal: 0,
        rounding: 0,
        total: 75000,
        paidTotal: 75000,
        payments: [],
        openedAt: '2026-11-10T03:30:00Z',
        closedAt: '2026-11-10T03:45:00Z', // Selasa, jam 10 WIB
        cashierId: 'e1',
      },
    ];

    const report = buildSalesHeatmap(orders, 'Asia/Jakarta');
    expect(report.days.length).toBe(7);
    expect(report.overallTotals.count).toBe(2);
    expect(report.overallTotals.total).toBe(125000);
    expect(report.maxCount).toBe(2);

    const selasa = report.days.find((d) => d.dayOfWeek === 2);
    expect(selasa).toBeDefined();
    expect(selasa?.totalCount).toBe(2);
    expect(selasa?.totalSales).toBe(125000);

    const cell10 = selasa?.cells[10];
    expect(cell10?.count).toBe(2);
    expect(cell10?.total).toBe(125000);
    expect(cell10?.intensity).toBe(1);

    expect(report.peakCell?.dayOfWeek).toBe(2);
    expect(report.peakCell?.hour).toBe(10);
  });

  it('menangani data kosong', () => {
    const report = buildSalesHeatmap([], 'Asia/Jakarta');
    expect(report.days.length).toBe(7);
    expect(report.maxCount).toBe(0);
    expect(report.peakCell).toBeNull();
  });
});

describe('buildStockTurnoverReport', () => {
  it('menghitung rasio perputaran stok, hari persediaan, dan status fast/slow/dead', () => {
    const stockItems: StockItem[] = [
      {
        productId: 'p-1',
        name: 'Susu UHT 1L',
        kind: 'goods',
        unit: 'kotak',
        qty: 10,
        avgCost: 18000,
        value: 180000,
        status: 'ok',
      },
      {
        productId: 'p-2',
        name: 'Kopi Biji Arabika',
        kind: 'ingredient',
        unit: 'kg',
        qty: 20,
        avgCost: 150000,
        value: 3000000,
        status: 'ok',
      },
      {
        productId: 'p-3',
        name: 'Sirup Karamel',
        kind: 'ingredient',
        unit: 'botol',
        qty: 5,
        avgCost: 80000,
        value: 400000,
        status: 'ok',
      },
    ];

    const orders: Order[] = [
      // Susu terjual 40 kotak dalam 30 hari -> Fast moving
      {
        id: 'ord-1',
        number: 'ORD-01',
        type: 'takeaway',
        status: 'paid',
        items: [{ productId: 'p-1', name: 'Susu UHT 1L', qty: 40, unitPrice: 22000, lineTotal: 880000 }],
        subtotal: 880000,
        discountTotal: 0,
        serviceCharge: 0,
        taxTotal: 0,
        rounding: 0,
        total: 880000,
        paidTotal: 880000,
        payments: [],
        openedAt: '2026-11-10T00:00:00Z',
        cashierId: 'e1',
      },
      // Kopi terjual 5 kg dalam 30 hari -> Slow moving
      {
        id: 'ord-2',
        number: 'ORD-02',
        type: 'dine_in',
        status: 'paid',
        items: [{ productId: 'p-2', name: 'Kopi Biji Arabika', qty: 5, unitPrice: 200000, lineTotal: 1000000 }],
        subtotal: 1000000,
        discountTotal: 0,
        serviceCharge: 0,
        taxTotal: 0,
        rounding: 0,
        total: 1000000,
        paidTotal: 1000000,
        payments: [],
        openedAt: '2026-11-10T00:00:00Z',
        cashierId: 'e1',
      },
      // Sirup Karamel terjual 0 -> Dead stock
    ];

    const report = buildStockTurnoverReport({ stockItems, orders, periodDays: 30 });

    expect(report.summary.totalItems).toBe(3);
    expect(report.summary.fastMovingCount).toBe(1);
    expect(report.summary.slowMovingCount).toBe(1);
    expect(report.summary.deadStockCount).toBe(1);

    // Item 1: Susu UHT
    const susu = report.rows.find((r) => r.productId === 'p-1')!;
    expect(susu.soldQty).toBe(40);
    // avgStock = 10 + 40/2 = 30
    expect(susu.avgStock).toBe(30);
    // turnoverRatio = 40 / 30 = 1.33... (or fast/normal)
    expect(susu.turnoverRatio).toBe(1.33);
    expect(susu.status).toBe('fast_moving');
    expect(susu.daysOfInventory).toBe(23); // (30 / 40) * 30 = 22.5 -> 23 hari

    // Item 3: Sirup Karamel (0 terjual)
    const sirup = report.rows.find((r) => r.productId === 'p-3')!;
    expect(sirup.soldQty).toBe(0);
    expect(sirup.turnoverRatio).toBe(0);
    expect(sirup.daysOfInventory).toBeNull();
    expect(sirup.status).toBe('dead_stock');
    expect(sirup.statusLabel).toBe('Macet (Dead)');
  });
});
