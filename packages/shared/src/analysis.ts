import { localParts } from './order-number';
import type { StockItem } from './stock';
import type { Order } from './types';

// ==========================================
// 1. Waktu Teramai Produk (Produk x Jam)
// ==========================================

export interface ProductHourlyCell {
  hour: number;
  qty: number;
  amount: number;
  intensity: number; // 0 to 1
}

export interface ProductPeakRow {
  productId: string;
  productName: string;
  totalQty: number;
  totalAmount: number;
  peakHour: number;
  peakHourQty: number;
  cells: ProductHourlyCell[]; // length 24
}

export interface ProductPeakHoursReport {
  topProducts: ProductPeakRow[];
  overallMaxQty: number;
  hourlyTotals: { hour: number; label: string; qty: number; amount: number }[];
}

export interface BuildProductPeakHoursInput {
  orders: Order[];
  timezone?: string;
  topLimit?: number;
}

export function buildProductPeakHours(input: BuildProductPeakHoursInput): ProductPeakHoursReport {
  const tz = input.timezone || 'Asia/Jakarta';
  const topLimit = input.topLimit ?? 10;
  const paid = (input.orders ?? []).filter((o) => o.status === 'paid');

  // Kumpulkan total kuantitas dan nominal per produk
  interface ProdStat {
    productId: string;
    name: string;
    totalQty: number;
    totalAmount: number;
    hourly: { qty: number; amount: number }[];
  }

  const prodMap = new Map<string, ProdStat>();
  const hourlyTotals = Array.from({ length: 24 }, (_, h) => {
    const pad = String(h).padStart(2, '0');
    return { hour: h, label: `${pad}:00`, qty: 0, amount: 0 };
  });

  for (const o of paid) {
    let h = 0;
    try {
      h = localParts(new Date(o.closedAt ?? o.openedAt), tz).h;
      if (h < 0 || h > 23 || isNaN(h)) h = 0;
    } catch {
      h = 0;
    }

    for (const item of o.items) {
      const pid = item.productId || item.name;
      let p = prodMap.get(pid);
      if (!p) {
        p = {
          productId: pid,
          name: item.name,
          totalQty: 0,
          totalAmount: 0,
          hourly: Array.from({ length: 24 }, () => ({ qty: 0, amount: 0 })),
        };
        prodMap.set(pid, p);
      }
      p.totalQty += item.qty;
      p.totalAmount += item.lineTotal;
      p.hourly[h]!.qty += item.qty;
      p.hourly[h]!.amount += item.lineTotal;

      hourlyTotals[h]!.qty += item.qty;
      hourlyTotals[h]!.amount += item.lineTotal;
    }
  }

  // Pilih 10 produk teratas berdasarkan kuantitas terjual
  const sorted = [...prodMap.values()].sort((a, b) => b.totalQty - a.totalQty || b.totalAmount - a.totalAmount);
  const top = sorted.slice(0, topLimit);

  // Cari maxQty antar sel untuk normalisasi intensitas
  let overallMaxQty = 0;
  for (const p of top) {
    for (const cell of p.hourly) {
      if (cell.qty > overallMaxQty) {
        overallMaxQty = cell.qty;
      }
    }
  }

  const topProducts: ProductPeakRow[] = top.map((p) => {
    let peakHour = 0;
    let peakHourQty = -1;

    const cells: ProductHourlyCell[] = p.hourly.map((c, hour) => {
      if (c.qty > peakHourQty) {
        peakHourQty = c.qty;
        peakHour = hour;
      }
      const intensity = overallMaxQty > 0 ? Number((c.qty / overallMaxQty).toFixed(3)) : 0;
      return {
        hour,
        qty: c.qty,
        amount: c.amount,
        intensity,
      };
    });

    return {
      productId: p.productId,
      productName: p.name,
      totalQty: p.totalQty,
      totalAmount: p.totalAmount,
      peakHour,
      peakHourQty: Math.max(0, peakHourQty),
      cells,
    };
  });

  return { topProducts, overallMaxQty, hourlyTotals };
}

// ==========================================
// 2. Waktu Teramai Penjualan (Hari x Jam Heatmap)
// ==========================================

export interface HeatmapCell {
  dayOfWeek: number;
  dayName: string;
  hour: number;
  count: number;
  total: number;
  intensity: number; // 0 to 1
}

