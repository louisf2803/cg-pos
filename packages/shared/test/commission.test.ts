import { describe, expect, it } from 'vitest';
import {
  commissionGroupProblem,
  computeCommissionReport,
  type CommissionGroup,
} from '../src/commission';
import type { Employee, Order, Product } from '../src/types';

const EMPLOYEES: Employee[] = [
  { id: 'e1', name: 'Ayu Barista', role: 'cashier' },
  { id: 'e2', name: 'Bima Kasir', role: 'cashier' },
];

const PRODUCTS: Pick<Product, 'id' | 'categoryId'>[] = [
  { id: 'p-kopi', categoryId: 'cat-minuman' },
  { id: 'p-roti', categoryId: 'cat-makanan' },
  { id: 'p-air', categoryId: 'cat-lain' },
];

function makeOrder(id: string, cashierId: string, items: { productId: string; qty: number; lineTotal: number }[], status: Order['status'] = 'paid'): Order {
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  return {
    id,
    number: `ORD/${id}`,
    type: 'dine_in',
    cashierId,
    status,
    items: items.map((i, idx) => ({
      id: `${id}-${idx}`,
      productId: i.productId,
      name: i.productId,
      qty: i.qty,
      unitPrice: Math.round(i.lineTotal / i.qty),
      lineTotal: i.lineTotal,
    })),
    subtotal,
    discountTotal: 0,
    serviceCharge: 0,
    taxTotal: 0,
    rounding: 0,
    total: subtotal,
    paidTotal: subtotal,
    payments: [],
    openedAt: '2026-11-11T03:00:00Z',
  };
}

describe('commission helpers', () => {
  it('validates percent and fixed commission rates', () => {
    expect(
      commissionGroupProblem({ name: '', rateType: 'percent', rateValue: 5 }),
    ).toBe('Nama grup komisi wajib diisi.');
    expect(
      commissionGroupProblem({ name: 'Barista', rateType: 'percent', rateValue: 120 }),
    ).toBe('Tarif persen komisi maksimal 100%.');
    expect(
      commissionGroupProblem({ name: 'Per Item', rateType: 'fixed', rateValue: 1500.5 }),
    ).toBe('Tarif nominal per item harus berupa bilangan bulat rupiah.');
    expect(
      commissionGroupProblem({ name: 'Barista', rateType: 'percent', rateValue: 5 }),
    ).toBeNull();
  });

  it('computes percentage commission, fixed per-item commission, and 0 for unmatched products', () => {
    const groups: CommissionGroup[] = [
      {
        id: 'g-pct',
        name: 'Komisi Minuman 10%',
        rateType: 'percent',
        rateValue: 10,
        employeeIds: ['e1'],
        categoryIds: ['cat-minuman'],
        productIds: [],
        isActive: true,
      },
      {
        id: 'g-fix',
        name: 'Komisi Roti Rp2rb/pcs',
        rateType: 'fixed',
        rateValue: 2000,
        employeeIds: ['e2'],
        categoryIds: [],
        productIds: ['p-roti'],
        isActive: true,
      },
      {
        id: 'g-off',
        name: 'Grup Nonaktif',
        rateType: 'percent',
        rateValue: 50,
        employeeIds: ['e1', 'e2'],
        categoryIds: ['cat-lain'],
        productIds: ['p-air'],
        isActive: false,
      },
    ];

    const orders: Order[] = [
      makeOrder('1', 'e1', [
        { productId: 'p-kopi', qty: 2, lineTotal: 50000 }, // matched percent: 5.000
        { productId: 'p-air', qty: 3, lineTotal: 30000 }, // not in any active group: 0
      ]),
      makeOrder('2', 'e2', [
        { productId: 'p-roti', qty: 4, lineTotal: 80000 }, // matched fixed: 4 * 2.000 = 8.000
        { productId: 'p-kopi', qty: 1, lineTotal: 25000 }, // g-pct is only for e1: 0
      ]),
      makeOrder('3', 'e1', [
        { productId: 'p-kopi', qty: 10, lineTotal: 250000 }, // void order ignored!
      ], 'void'),
    ];

    const report = computeCommissionReport({
      groups,
      orders,
      employees: EMPLOYEES,
      products: PRODUCTS,
    });

    expect(report.totalCommission).toBe(13000);
    expect(report.totalMatchedSales).toBe(130000);
    expect(report.totalMatchedQty).toBe(6);

    const bima = report.rows.find((r) => r.employeeId === 'e2');
    const ayu = report.rows.find((r) => r.employeeId === 'e1');
    expect(bima?.commissionTotal).toBe(8000);
    expect(bima?.matchedQty).toBe(4);
    expect(ayu?.commissionTotal).toBe(5000);
    expect(ayu?.matchedSalesTotal).toBe(50000);
  });

  it('gives 0 commission when product is excluded from all groups', () => {
    const report = computeCommissionReport({
      groups: [
        {
          id: 'g1',
          name: 'Kosong Produk',
          rateType: 'percent',
          rateValue: 10,
          employeeIds: ['e1'],
          categoryIds: [],
          productIds: [],
          isActive: true,
        },
      ],
      orders: [makeOrder('o1', 'e1', [{ productId: 'p-air', qty: 2, lineTotal: 40000 }])],
      employees: EMPLOYEES,
      products: PRODUCTS,
    });
    expect(report.totalCommission).toBe(0);
    expect(report.totalMatchedSales).toBe(0);
  });
});

