// Perbandingan penjualan antar outlet (A131; migrasi 0131, fungsi pos.outlet_sales_compare).
import type { SalesRange, SalesSummary } from './types';

export interface OutletComparisonRow {
  outletId: string; name: string;
  /** penjualan bersih yang sudah dibayar (total pesanan, termasuk pajak dan layanan) */
  sales: number; orders: number; avgTicket: number;
  /** harga pokok dari jurnal akun HPP outlet ini; 0 bila belum ada jurnal */
  cogs: number;
  /** penjualan dikurangi harga pokok; margin dalam persen dari penjualan (0 bila penjualan 0) */
  margin: number; marginPct: number;
  topProducts: { name: string; qty: number; amount: number }[];
}

export type CompareMetric = 'sales' | 'orders' | 'avgTicket' | 'margin';
export const COMPARE_METRIC_LABEL: Record<CompareMetric, string> = {
  sales: 'Penjualan', orders: 'Jumlah transaksi', avgTicket: 'Rata-rata per transaksi', margin: 'Margin',
};

export function comparisonRow(r: { outletId: string; name: string; sales: number; orders: number; cogs: number; topProducts: OutletComparisonRow['topProducts'] }): OutletComparisonRow {
  const margin = r.sales - r.cogs;
  return {
    ...r, avgTicket: r.orders > 0 ? Math.round(r.sales / r.orders) : 0, margin,
    marginPct: r.sales > 0 ? Math.round((margin / r.sales) * 1000) / 10 : 0,
  };
}

/** Lebar batang (0-100) tiap baris terhadap nilai terbesar; nilai negatif dianggap 0. */
export function barPercents(rows: OutletComparisonRow[], metric: CompareMetric): number[] {
  const vals = rows.map((r) => Math.max(0, r[metric]));
  const max = Math.max(0, ...vals);
  return vals.map((v) => (max > 0 ? Math.round((v / max) * 100) : 0));
}

/** Mode demo: hanya satu outlet, diambil dari ringkasan penjualan outlet itu. */
export async function fakeOutletComparison(
  outlet: { id: string; name: string }, range: SalesRange, summary: (r: SalesRange) => Promise<SalesSummary>,
): Promise<OutletComparisonRow[]> {
  const s = await summary(range);
  return [comparisonRow({
    outletId: outlet.id, name: outlet.name, sales: s.total, orders: s.orderCount, cogs: 0,
    topProducts: s.topProducts.slice(0, 3).map((p) => ({ name: p.name, qty: p.qty, amount: p.amount })),
  })];
}
