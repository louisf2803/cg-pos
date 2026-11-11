import { describe, expect, it } from 'vitest';
import {
  getTopProducts,
  getTopLowestStock,
  getTopMinStock,
  getTopOrderTypes,
  type TopProductRow,
  type TopStockRow,
} from '../src/top-reports';
import type { Order, StockItem, ReportRow } from '../src';

describe('top-reports helper murni', () => {
  describe('getTopProducts', () => {
    it('mengembalikan array kosong jika tidak ada pesanan', () => {
      expect(getTopProducts([])).toEqual([]);
    });

    it('hanya menghitung pesanan dengan status paid', () => {
      const orders: Partial<Order>[] = [
        {
          id: 'o1',
          status: 'draft',
          total: 20000,
          items: [{ productId: 'p1', name: 'Kopi', qty: 2, price: 10000, lineTotal: 20000, extras: [] }],
        },
        {
          id: 'o2',
          status: 'void',
          total: 15000,
          items: [{ productId: 'p2', name: 'Teh', qty: 1, price: 15000, lineTotal: 15000, extras: [] }],
        },
        {
          id: 'o3',
          status: 'paid',
          total: 50000,
          items: [
            { productId: 'p1', name: 'Kopi', qty: 3, price: 10000, lineTotal: 30000, extras: [] },
            { productId: 'p3', name: 'Roti', qty: 1, price: 20000, lineTotal: 20000, extras: [] },
          ],
        },
      ];

      const res = getTopProducts(orders as Order[]);
      expect(res).toHaveLength(2);
      expect(res[0].name).toBe('Kopi');
      expect(res[0].qty).toBe(3);
      expect(res[0].totalSales).toBe(30000);
      expect(res[0].rank).toBe(1);
      expect(res[1].name).toBe('Roti');
      expect(res[1].rank).toBe(2);
    });

    it('mengelompokkan produk yang sama dari berbagai pesanan dan membatasi jumlah (limit)', () => {
      const orders: Partial<Order>[] = [
        {
          id: 'o1',
          status: 'paid',
          total: 100000,
          items: [
            { productId: 'p1', name: 'Kopi Susu', qty: 5, price: 10000, lineTotal: 50000, extras: [] },
            { productId: 'p2', name: 'Teh Tarik', qty: 2, price: 12000, lineTotal: 24000, extras: [] },
            { productId: 'p3', name: 'Croissant', qty: 1, price: 26000, lineTotal: 26000, extras: [] },
          ],
        },
        {
          id: 'o2',
          status: 'paid',
          total: 60000,
          items: [
            { productId: 'p1', name: 'Kopi Susu', qty: 3, price: 10000, lineTotal: 30000, extras: [] },
            { productId: 'p4', name: 'Donat', qty: 10, price: 3000, lineTotal: 30000, extras: [] },
          ],
        },
      ];

      // Donat: qty 10 (total 30000)
      // Kopi Susu: qty 8 (total 80000)
      // Teh Tarik: qty 2 (total 24000)
      // Croissant: qty 1 (total 26000)
      const res = getTopProducts(orders as Order[], 3);
      expect(res).toHaveLength(3);
      expect(res[0].productId).toBe('p4'); // Donat (qty 10)
      expect(res[0].rank).toBe(1);
      expect(res[1].productId).toBe('p1'); // Kopi (qty 8)
      expect(res[1].rank).toBe(2);
      expect(res[2].productId).toBe('p2'); // Teh (qty 2)
      expect(res[2].rank).toBe(3);
    });
  });

  describe('getTopLowestStock', () => {
    it('mengurutkan stok dari yang paling minus/rendah', () => {
      const stock: StockItem[] = [
        { productId: 's1', name: 'Biji Kopi Arabika', kind: 'ingredient', unit: 'gram', qty: 500, avgCost: 100, value: 50000, status: 'ok' },
        { productId: 's2', name: 'Susu Segar', kind: 'ingredient', unit: 'liter', qty: -2, avgCost: 18000, value: 0, status: 'negative' },
        { productId: 's3', name: 'Gula Pasir', kind: 'ingredient', unit: 'kg', qty: 0, avgCost: 14000, value: 0, status: 'out' },
        { productId: 's4', name: 'Cup Dingin 16oz', kind: 'ingredient', unit: 'pcs', qty: 15, avgCost: 500, value: 7500, status: 'low' },
      ];

      const res = getTopLowestStock(stock, 3);
      expect(res).toHaveLength(3);
      expect(res[0].name).toBe('Susu Segar'); // -2
      expect(res[0].rank).toBe(1);
      expect(res[1].name).toBe('Gula Pasir'); // 0
      expect(res[1].rank).toBe(2);
      expect(res[2].name).toBe('Cup Dingin 16oz'); // 15
      expect(res[2].rank).toBe(3);
    });
  });

  describe('getTopMinStock', () => {
    it('mengutamakan barang yang paling mendesak terhadap batas minimum', () => {
      const stock: StockItem[] = [
        { productId: 's1', name: 'Sirup Karamel', kind: 'ingredient', unit: 'botol', qty: 2, minQty: 10, avgCost: 80000, value: 160000, status: 'low' }, // diff = -8
        { productId: 's2', name: 'Susu Oat', kind: 'ingredient', unit: 'liter', qty: 5, minQty: 6, avgCost: 45000, value: 225000, status: 'low' }, // diff = -1
        { productId: 's3', name: 'Biji Kopi', kind: 'ingredient', unit: 'gram', qty: 1000, minQty: 200, avgCost: 150, value: 150000, status: 'ok' }, // diff = +800
        { productId: 's4', name: 'Tutup Cup', kind: 'ingredient', unit: 'pcs', qty: -5, minQty: 50, avgCost: 300, value: 0, status: 'negative' }, // diff = -55
      ];

      const res = getTopMinStock(stock);
      expect(res[0].name).toBe('Tutup Cup'); // -55
      expect(res[0].rank).toBe(1);
      expect(res[1].name).toBe('Sirup Karamel'); // -8
      expect(res[1].rank).toBe(2);
      expect(res[2].name).toBe('Susu Oat'); // -1
      expect(res[2].rank).toBe(3);
    });
  });

  describe('getTopOrderTypes', () => {
    it('mengelompokkan jenis pesanan dari Order[] dan mengurutkan berdasarkan nominal penjualan', () => {
      const orders: Partial<Order>[] = [
        { id: 'o1', status: 'paid', type: 'dine_in', total: 100000, items: [] },
        { id: 'o2', status: 'paid', type: 'takeaway', total: 150000, items: [] },
        { id: 'o3', status: 'paid', type: 'dine_in', total: 80000, items: [] },
        { id: 'o4', status: 'paid', type: 'delivery', total: 50000, items: [] },
      ];

      const res = getTopOrderTypes(orders as Order[]);
      expect(res).toHaveLength(3);
      expect(res[0].type).toBe('dine_in'); // 180000
      expect(res[0].count).toBe(2);
      expect(res[0].amount).toBe(180000);
      expect(res[0].rank).toBe(1);

      expect(res[1].type).toBe('takeaway'); // 150000
      expect(res[1].count).toBe(1);
      expect(res[1].amount).toBe(150000);
      expect(res[1].rank).toBe(2);

      expect(res[2].type).toBe('delivery'); // 50000
      expect(res[2].rank).toBe(3);
    });

    it('mendukung input dari ReportRow[]', () => {
      const reportRows: ReportRow[] = [
        { key: 'takeaway', label: 'Bawa pulang', count: 12, amount: 240000 },
        { key: 'dine_in', label: 'Makan di tempat', count: 25, amount: 650000 },
      ];

      const res = getTopOrderTypes(reportRows);
      expect(res[0].type).toBe('dine_in');
      expect(res[0].label).toBe('Makan di tempat');
      expect(res[0].rank).toBe(1);
      expect(res[1].type).toBe('takeaway');
      expect(res[1].rank).toBe(2);
    });
  });
});
