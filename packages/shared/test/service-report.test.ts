import { describe, expect, it } from 'vitest';
import type { Order, Product } from '../src/types';
import {
  buildServiceReport,
  buildServiceReportCsvRows,
  toServiceReportCsv,
} from '../src/service-report';

const mockProducts: Product[] = [
  {
    id: 'p-goods-1',
    name: 'Kopi Susu',
    categoryId: 'cat-drink',
    price: 18000,
    kind: 'goods',
    trackStock: true,
    isActive: true,
    isFavorite: true,
  },
  {
    id: 'p-service-1',
    name: 'Jasa Potong Rambut',
    sku: 'SRV-001',
    categoryId: 'cat-service',
    price: 45000,
    kind: 'service',
    trackStock: false,
    isActive: true,
    isFavorite: false,
  },
  {
    id: 'p-service-2',
    name: 'Cuci & Blow',
    sku: 'SRV-002',
    categoryId: 'cat-service',
    price: 30000,
    kind: 'service',
    trackStock: false,
    isActive: true,
    isFavorite: false,
  },
  {
    id: 'p-service-3',
    name: 'Pijat Relaksasi',
    sku: 'SRV-003',
    categoryId: 'cat-service',
    price: 60000,
    kind: 'service',
    trackStock: false,
    isActive: true,
    isFavorite: false,
  },
];

const mockOrders: Order[] = [
  {
    id: 'ord-1',
    number: 'ORD/001',
    type: 'dine_in',
    cashierId: 'c1',
    status: 'paid',
    openedAt: '2026-11-10T02:00:00Z',
    closedAt: '2026-11-10T02:30:00Z',
    items: [
      {
        id: 'item-1',
        productId: 'p-goods-1',
        name: 'Kopi Susu',
        qty: 2,
        unitPrice: 18000,
        lineTotal: 36000,
      },
      {
        id: 'item-2',
        productId: 'p-service-1',
        name: 'Jasa Potong Rambut',
        qty: 1,
        unitPrice: 45000,
        lineTotal: 45000,
      },
    ],
    subtotal: 81000,
    discountTotal: 0,
    serviceCharge: 0,
    taxTotal: 0,
    rounding: 0,
    total: 81000,
    paidTotal: 81000,
    payments: [],
  },
  {
    id: 'ord-2',
    number: 'ORD/002',
    type: 'dine_in',
    cashierId: 'c1',
    status: 'paid',
    openedAt: '2026-11-10T04:00:00Z',
    closedAt: '2026-11-10T04:45:00Z',
    items: [
      {
        id: 'item-3',
        productId: 'p-service-1',
        name: 'Jasa Potong Rambut',
        qty: 2,
        unitPrice: 45000,
        lineTotal: 90000,
      },
      {
        id: 'item-4',
        productId: 'p-service-2',
        name: 'Cuci & Blow',
        qty: 1,
        unitPrice: 30000,
        lineTotal: 30000,
      },
    ],
    subtotal: 120000,
    discountTotal: 0,
    serviceCharge: 0,
    taxTotal: 0,
    rounding: 0,
    total: 120000,
    paidTotal: 120000,
    payments: [],
  },
  {
    id: 'ord-3',
    number: 'ORD/003',
    type: 'takeaway',
    cashierId: 'c1',
    status: 'void',
    openedAt: '2026-11-10T05:00:00Z',
    closedAt: '2026-11-10T05:10:00Z',
    items: [
      {
        id: 'item-5',
        productId: 'p-service-3',
        name: 'Pijat Relaksasi',
        qty: 1,
        unitPrice: 60000,
        lineTotal: 60000,
      },
    ],
    subtotal: 60000,
    discountTotal: 0,
    serviceCharge: 0,
    taxTotal: 0,
    rounding: 0,
    total: 60000,
    paidTotal: 0,
    payments: [],
  },
  {
    id: 'ord-4',
    number: 'ORD/004',
    type: 'dine_in',
    cashierId: 'c2',
    status: 'paid',
    openedAt: '2026-11-11T03:00:00Z',
    closedAt: '2026-11-11T03:30:00Z',
    items: [
      {
        id: 'item-6',
        productId: 'p-service-2',
        name: 'Cuci & Blow',
        qty: 2,
        unitPrice: 30000,
        lineTotal: 60000,
      },
    ],
    subtotal: 60000,
    discountTotal: 0,
    serviceCharge: 0,
    taxTotal: 0,
    rounding: 0,
    total: 60000,
    paidTotal: 60000,
    payments: [],
  },
];

