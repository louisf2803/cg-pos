import type { PaymentMethod, Shift, ShiftReport } from './types';

/** Bahan mentah satu shift: dikumpulkan oleh lapisan data, dihitung di sini supaya fake dan server sama. */
export interface ShiftInputs {
  shift: Shift;
  payments: { methodName: string; kind: PaymentMethod['kind']; amount: number }[];
  cashIn: number; cashOut: number; cashRefunds: number;
  paidOrderCount: number;
  soldLines: { productId: string; name: string; qty: number; amount: number }[];
}

/**
 * Laporan shift. Rumus uang seharusnya di laci sama dengan fungsi tutup kasir di server:
 * modal + penjualan tunai + kas masuk - kas keluar - refund tunai.
 * Untuk shift yang sudah ditutup nilai dari server dipakai apa adanya. Shift berjalan: `counted` dan `variance` = 0.
 */
export function buildShiftReport(i: ShiftInputs, counted?: number): ShiftReport {
  const sum = (f: (p: ShiftInputs['payments'][number]) => boolean) => i.payments.filter(f).reduce((a, p) => a + p.amount, 0);
  const cashSales = sum((p) => p.kind === 'cash');
  const otherSales = sum((p) => p.kind !== 'cash');
  const expected = i.shift.expectedCash ?? i.shift.openingCash + cashSales + i.cashIn - i.cashOut - i.cashRefunds;
  const finalCount = counted ?? i.shift.counted ?? 0;
  const methods = new Map<string, { methodName: string; kind: PaymentMethod['kind']; count: number; amount: number }>();
  for (const p of i.payments) {
    const c = methods.get(p.methodName) ?? { methodName: p.methodName, kind: p.kind, count: 0, amount: 0 };
    c.count += 1; c.amount += p.amount; methods.set(p.methodName, c);
  }
  const sold = new Map<string, { productId: string; name: string; qty: number; amount: number }>();
  for (const l of i.soldLines) {
    const c = sold.get(l.productId) ?? { productId: l.productId, name: l.name, qty: 0, amount: 0 };
    c.qty += l.qty; c.amount += l.amount; sold.set(l.productId, c);
  }
  const isClosed = i.shift.status === 'closed';
  return {
    shift: i.shift, expectedCash: expected, counted: finalCount, variance: i.shift.variance ?? (isClosed || counted !== undefined ? finalCount - expected : 0),
    cashSales, otherSales, cashIn: i.cashIn, cashOut: i.cashOut, cashRefunds: i.cashRefunds, orderCount: i.paidOrderCount,
    byMethod: [...methods.values()].sort((a, b) => b.amount - a.amount),
    productsSold: [...sold.values()].sort((a, b) => b.amount - a.amount),
  };
}
