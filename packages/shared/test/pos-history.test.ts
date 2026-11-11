import { describe, expect, it } from 'vitest';
import {
  filterPosOrders,
  filterPosRefunds,
  groupRefundsByOrder,
  posSalesRange,
  summarizePosSales,
} from '../src/pos-history';
import type { Order, Refund } from '../src/types';

function makeOrder(patch: Partial<Order>): Order {
  return {
    id: 'o-1',
    number: 'OUT1/A/261111/001',
    type: 'takeaway',
    cashierId: 'emp-1',
    status: 'paid',
    items: [
      { id: 'it-1', productId: 'p-1', name: 'Kopi Latte', qty: 2, unitPrice: 25000, lineTotal: 50000 },
    ],
    subtotal: 50000,
    discountTotal: 0,
    serviceCharge: 0,
    taxTotal: 0,
    rounding: 0,
    total: 50000,
    paidTotal: 50000,
    payments: [{ id: 'pay-1', methodId: 'cash', methodName: 'Tunai', kind: 'cash', amount: 50000, paidAt: '2026-11-11T04:00:00.000Z' }],
    openedAt: '2026-11-11T03:55:00.000Z',
    closedAt: '2026-11-11T04:00:00.000Z',
    ...patch,
  };
}

function makeRefund(patch: Partial<Refund>): Refund {
  return {
    id: 'ref-1',
    number: 'R1-OUT1/A/261111/001',
    orderId: 'o-1',
    total: 25000,
    reason: 'Pesanan salah',
    methodName: 'Tunai',
    createdAt: '2026-11-11T04:10:00.000Z',
    items: [{ orderItemId: 'it-1', qty: 1, amount: 25000 }],
    ...patch,
  };
}

describe('pos-history helpers (A64)', () => {
  it('computes outlet timezone UTC ranges for today, 7d, and 30d', () => {
    // 2026-11-12 01:00 WIB = 2026-11-11 18:00 UTC
    const now = new Date('2026-11-11T18:00:00.000Z');
    const today = posSalesRange('Asia/Jakarta', 'today', now);
    expect(today.label).toBe('2026-11-12');
    expect(today.from).toBe('2026-11-11T17:00:00.000Z');
    expect(today.to).toBe('2026-11-12T17:00:00.000Z');

    const week = posSalesRange('Asia/Jakarta', '7d', now);
    expect(week.label).toBe('2026-11-06 sampai 2026-11-12');
    expect(week.from).toBe('2026-11-05T17:00:00.000Z');
    expect(week.to).toBe('2026-11-12T17:00:00.000Z');

    const month = posSalesRange('Asia/Makassar', '30d', now);
    expect(month.label).toBe('2026-10-14 sampai 2026-11-12');
    expect(month.from).toBe('2026-10-13T16:00:00.000Z');
  });

  it('groups refunds by orderId sorted newest first and calculates totals', () => {
    const r1 = makeRefund({ id: 'r1', orderId: 'o-1', total: 10000, createdAt: '2026-11-11T04:10:00.000Z' });
    const r2 = makeRefund({ id: 'r2', number: 'R2-OUT1/A/261111/001', orderId: 'o-1', total: 15000, createdAt: '2026-11-11T05:10:00.000Z' });
    const grouped = groupRefundsByOrder([r1, r2]);
    const entry = grouped.get('o-1')!;
    expect(entry.count).toBe(2);
    expect(entry.total).toBe(25000);
    expect(entry.refunds.map((x) => x.id)).toEqual(['r2', 'r1']);
  });

  it('summarizes POS gross, refund, net, and void figures accurately', () => {
    const paid = [makeOrder({ id: 'o-1', total: 50000 }), makeOrder({ id: 'o-2', total: 30000 })];
    const voided = [makeOrder({ id: 'o-3', status: 'void', total: 42000, paidTotal: 0 })];
    const refunds = [makeRefund({ orderId: 'o-1', total: 20000 })];
    const stats = summarizePosSales(paid, voided, refunds);
    expect(stats).toEqual({
      paidCount: 2,
      grossTotal: 80000,
      refundCount: 1,
      refundTotal: 20000,
      netTotal: 60000,
      voidCount: 1,
      voidTotal: 42000,
      avgPaidTicket: 40000,
    });
  });

  it('filters POS orders by cashier, order type, refunded status, and keyword across items/table/cashier', () => {
    const empNames = new Map([['emp-1', 'Sari'], ['emp-2', 'Budi']]);
    const tableNames = new Map([['t-1', 'A3']]);
    const o1 = makeOrder({ id: 'o-1', number: 'OUT1/A/001', cashierId: 'emp-1', type: 'dine_in', tableId: 't-1', customerName: 'Andi' });
    const o2 = makeOrder({
      id: 'o-2',
      number: 'OUT1/A/002',
      cashierId: 'emp-2',
      status: 'void',
      label: 'Salah input pesanan',
      items: [{ id: 'it-2', productId: 'p-2', name: 'Matcha Latte', qty: 1, unitPrice: 32000, lineTotal: 32000, note: 'Less sugar' }],
    });
    const refundsByOrder = groupRefundsByOrder([makeRefund({ orderId: 'o-1', total: 10000 })]);

    expect(filterPosOrders([o1, o2], 'matcha', { employeeNames: empNames }).map((x) => x.id)).toEqual(['o-2']);
    expect(filterPosOrders([o1, o2], 'a3', { tableNames }).map((x) => x.id)).toEqual(['o-1']);
    expect(filterPosOrders([o1, o2], 'budi', { employeeNames: empNames }).map((x) => x.id)).toEqual(['o-2']);
    expect(filterPosOrders([o1, o2], '', { onlyRefunded: true, refundsByOrder }).map((x) => x.id)).toEqual(['o-1']);
    expect(filterPosOrders([o1, o2], '', { orderType: 'dine_in' }).map((x) => x.id)).toEqual(['o-1']);
    expect(filterPosOrders([o1, o2], '', { cashierId: 'emp-2' }).map((x) => x.id)).toEqual(['o-2']);
  });

  it('filters POS refunds by keyword and return method, sorted newest first', () => {
    const o1 = makeOrder({ id: 'o-1', number: 'OUT1/A/261111/001', customerName: 'Nadia' });
    const ordersById = new Map([[o1.id, o1]]);
    const r1 = makeRefund({ id: 'r1', methodName: 'Tunai', reason: 'Salah suhu', createdAt: '2026-11-11T04:00:00.000Z' });
    const r2 = makeRefund({ id: 'r2', number: 'R2-OUT1/A/261111/001', methodName: 'Transfer', reason: 'Batal sebagian', createdAt: '2026-11-11T06:00:00.000Z' });

    expect(filterPosRefunds([r1, r2], ordersById, 'nadia').map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(filterPosRefunds([r1, r2], ordersById, 'suhu').map((r) => r.id)).toEqual(['r1']);
    expect(filterPosRefunds([r1, r2], ordersById, '', 'Transfer').map((r) => r.id)).toEqual(['r2']);
  });
});