export interface DayRow {
  dayOfWeek: number;
  dayName: string;
  dayShort: string;
  totalCount: number;
  totalSales: number;
  cells: HeatmapCell[];
}

export interface SalesHeatmapReport {
  days: DayRow[];
  maxCount: number;
  maxSales: number;
  peakCell: { dayOfWeek: number; dayName: string; hour: number; count: number; total: number } | null;
  hourlyTotals: { hour: number; label: string; count: number; total: number }[];
  overallTotals: { count: number; total: number };
}

export const DAYS_OF_WEEK = [
  { dayOfWeek: 1, name: 'Senin', short: 'Sen' },
  { dayOfWeek: 2, name: 'Selasa', short: 'Sel' },
  { dayOfWeek: 3, name: 'Rabu', short: 'Rab' },
  { dayOfWeek: 4, name: 'Kamis', short: 'Kam' },
  { dayOfWeek: 5, name: 'Jumat', short: 'Jum' },
  { dayOfWeek: 6, name: 'Sabtu', short: 'Sab' },
  { dayOfWeek: 0, name: 'Minggu', short: 'Min' },
];

export function buildSalesHeatmap(orders: Order[], timezone = 'Asia/Jakarta'): SalesHeatmapReport {
  const paid = (orders ?? []).filter((o) => o.status === 'paid');

  // grid[dayOfWeek][hour]
  const matrix: Record<number, Record<number, { count: number; total: number }>> = {};
  for (const d of DAYS_OF_WEEK) {
    matrix[d.dayOfWeek] = {};
    for (let h = 0; h < 24; h++) {
      matrix[d.dayOfWeek]![h] = { count: 0, total: 0 };
    }
  }

  const hourlyTotals = Array.from({ length: 24 }, (_, h) => {
    const pad = String(h).padStart(2, '0');
    return { hour: h, label: `${pad}:00`, count: 0, total: 0 };
  });

  let maxCount = 0;
  let maxSales = 0;
  let overallCount = 0;
  let overallTotal = 0;

  for (const o of paid) {
    const timeStr = o.closedAt ?? o.openedAt;
    let h = 0;
    let dow = 0;
    try {
      const p = localParts(new Date(timeStr), timezone);
      h = p.h;
      if (h < 0 || h > 23 || isNaN(h)) h = 0;
      const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
      dow = dt.getUTCDay();
    } catch {
      dow = 0;
      h = 0;
    }

    if (matrix[dow] && matrix[dow]![h]) {
      matrix[dow]![h]!.count += 1;
      matrix[dow]![h]!.total += o.total;

      hourlyTotals[h]!.count += 1;
      hourlyTotals[h]!.total += o.total;

      overallCount += 1;
      overallTotal += o.total;

      if (matrix[dow]![h]!.count > maxCount) {
        maxCount = matrix[dow]![h]!.count;
      }
      if (matrix[dow]![h]!.total > maxSales) {
        maxSales = matrix[dow]![h]!.total;
      }
    }
  }

  let peakCell: SalesHeatmapReport['peakCell'] = null;
  let peakMetric = -1;

  const days: DayRow[] = DAYS_OF_WEEK.map((d) => {
    let dayTotalCount = 0;
    let dayTotalSales = 0;

    const cells: HeatmapCell[] = [];
    for (let h = 0; h < 24; h++) {
      const cellData = matrix[d.dayOfWeek]![h]!;
      dayTotalCount += cellData.count;
      dayTotalSales += cellData.total;

      const intensity = maxCount > 0 ? Number((cellData.count / maxCount).toFixed(3)) : 0;
      cells.push({
        dayOfWeek: d.dayOfWeek,
        dayName: d.name,
        hour: h,
        count: cellData.count,
        total: cellData.total,
        intensity,
      });

      if (cellData.count > peakMetric) {
        peakMetric = cellData.count;
        peakCell = {
          dayOfWeek: d.dayOfWeek,
          dayName: d.name,
          hour: h,
          count: cellData.count,
          total: cellData.total,
        };
      }
    }

    return {
      dayOfWeek: d.dayOfWeek,
      dayName: d.name,
      dayShort: d.short,
      totalCount: dayTotalCount,
      totalSales: dayTotalSales,
      cells,
    };
  });

  return {
    days,
    maxCount,
    maxSales,
    peakCell: peakMetric > 0 ? peakCell : null,
    hourlyTotals,
    overallTotals: { count: overallCount, total: overallTotal },
  };
}

