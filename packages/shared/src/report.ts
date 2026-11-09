import type { Category, Employee, Order, Product, Refund } from './types';
import { localDateKey } from './order-number';
import { summarizeSales } from './supabase-map';
import type { SalesSummary } from './types';

export interface ReportRow { key: string; label: string; count: number; amount: number }
export interface SalesReport {
  summary: SalesSummary;
  byDay: ReportRow[];        // urut tanggal naik
  byCategory: ReportRow[];   // nilai terbesar dulu; count = jumlah barang terjual
  byType: ReportRow[];
  byCashier: ReportRow[];
  /** Kontrol: refund dan pesanan dibatalkan dalam rentang. net = penjualan - refund. */
  control: { refundCount: number; refundTotal: number; byReason: ReportRow[]; voidCount: number; voidTotal: number; net: number };
}

const TYPE_LABEL: Record<string, string> = { dine_in: 'Makan di tempat', takeaway: 'Bawa pulang', delivery: 'Antar', service: 'Layanan' };
export const orderTypeLabel = (t: string) => TYPE_LABEL[t] ?? t;

/** Laporan penjualan dari pesanan lunas. Murni: sama untuk data palsu dan data nyata. */
export function buildSalesReport(input: { orders: Order[]; products: Product[]; categories: Category[]; employees: Employee[]; timezone: string; refunds?: Refund[]; voided?: Order[] }): SalesReport {
  const paid = input.orders.filter((o) => o.status === 'paid');
  const prod = new Map(input.products.map((p) => [p.id, p]));
  const catName = new Map(input.categories.map((c) => [c.id, c.name]));
  const emp = new Map(input.employees.map((e) => [e.id, e.name]));
  const add = (m: Map<string, ReportRow>, key: string, label: string, count: number, amount: number) => {
    const cur = m.get(key) ?? { key, label, count: 0, amount: 0 };
    cur.count += count; cur.amount += amount; m.set(key, cur);
  };
  const day = new Map<string, ReportRow>(), cat = new Map<string, ReportRow>(), type = new Map<string, ReportRow>(), cashier = new Map<string, ReportRow>();
  for (const o of paid) {
    const dk = localDateKey(new Date(o.closedAt ?? o.openedAt), input.timezone);
    add(day, dk, dk, 1, o.total);
    add(type, o.type, orderTypeLabel(o.type), 1, o.total);
    add(cashier, o.cashierId, emp.get(o.cashierId) ?? 'Karyawan lain', 1, o.total);
    for (const i of o.items) {
      const cid = prod.get(i.productId)?.categoryId ?? null;
      add(cat, cid ?? '-', cid ? catName.get(cid) ?? 'Tanpa kategori' : 'Tanpa kategori', i.qty, i.lineTotal);
    }
  }
  const byAmount = (a: ReportRow, b: ReportRow) => b.amount - a.amount;
  const refunds = input.refunds ?? [], voided = (input.voided ?? []).filter((o) => o.status === 'void');
  const reason = new Map<string, ReportRow>();
  for (const r of refunds) add(reason, r.reason.toLowerCase(), r.reason, 1, r.total);
  const summary = summarizeSales(paid, input.timezone);
  const refundTotal = refunds.reduce((a, r) => a + r.total, 0);
  return {
    summary,
    control: { refundCount: refunds.length, refundTotal, byReason: [...reason.values()].sort(byAmount), voidCount: voided.length, voidTotal: voided.reduce((a, o) => a + o.total, 0), net: summary.total - refundTotal },
    byDay: [...day.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byCategory: [...cat.values()].sort(byAmount),
    byType: [...type.values()].sort(byAmount),
    byCashier: [...cashier.values()].sort(byAmount),
  };
}

/** CSV (Excel Indonesia memakai titik koma). Sel diberi tanda kutip dan diawali apostrof bila berawalan = + - @ agar tidak dibaca sebagai rumus. */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = "'" + s;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}
