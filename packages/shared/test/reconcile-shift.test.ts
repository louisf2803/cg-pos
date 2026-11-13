import { describe, expect, it } from 'vitest';
import {
  buildNonCashReconciliation,
  computeReconcileDiff,
  createFakeData,
  type Order,
  type PaymentMethod,
  type Shift,
} from '../src';

describe('A128 - Rekonsiliasi Non-tunai per Shift & Pengaturan Outlet', () => {
  const methods: PaymentMethod[] = [
    { id: 'm-qris', code: 'QRIS', name: 'QRIS Statis', kind: 'gateway', requiresOnline: false },
    { id: 'm-edc', code: 'EDC', name: 'Kartu Debit', kind: 'noncash', requiresOnline: false },
    { id: 'm-cash', code: 'CASH', name: 'Tunai', kind: 'cash', requiresOnline: false },
  ];

  const shifts: Shift[] = [
    { id: 'sh-pagi', cashierId: 'c-1', openedAt: '2026-11-13T08:00:00Z', openingCash: 100000, status: 'closed' },
    { id: 'sh-malam', cashierId: 'c-2', openedAt: '2026-11-13T16:00:00Z', openingCash: 100000, status: 'open' },
  ];

  const orders: Order[] = [
    {
      id: 'ord-1',
      number: 'ORD-01',
      type: 'dine_in',
      shiftId: 'sh-pagi',
      cashierId: 'c-1',
      status: 'paid',
      openedAt: '2026-11-13T09:00:00Z',
      closedAt: '2026-11-13T09:10:00Z',
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
        { id: 'p1', methodId: 'm-qris', methodName: 'QRIS Statis', kind: 'gateway', amount: 100000, change: 0, paidAt: '2026-11-13T09:10:00Z' },
      ],
    },
    {
      id: 'ord-2',
      number: 'ORD-02',
      type: 'dine_in',
      shiftId: 'sh-pagi',
      cashierId: 'c-1',
      status: 'paid',
      openedAt: '2026-11-13T10:00:00Z',
      closedAt: '2026-11-13T10:10:00Z',
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
        { id: 'p2', methodId: 'm-edc', methodName: 'Kartu Debit', kind: 'noncash', amount: 50000, change: 0, paidAt: '2026-11-13T10:10:00Z' },
      ],
    },
    {
      id: 'ord-3',
      number: 'ORD-03',
      type: 'takeaway',
      shiftId: 'sh-malam',
      cashierId: 'c-2',
      status: 'paid',
      openedAt: '2026-11-13T17:00:00Z',
      closedAt: '2026-11-13T17:10:00Z',
      items: [],
      discounts: [],
      subtotal: 80000,
      discountTotal: 0,
      taxTotal: 0,
      serviceCharge: 0,
      rounding: 0,
      total: 80000,
      paidTotal: 80000,
      payments: [
        { id: 'p3', methodId: 'm-qris', methodName: 'QRIS Statis', kind: 'gateway', amount: 80000, change: 0, paidAt: '2026-11-13T17:10:00Z' },
      ],
    },
  ];

  it('computeReconcileDiff memperhitungkan biaya gateway (MDR) dengan benar', () => {
    // Netto di bank 99.300 + Fee MDR 700 = Bruto Sistem 100.000 -> Selisih 0 (matched)
    const resMatched = computeReconcileDiff(100000, 99300, 700);
    expect(resMatched.diff).toBe(0);
    expect(resMatched.status).toBe('matched');

    // Netto di bank 98.000 + Fee MDR 700 = 98.700 vs 100.000 -> Selisih -1.300 (mismatch)
    const resMismatch = computeReconcileDiff(100000, 98000, 700);
    expect(resMismatch.diff).toBe(-1300);
    expect(resMismatch.status).toBe('mismatch');
  });

  it('buildNonCashReconciliation mendukung pengelompokan shift_method', () => {
    const summary = buildNonCashReconciliation({
      orders,
      paymentMethods: methods,
      shifts,
      groupBy: 'shift_method',
      actualAmounts: {
        'sh-pagi_m-qris': 99300,
      },
      feeAmounts: {
        'sh-pagi_m-qris': 700,
      },
    });

    expect(summary.rows).toHaveLength(3);
    const qrisPagi = summary.rows.find((r) => r.id === 'sh-pagi_m-qris');
    expect(qrisPagi).toBeDefined();
    expect(qrisPagi?.shiftId).toBe('sh-pagi');
    expect(qrisPagi?.systemAmount).toBe(100000);
    expect(qrisPagi?.actualAmount).toBe(99300);
    expect(qrisPagi?.feeAmount).toBe(700);
    expect(qrisPagi?.diff).toBe(0);
    expect(qrisPagi?.status).toBe('matched');
  });

  it('DataLayer fake mendukung penyimpanan dan riwayat rekonsiliasi non-tunai', async () => {
    const data = createFakeData();

    // Pastikan daftar awal terbaca
    const initialList = await data.listNonCashReconciliations();
    expect(Array.isArray(initialList)).toBe(true);

    // Simpan rekonsiliasi baru
    const saved = await data.saveNonCashReconciliation({
      shiftId: 'seed-shift',
      methodId: 'm-edc',
      actualAmount: 110000,
      feeAmount: 0,
      notes: 'Sesuai EDC BCA',
    });

    expect(saved.status).toBe('reconciled');
    expect(saved.actualAmount).toBe(110000);
    expect(saved.difference).toBe(0);

    // Filter per status 'reconciled'
    const reconciledOnly = await data.listNonCashReconciliations({ status: 'reconciled' });
    expect(reconciledOnly.some((r) => r.methodId === 'm-edc')).toBe(true);
  });

  it('DataLayer fake mendukung opsi autoReconcileNoncash pada pengaturan outlet', async () => {
    const data = createFakeData();

    const cur = await data.getOutletSettings();
    expect(cur.options.autoReconcileNoncash).toBe(false);

    // Ubah ke otomatis
    await data.saveOutletOptions({
      ...cur.options,
      autoReconcileNoncash: true,
    });

    const updated = await data.getOutletSettings();
    expect(updated.options.autoReconcileNoncash).toBe(true);
  });
});
