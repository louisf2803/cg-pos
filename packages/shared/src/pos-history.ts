import type { OrderType } from './order-calc';
import { localDateKey } from './order-number';
import type { Order, Refund, SalesRange } from './types';

export type PosRangePreset = 'today' | '7d' | '30d';

const TZ_OFFSET_HOURS: Record<string, number> = {
  'Asia/Jakarta': 7,
  'Asia/Makassar': 8,
  'Asia/Jayapura': 9,
};

function addDaysKey(dateKey: string, delta: number): string {
  const t = new Date(`${dateKey}T00:00:00Z`).getTime() + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Hitung rentang tanggal UTC [from, to) untuk layar penjualan dan kontrol POS berdasar zona waktu outlet. */
export function posSalesRange(
  tz: string,
  preset: PosRangePreset,
  now = new Date(),
): SalesRange & { label: string } {
  const today = localDateKey(now, tz);
  const fromKey =
    preset === '30d' ? addDaysKey(today, -29) : preset === '7d' ? addDaysKey(today, -6) : today;
  const off = TZ_OFFSET_HOURS[tz] ?? 7;
  const startMs = new Date(`${fromKey}T00:00:00Z`).getTime() - off * 3_600_000;
  const endMs = new Date(`${today}T00:00:00Z`).getTime() - off * 3_600_000 + 86_400_000;
  return {
    from: new Date(startMs).toISOString(),
    to: new Date(endMs).toISOString(),
    label: fromKey === today ? today : `${fromKey} sampai ${today}`,
  };
}

export interface OrderRefundSummary {
  total: number;
  count: number;
  refunds: Refund[];
}

/** Kelompokkan daftar refund per ID pesanan dan urutkan riwayatnya dari yang terbaru. */
export function groupRefundsByOrder(refunds: readonly Refund[]): Map<string, OrderRefundSummary> {
  const map = new Map<string, OrderRefundSummary>();
  for (const r of refunds) {
    const existing = map.get(r.orderId);
    if (existing) {
      existing.total += r.total;
      existing.count += 1;
      existing.refunds.push(r);
    } else {
      map.set(r.orderId, { total: r.total, count: 1, refunds: [r] });
    }
  }
  for (const entry of map.values()) {
    entry.refunds.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return map;
}

export interface PosSalesStats {
  paidCount: number;
  grossTotal: number;
  refundCount: number;
  refundTotal: number;
  netTotal: number;
  voidCount: number;
  voidTotal: number;
  avgPaidTicket: number;
}

/** Hitung ringkasan KPI penjualan lunas, refund, penjualan bersih, dan pesanan dibatalkan (void). */
export function summarizePosSales(
  paidOrders: readonly Order[],
  voidOrders: readonly Order[],
  refunds: readonly Refund[],
): PosSalesStats {
  const grossTotal = paidOrders.reduce((sum, o) => sum + o.total, 0);
  const refundTotal = refunds.reduce((sum, r) => sum + r.total, 0);
  const voidTotal = voidOrders.reduce((sum, o) => sum + o.total, 0);
  const paidCount = paidOrders.length;
  return {
    paidCount,
    grossTotal,
    refundCount: refunds.length,
    refundTotal,
    netTotal: grossTotal - refundTotal,
    voidCount: voidOrders.length,
    voidTotal,
    avgPaidTicket: paidCount > 0 ? Math.round(grossTotal / paidCount) : 0,
  };
}

export interface PosOrderFilterOptions {
  cashierId?: string;
  orderType?: OrderType | '';
  onlyRefunded?: boolean;
  refundsByOrder?: ReadonlyMap<string, OrderRefundSummary>;
  employeeNames?: ReadonlyMap<string, string>;
  tableNames?: ReadonlyMap<string, string>;
}

/** Saring pesanan lunas atau dibatalkan menurut kata kunci, kasir, jenis order, dan status refund. */
export function filterPosOrders(
  orders: readonly Order[],
  query: string,
  opts: PosOrderFilterOptions = {},
): Order[] {
  const q = query.trim().toLowerCase();
  return orders.filter((o) => {
    if (opts.cashierId && o.cashierId !== opts.cashierId) return false;
    if (opts.orderType && o.type !== opts.orderType) return false;
    if (opts.onlyRefunded) {
      const ref = opts.refundsByOrder?.get(o.id);
      if (!ref || ref.count === 0) return false;
    }
    if (!q) return true;
    const cashierName = opts.employeeNames?.get(o.cashierId) ?? '';
    const tableName = o.tableId ? (opts.tableNames?.get(o.tableId) ?? '') : '';
    const extraReason =
      (o as { voidReason?: string; reason?: string }).voidReason ??
      (o as { voidReason?: string; reason?: string }).reason ??
      '';
    return (
      o.number.toLowerCase().includes(q) ||
      (o.customerName ?? '').toLowerCase().includes(q) ||
      (o.label ?? '').toLowerCase().includes(q) ||
      cashierName.toLowerCase().includes(q) ||
      tableName.toLowerCase().includes(q) ||
      extraReason.toLowerCase().includes(q) ||
      o.items.some(
        (it) => it.name.toLowerCase().includes(q) || (it.note ?? '').toLowerCase().includes(q),
      )
    );
  });
}

/** Saring riwayat refund menurut kata kunci dan metode pengembalian dana, urut terbaru dulu. */
export function filterPosRefunds(
  refunds: readonly Refund[],
  ordersById: ReadonlyMap<string, Order>,
  query: string,
  methodFilter = '',
): Refund[] {
  const q = query.trim().toLowerCase();
  return refunds
    .filter((r) => {
      if (methodFilter && r.methodName !== methodFilter) return false;
      if (!q) return true;
      const ord = ordersById.get(r.orderId);
      return (
        r.number.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        (r.note ?? '').toLowerCase().includes(q) ||
        r.methodName.toLowerCase().includes(q) ||
        (ord?.number.toLowerCase().includes(q) ?? false) ||
        (ord?.customerName?.toLowerCase().includes(q) ?? false)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
