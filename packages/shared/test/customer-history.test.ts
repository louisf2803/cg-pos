import { describe, expect, it } from 'vitest';
import {
  computeCustomerOrderStats,
  filterCustomerOrders,
  formatOrderPaymentMethods,
  paginateOrders,
} from '../src/customer-history';
import type { Order } from '../src/types';

describe('Customer Order History Helper', () => {
  const dummyOrders: Order[] = [
    {
      id: 'o-1',
      number: 'ORD-0001',
      type: 'dine_in',
      customerId: 'cust-1',
      cashierId: 'cashier-1',
      status: 'paid',
      items: [],
      subtotal: 50000,
      discountTotal: 0,
      serviceCharge: 0,
      taxTotal: 0,
      rounding: 0,
      total: 50000,
      paidTotal: 50000,
      payments: [{ id: 'p-1', orderId: 'o-1', methodId: 'm-1', methodName: 'Tunai', kind: 'cash', amount: 50000, paidAt: '2026-11-01T10:00:00Z' }],
      openedAt: '2026-11-01T09:50:00Z',
      closedAt: '2026-11-01T10:00:00Z',
    },
    {
      id: 'o-2',
      number: 'ORD-0002',
      type: 'take_away',
      customerId: 'cust-1',
      cashierId: 'cashier-1',
      status: 'paid',
      items: [],
      subtotal: 75000,
      discountTotal: 0,
      serviceCharge: 0,
      taxTotal: 0,
      rounding: 0,
      total: 75000,
      paidTotal: 75000,
      payments: [
        { id: 'p-2', orderId: 'o-2', methodId: 'm-2', methodName: 'QRIS', kind: 'qris', amount: 75000, paidAt: '2026-11-05T12:00:00Z' },
      ],
      openedAt: '2026-11-05T11:55:00Z',
      closedAt: '2026-11-05T12:00:00Z',
    },
    {
      id: 'o-3',
      number: 'ORD-0003',
      type: 'dine_in',
      customerId: 'cust-1',
      cashierId: 'cashier-1',
      status: 'void',
      items: [],
      subtotal: 30000,
      discountTotal: 0,
      serviceCharge: 0,
      taxTotal: 0,
      rounding: 0,
      total: 30000,
      paidTotal: 0,
      payments: [],
      openedAt: '2026-11-06T15:00:00Z',
    },
    {
      id: 'o-4',
      number: 'ORD-0004',
      type: 'dine_in',
      customerId: 'cust-2',
      cashierId: 'cashier-1',
      status: 'paid',
      items: [],
      subtotal: 100000,
      discountTotal: 0,
      serviceCharge: 0,
      taxTotal: 0,
      rounding: 0,
      total: 100000,
      paidTotal: 100000,
      payments: [{ id: 'p-4', orderId: 'o-4', methodId: 'm-1', methodName: 'Tunai', kind: 'cash', amount: 100000, paidAt: '2026-11-07T12:00:00Z' }],
      openedAt: '2026-11-07T12:00:00Z',
      closedAt: '2026-11-07T12:10:00Z',
    },
  ];

  it('menghitung statistik pesanan pelanggan dengan tepat', () => {
    const stats = computeCustomerOrderStats(dummyOrders, 'cust-1');
    expect(stats.paidCount).toBe(2);
    expect(stats.totalSpend).toBe(125000);
    expect(stats.voidCount).toBe(1);
    expect(stats.lastOrderDate).toBe('2026-11-06T15:00:00Z');
  });

  it('menyaring pesanan berdasarkan pelanggan, nomor pesanan, dan status', () => {
    // Saring hanya untuk cust-1
    const cust1Orders = filterCustomerOrders(dummyOrders, 'cust-1');
    expect(cust1Orders).toHaveLength(3);

    // Filter status 'paid'
    const paidOnly = filterCustomerOrders(dummyOrders, 'cust-1', '', 'paid');
    expect(paidOnly).toHaveLength(2);
    expect(paidOnly.map((o) => o.number)).toEqual(['ORD-0001', 'ORD-0002']);

    // Filter status 'void'
    const voidOnly = filterCustomerOrders(dummyOrders, 'cust-1', '', 'void');
    expect(voidOnly).toHaveLength(1);
    expect(voidOnly[0]?.number).toBe('ORD-0003');

    // Filter teks pencarian nomor
    const searchMatch = filterCustomerOrders(dummyOrders, 'cust-1', '0002');
    expect(searchMatch).toHaveLength(1);
    expect(searchMatch[0]?.number).toBe('ORD-0002');
  });

  it('membagi halaman (pagination) pesanan dengan benar', () => {
    const items = ['1', '2', '3', '4', '5', '6', '7'];
    const p1 = paginateOrders(items, 1, 3);
    expect(p1.items).toEqual(['1', '2', '3']);
    expect(p1.totalPages).toBe(3);
    expect(p1.currentPage).toBe(1);
    expect(p1.totalCount).toBe(7);

    const p3 = paginateOrders(items, 3, 3);
    expect(p3.items).toEqual(['7']);
    expect(p3.currentPage).toBe(3);

    // Halaman melebihi batas
    const pOverflow = paginateOrders(items, 99, 3);
    expect(pOverflow.currentPage).toBe(3);
    expect(pOverflow.items).toEqual(['7']);
  });

  it('memformat metode pembayaran menjadi ringkas tanpa duplikasi', () => {
    const orderWithMultiplePayments = {
      ...dummyOrders[0]!,
      payments: [
        { id: '1', orderId: 'o', methodId: 'm1', methodName: 'Tunai', kind: 'cash' as const, amount: 20000, paidAt: '2026-11-01' },
        { id: '2', orderId: 'o', methodId: 'm2', methodName: 'BCA QRIS', kind: 'qris' as const, amount: 30000, paidAt: '2026-11-01' },
      ],
    };
    expect(formatOrderPaymentMethods(orderWithMultiplePayments)).toBe('Tunai, BCA QRIS');

    const emptyOrder = { ...dummyOrders[0]!, payments: [] };
    expect(formatOrderPaymentMethods(emptyOrder)).toBe('—');
  });
});

