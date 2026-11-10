import { describe, expect, it } from 'vitest';
import {
  buildNonCashReconciliation,
  buildReconcileCsv,
  computeReconcileDiff,
  isNonCashPayment,
} from '../src/reconcile';
import type { Order, PaymentMethod } from '../src/types';

describe('reconcile (rekonsiliasi penerimaan non-tunai)', () => {
  const paymentMethods: PaymentMethod[] = [
    { id: 'm-cash', code: 'CASH', name: 'Tunai', kind: 'cash', requiresOnline: false },
    { id: 'm-qris', code: 'QRIS', name: 'QRIS Statis', kind: 'gateway', requiresOnline: false },
    { id: 'm-debit', code: 'DEBIT', name: 'Kartu Debit BCA', kind: 'noncash', requiresOnline: false },
    { id: 'm-free', code: 'FREE', name: 'Komplimen', kind: 'complimentary', requiresOnline: false },
  ];

  it('isNonCashPayment membedakan tunai/gratis dengan non-tunai', () => {
    expect(isNonCashPayment({ kind: 'cash', methodName: 'Tunai' })).toBe(false);
    expect(isNonCashPayment({ kind: 'complimentary', methodName: 'Gratis/Komplimen' })).toBe(false);
    expect(isNonCashPayment({ kind: 'gateway', methodName: 'QRIS' })).toBe(true);
    expect(isNonCashPayment({ kind: 'noncash', methodName: 'Debit BCA' })).toBe(true);
    expect(isNonCashPayment({ kind: 'deposit', methodName: 'Deposit Pelanggan' })).toBe(true);
  });

  it('computeReconcileDiff menghitung selisih dan status dengan tepat', () => {
    // Belum diisi
    expect(computeReconcileDiff(50000, undefined)).toEqual({
      diff: undefined,
      status: 'unentered',
    });

    // Cocok (selisih 0)
    expect(computeReconcileDiff(100000, 100000)).toEqual({
      diff: 0,
      status: 'matched',
    });

    // Selisih kurang di bank
    expect(computeReconcileDiff(100000, 95000)).toEqual({
      diff: -5000,
      status: 'mismatch',
    });

    // Selisih lebih di bank
    expect(computeReconcileDiff(100000, 102000)).toEqual({
      diff: 2000,
      status: 'mismatch',
    });
  });

  it('buildNonCashReconciliation mengagregasikan penerimaan per metode bayar', () => {
    const orders: Order[] = [
      {
        id: 'ord-1',
        number: 'ORD-001',
        type: 'dine_in',
        cashierId: 'c-1',
        status: 'paid',
        openedAt: '2026-11-10T10:00:00Z',
        closedAt: '2026-11-10T10:05:00Z',
        items: [],
        discounts: [],
        subtotal: 100000,
        discountTotal: 0,
        taxTotal: 0,
        serviceCharge: 0,
        rounding: 0,
        total: 100000,
        paidTotal: 100000,
        payments: [
          {
            id: 'p-1',
            methodId: 'm-qris',
            methodName: 'QRIS Statis',
            kind: 'gateway',
            amount: 60000,
            change: 0,
            paidAt: '2026-11-10T10:05:00Z',
          },
          {
            id: 'p-2',
            methodId: 'm-cash',
            methodName: 'Tunai',
            kind: 'cash',
            amount: 40000,
            change: 0,
            paidAt: '2026-11-10T10:05:00Z',
          },
        ],
      },
      {
        id: 'ord-2',
        number: 'ORD-002',
        type: 'takeaway',
        cashierId: 'c-1',
        status: 'paid',
        openedAt: '2026-11-10T11:00:00Z',
        closedAt: '2026-11-10T11:05:00Z',
        items: [],
        discounts: [],
        subtotal: 75000,
        discountTotal: 0,
        taxTotal: 0,
        serviceCharge: 0,
        rounding: 0,
        total: 75000,
        paidTotal: 75000,
        payments: [
          {
            id: 'p-3',
            methodId: 'm-qris',
            methodName: 'QRIS Statis',
            kind: 'gateway',
            amount: 75000,
            change: 0,
            paidAt: '2026-11-10T11:05:00Z',
          },
        ],
      },
      {
        id: 'ord-3',
        number: 'ORD-003',
        type: 'dine_in',
        cashierId: 'c-1',
        status: 'paid',
        openedAt: '2026-11-10T12:00:00Z',
        closedAt: '2026-11-10T12:05:00Z',
        items: [],
        discounts: [],
        subtotal: 120000,
        discountTotal: 0,
        taxTotal: 0,
        serviceCharge: 0,
        rounding: 0,
        total: 120000,
        paidTotal: 120000,
        payments: [
          {
            id: 'p-4',
            methodId: 'm-debit',
            methodName: 'Kartu Debit BCA',
            kind: 'noncash',
            amount: 120000,
            change: 0,
            paidAt: '2026-11-10T12:05:00Z',
          },
        ],
      },
      {
        id: 'ord-4',
        number: 'ORD-004',
        type: 'dine_in',
        cashierId: 'c-1',
        status: 'void', // Batal - harus diabaikan
        openedAt: '2026-11-10T13:00:00Z',
        items: [],
        discounts: [],
        subtotal: 50000,
        discountTotal: 0,
        taxTotal: 0,
        serviceCharge: 0,
        rounding: 0,
        total: 50000,
        paidTotal: 50000,
        payments: [
          {
            id: 'p-5',
            methodId: 'm-qris',
            methodName: 'QRIS Statis',
            kind: 'gateway',
            amount: 50000,
            change: 0,
            paidAt: '2026-11-10T13:05:00Z',
          },
        ],
      },
    ];

    // Tanpa input manual (status unentered)
    const res1 = buildNonCashReconciliation({
      orders,
      paymentMethods,
      groupBy: 'method',
    });

    expect(res1.rows).toHaveLength(2); // QRIS dan Debit BCA (Tunai diabaikan)
    expect(res1.totalTransactions).toBe(3); // 2 dari QRIS, 1 dari Debit
    expect(res1.totalSystemAmount).toBe(255000); // 135000 (QRIS) + 120000 (Debit)
    expect(res1.unenteredCount).toBe(2);
    expect(res1.allMatched).toBe(false);

    // Dengan input manual: QRIS cocok (135.000), Debit ada selisih (118.000 vs 120.000)
    const actualAmounts: Record<string, number> = {
      'm-qris': 135000,
      'm-debit': 118000,
    };

    const res2 = buildNonCashReconciliation({
      orders,
      paymentMethods,
      actualAmounts,
      groupBy: 'method',
    });

    const qrisRow = res2.rows.find((r) => r.methodId === 'm-qris');
    expect(qrisRow).toBeDefined();
    expect(qrisRow?.systemAmount).toBe(135000);
    expect(qrisRow?.actualAmount).toBe(135000);
    expect(qrisRow?.diff).toBe(0);
    expect(qrisRow?.status).toBe('matched');

    const debitRow = res2.rows.find((r) => r.methodId === 'm-debit');
    expect(debitRow).toBeDefined();
    expect(debitRow?.systemAmount).toBe(120000);
    expect(debitRow?.actualAmount).toBe(118000);
    expect(debitRow?.diff).toBe(-2000);
    expect(debitRow?.status).toBe('mismatch');

    expect(res2.matchedCount).toBe(1);
    expect(res2.mismatchCount).toBe(1);
    expect(res2.totalDiff).toBe(-2000);
    expect(res2.allMatched).toBe(false);
  });

  it('buildReconcileCsv menghasilkan baris CSV lengkap', () => {
    const rows = [
      {
        id: 'm-qris',
        methodId: 'm-qris',
        methodName: 'QRIS Statis',
        methodKind: 'gateway' as const,
        transactionCount: 5,
        systemAmount: 250000,
        actualAmount: 250000,
        diff: 0,
        status: 'matched' as const,
      },
    ];

    const csvData = buildReconcileCsv(rows);
    expect(csvData.length).toBeGreaterThan(2);
    expect(csvData[0][0]).toBe('Metode Pembayaran');
    expect(csvData[1][0]).toBe('QRIS Statis');
    expect(csvData[1][7]).toBeUndefined(); // hanya 7 kolom jika includeDate false
    expect(csvData[csvData.length - 1][0]).toBe('TOTAL');
  });
});
