import { describe, expect, it } from 'vitest';
import { buildStaffReport } from '../src/staff-report';
import type { Order, Refund } from '../src/types';

describe('buildStaffReport', () => {
  const employees = [
    { id: 'emp-1', name: 'Budi Santoso', role: 'cashier' },
    { id: 'emp-2', name: 'Siti Rahma', role: 'manager' },
    { id: 'emp-3', name: 'Agus Pratama', role: 'cashier' },
  ];

  it('menghitung penjualan, transaksi, void, refund, diskon manual, dan komplimen per karyawan', () => {
    const orders: Order[] = [
      // Budi: 2 transaksi lunas, 1 diskon manual, 1 komplimen
      {
        id: 'ord-1',
        number: 'ORD-001',
        type: 'dine_in',
        status: 'paid',
        items: [],
        subtotal: 50000,
        discountTotal: 5000,
        serviceCharge: 0,
        taxTotal: 0,
        rounding: 0,
        total: 45000,
        paidTotal: 45000,
        payments: [{ id: 'p1', methodId: 'm1', methodName: 'Tunai', kind: 'cash', amount: 45000, change: 0, paidAt: '2026-11-10T10:00:00Z' }],
        discounts: [{ id: 'd1', source: 'manual', label: 'Diskon Manajer', amount: 5000, authorizedBy: 'Siti' }],
        openedAt: '2026-11-10T09:50:00Z',
        closedAt: '2026-11-10T10:00:00Z',
        cashierId: 'emp-1',
      },
      {
        id: 'ord-2',
        number: 'ORD-002',
        type: 'takeaway',
        status: 'paid',
        items: [],
        subtotal: 30000,
        discountTotal: 0,
        serviceCharge: 0,
        taxTotal: 0,
        rounding: 0,
        total: 30000,
        paidTotal: 30000,
        payments: [{ id: 'p2', methodId: 'm2', methodName: 'Gratis', kind: 'complimentary', amount: 30000, change: 0, paidAt: '2026-11-10T11:00:00Z', reference: 'Tamu VIP' }],
        openedAt: '2026-11-10T10:55:00Z',
        closedAt: '2026-11-10T11:00:00Z',
        cashierId: 'emp-1',
      },
      // Siti: 1 transaksi lunas
      {
        id: 'ord-3',
        number: 'ORD-003',
        type: 'dine_in',
        status: 'paid',
        items: [],
        subtotal: 100000,
        discountTotal: 0,
        serviceCharge: 0,
        taxTotal: 0,
        rounding: 0,
        total: 100000,
        paidTotal: 100000,
        payments: [{ id: 'p3', methodId: 'm1', methodName: 'Tunai', kind: 'cash', amount: 100000, change: 0, paidAt: '2026-11-10T12:00:00Z' }],
        openedAt: '2026-11-10T11:30:00Z',
        closedAt: '2026-11-10T12:00:00Z',
        cashierId: 'emp-2',
      },
      // Budi: 1 pesanan dibatalkan (void)
      {
        id: 'ord-4',
        number: 'ORD-004',
        type: 'dine_in',
        status: 'void',
        items: [],
        subtotal: 20000,
        discountTotal: 0,
        serviceCharge: 0,
        taxTotal: 0,
        rounding: 0,
        total: 20000,
        paidTotal: 0,
        payments: [],
        openedAt: '2026-11-10T12:15:00Z',
        closedAt: '2026-11-10T12:20:00Z',
        cashierId: 'emp-1',
      },
    ];

    const refunds: Refund[] = [
      {
        id: 'ref-1',
        number: 'REF-001',
        orderId: 'ord-1',
        total: 15000,
        reason: 'Salah menu',
        methodName: 'Tunai',
        createdAt: '2026-11-10T10:30:00Z',
        items: [{ orderItemId: 'it-1', qty: 1, amount: 15000 }],
      },
    ];

    const report = buildStaffReport({ orders, employees, refunds });

    // Siti harus di peringkat 1 karena total penjualan 100.000 > 75.000
    expect(report.rows[0].employeeId).toBe('emp-2');
    expect(report.rows[0].totalSales).toBe(100000);
    expect(report.rows[0].transactionCount).toBe(1);
    expect(report.rows[0].avgSalesPerTx).toBe(100000);
    expect(report.rows[0].voidCount).toBe(0);
    expect(report.rows[0].refundCount).toBe(0);

    // Budi di peringkat 2
    expect(report.rows[1].employeeId).toBe('emp-1');
    expect(report.rows[1].totalSales).toBe(75000);
    expect(report.rows[1].transactionCount).toBe(2);
    expect(report.rows[1].avgSalesPerTx).toBe(37500);
    expect(report.rows[1].voidCount).toBe(1);
    expect(report.rows[1].voidTotal).toBe(20000);
    expect(report.rows[1].refundCount).toBe(1);
    expect(report.rows[1].refundTotal).toBe(15000);
    expect(report.rows[1].manualDiscountCount).toBe(1);
    expect(report.rows[1].manualDiscountTotal).toBe(5000);
    expect(report.rows[1].complimentaryCount).toBe(1);
    expect(report.rows[1].complimentaryTotal).toBe(30000);

    // Agus (tanpa transaksi) tetap ada di peringkat 3 dengan nilai 0
    expect(report.rows[2].employeeId).toBe('emp-3');
    expect(report.rows[2].totalSales).toBe(0);
    expect(report.rows[2].transactionCount).toBe(0);
    expect(report.rows[2].avgSalesPerTx).toBe(0);

    // Totals
    expect(report.totals.transactionCount).toBe(3);
    expect(report.totals.totalSales).toBe(175000);
    expect(report.totals.avgSalesPerTx).toBe(Math.round(175000 / 3));
    expect(report.totals.voidCount).toBe(1);
    expect(report.totals.voidTotal).toBe(20000);
    expect(report.totals.refundCount).toBe(1);
    expect(report.totals.refundTotal).toBe(15000);
    expect(report.totals.manualDiscountCount).toBe(1);
    expect(report.totals.manualDiscountTotal).toBe(5000);
    expect(report.totals.complimentaryCount).toBe(1);
    expect(report.totals.complimentaryTotal).toBe(30000);
  });

  it('menangani data kosong dengan aman', () => {
    const report = buildStaffReport({ orders: [] });
    expect(report.totals.transactionCount).toBe(0);
    expect(report.totals.totalSales).toBe(0);
    expect(report.totals.avgSalesPerTx).toBe(0);
    expect(report.rows.length).toBe(0);
  });
});
