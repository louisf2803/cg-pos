import type { Category, DiningTable, Employee, Floor, Order, Product, Refund } from './types';
import { localDateKey } from './order-number';
import { summarizeSales } from './supabase-map';
import type { SalesSummary } from './types';

export interface ReportRow { key: string; label: string; count: number; amount: number }
/** Satu pembayaran gratis (komplimen); reason = keterangan yang dicatat kasir, termasuk nama pemberi izin bila ada. */
export interface ComplimentaryRow { orderId: string; number: string; at: string; amount: number; reason: string }
export interface SalesReport {
  summary: SalesSummary;
  byDay: ReportRow[];        // urut tanggal naik
  byCategory: ReportRow[];   // nilai terbesar dulu; count = jumlah barang terjual
  byType: ReportRow[];
  byCashier: ReportRow[];
  /** Pembayaran gratis dalam rentang (pesanan lunas), terbaru dulu. Bukan bagian dari penjualan bersih; hanya kontrol. */
  complimentary: { count: number; total: number; rows: ComplimentaryRow[] };
  /** Kontrol: refund dan pesanan dibatalkan dalam rentang. net = penjualan - refund. */
  control: { refundCount: number; refundTotal: number; byReason: ReportRow[]; voidCount: number; voidTotal: number; net: number };
}

const TYPE_LABEL: Record<string, string> = { dine_in: 'Makan di tempat', takeaway: 'Bawa pulang', delivery: 'Antar', service: 'Jasa' };
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
  const free: ComplimentaryRow[] = [];
  for (const o of paid) for (const p of o.payments) if (p.kind === 'complimentary') free.push({ orderId: o.id, number: o.number, at: p.paidAt || o.closedAt || o.openedAt, amount: p.amount, reason: (p.reference ?? '').trim() || '(tanpa alasan)' });
  free.sort((a, b) => b.at.localeCompare(a.at));
  const byAmount = (a: ReportRow, b: ReportRow) => b.amount - a.amount;
  const refunds = input.refunds ?? [], voided = (input.voided ?? []).filter((o) => o.status === 'void');
  const reason = new Map<string, ReportRow>();
  for (const r of refunds) add(reason, r.reason.toLowerCase(), r.reason, 1, r.total);
  const summary = summarizeSales(paid, input.timezone);
  const refundTotal = refunds.reduce((a, r) => a + r.total, 0);
  return {
    summary,
    control: { refundCount: refunds.length, refundTotal, byReason: [...reason.values()].sort(byAmount), voidCount: voided.length, voidTotal: voided.reduce((a, o) => a + o.total, 0), net: summary.total - refundTotal },
    complimentary: { count: free.length, total: free.reduce((a, f) => a + f.amount, 0), rows: free },
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

export interface TaxRow { key: string; label: string; count: number; afterDiscount: number; serviceCharge: number; tax: number; rounding: number; total: number }
export interface TaxReport { totals: TaxRow; byDay: TaxRow[]; byType: TaxRow[] }

/** Laporan pajak dan biaya layanan dari pesanan lunas. Murni. afterDiscount = subtotal - diskon (nilai sebelum biaya layanan dan pajak). */
export function buildTaxReport(paid: Order[], timezone: string): TaxReport {
  const empty = (key: string, label: string): TaxRow => ({ key, label, count: 0, afterDiscount: 0, serviceCharge: 0, tax: 0, rounding: 0, total: 0 });
  const add = (r: TaxRow, o: Order) => { r.count += 1; r.afterDiscount += o.subtotal - o.discountTotal; r.serviceCharge += o.serviceCharge; r.tax += o.taxTotal; r.rounding += o.rounding; r.total += o.total; };
  const day = new Map<string, TaxRow>(), type = new Map<string, TaxRow>(), totals = empty('total', 'Total');
  for (const o of paid.filter((x) => x.status === 'paid')) {
    const dk = localDateKey(new Date(o.closedAt ?? o.openedAt), timezone);
    add(day.get(dk) ?? day.set(dk, empty(dk, dk)).get(dk)!, o);
    add(type.get(o.type) ?? type.set(o.type, empty(o.type, orderTypeLabel(o.type))).get(o.type)!, o);
    add(totals, o);
  }
  return { totals, byDay: [...day.values()].sort((a, b) => a.key.localeCompare(b.key)), byType: [...type.values()].sort((a, b) => b.total - a.total) };
}

export interface TableReportRow { key: string; label: string; floor: string; visits: number; guests: number; total: number; avgPerVisit: number; avgPerGuest: number | null }
export interface TableReport { totals: TableReportRow; rows: TableReportRow[]; byFloor: TableReportRow[] }

/** Laporan meja dari pesanan lunas: tiap meja = berapa kali dipakai, tamu, penjualan. Pesanan tanpa meja dikelompokkan sendiri. Murni. */
export function buildTableReport(paid: Order[], tables: DiningTable[], floors: Floor[]): TableReport {
  const floorName = new Map(floors.map((f) => [f.id, f.name]));
  const tableById = new Map(tables.map((t) => [t.id, t]));
  const mk = (key: string, label: string, floor: string): TableReportRow => ({ key, label, floor, visits: 0, guests: 0, total: 0, avgPerVisit: 0, avgPerGuest: null });
  const finish = (r: TableReportRow): TableReportRow => ({ ...r, avgPerVisit: r.visits ? Math.round(r.total / r.visits) : 0, avgPerGuest: r.guests ? Math.round(r.total / r.guests) : null });
  const add = (r: TableReportRow, o: Order) => { r.visits += 1; r.guests += o.guestCount ?? 0; r.total += o.total; };
  const byTable = new Map<string, TableReportRow>(), byFloor = new Map<string, TableReportRow>(), totals = mk('total', 'Total', '');
  for (const o of paid.filter((x) => x.status === 'paid')) {
    const t = o.tableId ? tableById.get(o.tableId) : undefined;
    const key = o.tableId ? (t ? t.id : o.tableId) : 'none';
    const fl = !o.tableId ? 'Tanpa meja' : t?.floorId ? floorName.get(t.floorId) ?? 'Lantai dihapus' : 'Tanpa lantai';
    const label = !o.tableId ? 'Tanpa meja (bawa pulang, antar, jasa)' : t ? t.name : 'Meja dihapus';
    add(byTable.get(key) ?? byTable.set(key, mk(key, label, fl)).get(key)!, o);
    add(byFloor.get(fl) ?? byFloor.set(fl, mk(fl, fl, fl)).get(fl)!, o);
    add(totals, o);
  }
  const sorter = (a: TableReportRow, b: TableReportRow) => b.total - a.total || a.label.localeCompare(b.label, 'id');
  return { totals: finish(totals), rows: [...byTable.values()].map(finish).sort(sorter), byFloor: [...byFloor.values()].map(finish).sort(sorter) };
}
