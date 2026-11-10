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

/** Satu baris laporan kasir: laporan shift + nama kasirnya (untuk dashboard). */
export interface ShiftReportRow extends ShiftReport { cashierName: string }

/** Gabungan semua shift pada satu rentang (dasar laporan tutup toko). */
export interface StoreCloseSummary {
  shiftCount: number; openCount: number; closedCount: number;
  /** tutup toko hanya boleh bila ada shift dan tidak ada yang masih terbuka */
  canClose: boolean;
  openingCash: number; expectedCash: number; counted: number; variance: number;
  cashSales: number; otherSales: number; cashIn: number; cashOut: number; cashRefunds: number; orderCount: number;
  byMethod: ShiftReport['byMethod']; productsSold: ShiftReport['productsSold'];
}

export function combineShiftReports(rows: ShiftReport[]): StoreCloseSummary {
  const sum = (f: (r: ShiftReport) => number) => rows.reduce((a, r) => a + f(r), 0);
  const methods = new Map<string, ShiftReport['byMethod'][number]>();
  const sold = new Map<string, ShiftReport['productsSold'][number]>();
  for (const r of rows) {
    for (const m of r.byMethod) {
      const c = methods.get(m.methodName) ?? { ...m, count: 0, amount: 0 };
      c.count += m.count; c.amount += m.amount; methods.set(m.methodName, c);
    }
    for (const l of r.productsSold) {
      const c = sold.get(l.productId) ?? { ...l, qty: 0, amount: 0 };
      c.qty += l.qty; c.amount += l.amount; sold.set(l.productId, c);
    }
  }
  const openCount = rows.filter((r) => r.shift.status === 'open').length;
  // selisih hanya dari shift yang sudah ditutup; shift terbuka belum punya hitungan fisik
  const closed = rows.filter((r) => r.shift.status === 'closed');
  return {
    shiftCount: rows.length, openCount, closedCount: closed.length, canClose: rows.length > 0 && openCount === 0,
    openingCash: sum((r) => r.shift.openingCash), expectedCash: sum((r) => r.expectedCash), counted: closed.reduce((a, r) => a + r.counted, 0),
    variance: closed.reduce((a, r) => a + r.variance, 0),
    cashSales: sum((r) => r.cashSales), otherSales: sum((r) => r.otherSales), cashIn: sum((r) => r.cashIn), cashOut: sum((r) => r.cashOut),
    cashRefunds: sum((r) => r.cashRefunds), orderCount: sum((r) => r.orderCount),
    byMethod: [...methods.values()].sort((a, b) => b.amount - a.amount), productsSold: [...sold.values()].sort((a, b) => b.amount - a.amount),
  };
}