// ==========================================
// 3. Perputaran Stok (Stock Turnover)
// ==========================================

export interface StockTurnoverRow {
  productId: string;
  name: string;
  unit: string;
  kind: 'goods' | 'ingredient';
  currentStock: number;
  avgStock: number;
  soldQty: number;
  turnoverRatio: number; // Kuantitas terjual / Rata-rata stok
  daysOfInventory: number | null; // Hari persediaan
  status: 'fast_moving' | 'normal' | 'slow_moving' | 'dead_stock';
  statusLabel: string;
}

export interface StockTurnoverSummary {
  totalItems: number;
  fastMovingCount: number;
  normalCount: number;
  slowMovingCount: number;
  deadStockCount: number;
  avgTurnoverRatio: number;
}

export interface StockTurnoverReport {
  summary: StockTurnoverSummary;
  rows: StockTurnoverRow[];
}

export interface BuildStockTurnoverInput {
  stockItems: StockItem[];
  orders: Order[];
  periodDays?: number; // bawaan 30 hari
}

export function buildStockTurnoverReport(input: BuildStockTurnoverInput): StockTurnoverReport {
  const stockItems = input.stockItems ?? [];
  const orders = (input.orders ?? []).filter((o) => o.status === 'paid');
  const periodDays = Math.max(1, input.periodDays ?? 30);

  // Hitung jumlah barang terjual per produk / nama barang
  const soldMap = new Map<string, number>();
  for (const o of orders) {
    for (const item of o.items) {
      const pid = item.productId || item.name;
      soldMap.set(pid, (soldMap.get(pid) ?? 0) + item.qty);
      // Simpan juga pencocokan berdasarkan nama bila id berbeda
      soldMap.set(item.name.toLowerCase().trim(), (soldMap.get(item.name.toLowerCase().trim()) ?? 0) + item.qty);
    }
  }

  let fastMovingCount = 0;
  let normalCount = 0;
  let slowMovingCount = 0;
  let deadStockCount = 0;
  let sumTurnoverRatio = 0;

  const rows: StockTurnoverRow[] = stockItems.map((st) => {
    const sold = soldMap.get(st.productId) ?? soldMap.get(st.name.toLowerCase().trim()) ?? 0;
    const currentStock = st.qty;

    // Estimasi stok rata-rata: (stok akhir + (stok akhir + terjual)) / 2 = stok akhir + (terjual / 2)
    // Minimal 1 untuk menghindari pembagian dengan nol
    const avgStock = Math.max(1, Number((currentStock + sold / 2).toFixed(2)));

    // Rasio perputaran stok (Turnover Ratio)
    const turnoverRatio = Number((sold / avgStock).toFixed(2));

    // Hari persediaan (Days of Inventory) = (avgStock / sold) * periodDays
    const daysOfInventory = sold > 0 ? Math.round((avgStock / sold) * periodDays) : null;

    let status: StockTurnoverRow['status'];
    let statusLabel: string;

    if (sold === 0) {
      status = 'dead_stock';
      statusLabel = 'Macet (Dead)';
      deadStockCount++;
    } else if (turnoverRatio >= 1.2) {
      status = 'fast_moving';
      statusLabel = 'Cepat (Fast)';
      fastMovingCount++;
    } else if (turnoverRatio >= 0.5) {
      status = 'normal';
      statusLabel = 'Normal';
      normalCount++;
    } else {
      status = 'slow_moving';
      statusLabel = 'Lambat (Slow)';
      slowMovingCount++;
    }

    sumTurnoverRatio += turnoverRatio;

    return {
      productId: st.productId,
      name: st.name,
      unit: st.unit,
      kind: st.kind,
      currentStock,
      avgStock,
      soldQty: sold,
      turnoverRatio,
      daysOfInventory,
      status,
      statusLabel,
    };
  });

  // Urutkan: rasio perputaran tertinggi ke terendah, lalu terjual terbanyak
  rows.sort((a, b) => b.turnoverRatio - a.turnoverRatio || b.soldQty - a.soldQty || a.name.localeCompare(b.name, 'id'));

  const avgTurnoverRatio = rows.length > 0 ? Number((sumTurnoverRatio / rows.length).toFixed(2)) : 0;

  return {
    summary: {
      totalItems: rows.length,
      fastMovingCount,
      normalCount,
      slowMovingCount,
      deadStockCount,
      avgTurnoverRatio,
    },
    rows,
  };
}
