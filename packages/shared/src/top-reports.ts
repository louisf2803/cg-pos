import type { Order } from './types';
import type { StockItem } from './stock';
import type { ReportRow } from './report';
import { orderTypeLabel } from './report';

export interface TopProductRow {
  rank: number;
  productId: string;
  name: string;
  qty: number;
  totalSales: number;
  percentSales?: number;
}

export interface TopStockRow {
  rank: number;
  productId: string;
  name: string;
  unit: string;
  qty: number;
  minQty?: number;
  status: StockItem['status'];
  urgencyScore: number;
}

export interface TopOrderTypeRow {
  rank: number;
  type: string;
  label: string;
  count: number;
  amount: number;
  percentSales?: number;
}

/**
 * Hitung 10 produk terlaris dari pesanan lunas.
 * Diurutkan berdasarkan jumlah barang (qty) menurun, lalu total omzet (totalSales) menurun.
 */
export function getTopProducts(orders: Order[], limit = 10): TopProductRow[] {
  const map = new Map<string, { productId: string; name: string; qty: number; totalSales: number }>();
  let grandTotalSales = 0;

  for (const o of orders) {
    if (o.status !== 'paid') continue;
    for (const item of o.items) {
      grandTotalSales += item.lineTotal;
      const existing = map.get(item.productId);
      if (existing) {
        existing.qty += item.qty;
        existing.totalSales += item.lineTotal;
      } else {
        map.set(item.productId, {
          productId: item.productId,
          name: item.name,
          qty: item.qty,
          totalSales: item.lineTotal,
        });
      }
    }
  }

  const sorted = Array.from(map.values()).sort((a, b) => {
    if (b.qty !== a.qty) return b.qty - a.qty;
    if (b.totalSales !== a.totalSales) return b.totalSales - a.totalSales;
    return a.name.localeCompare(b.name);
  });

  return sorted.slice(0, limit).map((item, idx) => ({
    rank: idx + 1,
    productId: item.productId,
    name: item.name,
    qty: item.qty,
    totalSales: item.totalSales,
    percentSales: grandTotalSales > 0 ? Math.round((item.totalSales / grandTotalSales) * 1000) / 10 : 0,
  }));
}

/**
 * Hitung 10 stok terendah dari daftar stok persediaan.
 * Diurutkan berdasarkan sisa stok (qty) menaik (minus dulu, lalu nol, lalu terkecil).
 */
export function getTopLowestStock(items: StockItem[], limit = 10): TopStockRow[] {
  const sorted = [...items].sort((a, b) => {
    if (a.qty !== b.qty) return a.qty - b.qty;
    return a.name.localeCompare(b.name);
  });

  return sorted.slice(0, limit).map((item, idx) => ({
    rank: idx + 1,
    productId: item.productId,
    name: item.name,
    unit: item.unit,
    qty: item.qty,
    minQty: item.minQty,
    status: item.status,
    urgencyScore: item.qty,
  }));
}

/**
 * Hitung 10 stok mendekati atau di bawah batas minimum.
 * Mengutamakan barang dengan batas minimum atau status peringatan (menipis/habis/minus).
 * Urutan urgensi: selisih (qty - minQty) terkecil/paling negatif lebih dulu.
 */
export function getTopMinStock(items: StockItem[], limit = 10): TopStockRow[] {
  // Ambil barang yang memiliki batas minimum atau berstatus peringatan
  const candidates = items.filter(
    (item) => item.minQty != null || item.status === 'low' || item.status === 'out' || item.status === 'negative'
  );

  const pool = candidates.length > 0 ? candidates : items;

  const sorted = [...pool].sort((a, b) => {
    const diffA = a.qty - (a.minQty ?? 0);
    const diffB = b.qty - (b.minQty ?? 0);
    if (diffA !== diffB) return diffA - diffB;
    if (a.qty !== b.qty) return a.qty - b.qty;
    return a.name.localeCompare(b.name);
  });

  return sorted.slice(0, limit).map((item, idx) => ({
    rank: idx + 1,
    productId: item.productId,
    name: item.name,
    unit: item.unit,
    qty: item.qty,
    minQty: item.minQty,
    status: item.status,
    urgencyScore: item.qty - (item.minQty ?? 0),
  }));
}

/**
 * Hitung 10 jenis pesanan (order type) teratas berdasarkan total nilai transaksi.
 */
export function getTopOrderTypes(
  source: ReportRow[] | Order[],
  limit = 10
): TopOrderTypeRow[] {
  const first = source[0];
  if (!first) return [];

  // Jika input adalah Order[]
  if ('status' in first) {
    const orders = source as Order[];
    const map = new Map<string, { count: number; amount: number }>();
    let grandTotal = 0;

    for (const o of orders) {
      if (o.status !== 'paid') continue;
      grandTotal += o.total;
      const cur = map.get(o.type) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += o.total;
      map.set(o.type, cur);
    }

    const rows = Array.from(map.entries()).map(([type, stats]) => ({
      key: type,
      label: orderTypeLabel(type),
      count: stats.count,
      amount: stats.amount,
    }));

    rows.sort((a, b) => b.amount - a.amount || b.count - a.count);

    return rows.slice(0, limit).map((r, idx) => ({
      rank: idx + 1,
      type: r.key,
      label: r.label,
      count: r.count,
      amount: r.amount,
      percentSales: grandTotal > 0 ? Math.round((r.amount / grandTotal) * 1000) / 10 : 0,
    }));
  }

  // Jika input adalah ReportRow[]
  const reportRows = source as ReportRow[];
  const grandTotal = reportRows.reduce((acc, cur) => acc + cur.amount, 0);
  const sorted = [...reportRows].sort((a, b) => b.amount - a.amount || b.count - a.count);

  return sorted.slice(0, limit).map((r, idx) => ({
    rank: idx + 1,
    type: r.key,
    label: r.label || orderTypeLabel(r.key),
    count: r.count,
    amount: r.amount,
    percentSales: grandTotal > 0 ? Math.round((r.amount / grandTotal) * 1000) / 10 : 0,
  }));
}