describe('service-report helper murni', () => {
  it('mengembalikan laporan kosong bila produk layanan tidak ditemukan', () => {
    const onlyGoods: Product[] = [mockProducts[0]!];
    const report = buildServiceReport(mockOrders, onlyGoods);

    expect(report.summary.totalRevenue).toBe(0);
    expect(report.summary.totalTransactions).toBe(0);
    expect(report.summary.totalQty).toBe(0);
    expect(report.summary.topService).toBeNull();
    expect(report.items).toHaveLength(0);
    expect(report.daily).toHaveLength(0);
  });

  it('menghitung agregasi transaksi, kuantitas, dan omset jasa dengan benar', () => {
    const report = buildServiceReport(mockOrders, mockProducts);

    // ord-1: Potong Rambut (qty 1, rev 45.000)
    // ord-2: Potong Rambut (qty 2, rev 90.000) + Cuci & Blow (qty 1, rev 30.000)
    // ord-3: void, diabaikan
    // ord-4: Cuci & Blow (qty 2, rev 60.000)
    // Total transaksi lunas dengan jasa: ord-1, ord-2, ord-4 = 3 transaksi
    expect(report.summary.totalTransactions).toBe(3);

    // Potong Rambut total: qty 3, rev 135.000
    // Cuci & Blow total: qty 3, rev 90.000
    // Total pendapatan jasa: 135.000 + 90.000 = 225.000
    expect(report.summary.totalRevenue).toBe(225000);
    expect(report.summary.totalQty).toBe(6);

    // Top service adalah Jasa Potong Rambut
    expect(report.summary.topService).toEqual({
      productId: 'p-service-1',
      name: 'Jasa Potong Rambut',
      qty: 3,
      revenue: 135000,
    });

    // Cek rincian per jasa
    expect(report.items).toHaveLength(2);
    const [topItem, secondItem] = report.items;

    expect(topItem).toMatchObject({
      productId: 'p-service-1',
      name: 'Jasa Potong Rambut',
      sku: 'SRV-001',
      qty: 3,
      revenue: 135000,
      avgPrice: 45000,
      percentOfTotal: 60, // 135.000 / 225.000 * 100
    });

    expect(secondItem).toMatchObject({
      productId: 'p-service-2',
      name: 'Cuci & Blow',
      sku: 'SRV-002',
      qty: 3,
      revenue: 90000,
      avgPrice: 30000,
      percentOfTotal: 40, // 90.000 / 225.000 * 100
    });
  });

  it('mengagregasi data harian berdasarkan tanggal order selesai', () => {
    const report = buildServiceReport(mockOrders, mockProducts);

    expect(report.daily).toHaveLength(2);
    // 2026-11-10: ord-1 (rev 45.000, qty 1) + ord-2 (rev 120.000, qty 3) => rev 165.000, qty 4, 2 orders
    expect(report.daily[0]).toMatchObject({
      date: '2026-11-10',
      revenue: 165000,
      orderCount: 2,
      qty: 4,
    });

    // 2026-11-11: ord-4 (rev 60.000, qty 2, 1 order)
    expect(report.daily[1]).toMatchObject({
      date: '2026-11-11',
      revenue: 60000,
      orderCount: 1,
      qty: 2,
    });
  });

  it('mendukung penyaringan tanggal (options from & to)', () => {
    const report = buildServiceReport(mockOrders, mockProducts, {
      from: '2026-11-11',
      to: '2026-11-11',
    });

    expect(report.summary.totalTransactions).toBe(1);
    expect(report.summary.totalRevenue).toBe(60000);
    expect(report.items).toHaveLength(1);
    expect(report.items[0]!.productId).toBe('p-service-2');
    expect(report.daily).toHaveLength(1);
    expect(report.daily[0]!.date).toBe('2026-11-11');
  });

  it('menghasilkan data CSV dan UTF-8 BOM yang valid', () => {
    const report = buildServiceReport(mockOrders, mockProducts);
    const rows = buildServiceReportCsvRows(report, '10 Nov - 11 Nov 2026');

    expect(rows[0]).toEqual(['LAPORAN PENJUALAN JASA']);
    expect(rows[1]).toEqual(['Periode: 10 Nov - 11 Nov 2026']);

    const csvString = toServiceReportCsv(report, '10 Nov - 11 Nov 2026');
    expect(csvString.startsWith('\uFEFF')).toBe(true);
    expect(csvString).toContain('Jasa Potong Rambut');
    expect(csvString).toContain('Cuci & Blow');
    expect(csvString).toContain('TOTAL');
  });
});

