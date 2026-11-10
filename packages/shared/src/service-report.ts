/**
 * Helper murni untuk Laporan Penjualan Jasa (A37).
 */

import type { Order, Product } from './types';
import { localDateKey } from './order-number';
import { toCsv } from './report';

export interface ServiceItemStat {
  productId: string;
  name: string;
  sku?: string;
  qty: number;
  revenue: number;
  avgPrice: number;
  percentOfTotal: number;
}

export interface ServiceDailyStat {
  date: string; // YYYY-MM-DD
  label: string; // Misal "10 Nov"
  revenue: number;
  orderCount: number;
  qty: number;
}

export interface ServiceReportSummary {
  totalRevenue: number;
  totalTransactions: number;
  totalQty: number;
  topService: {
    productId: string;
    name: string;
    qty: number;
    revenue: number;
  } | null;
}

export interface ServiceReport {
  summary: ServiceReportSummary;
  items: ServiceItemStat[];
  daily: ServiceDailyStat[];
}

const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatShortDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[2]!, 10);
    const monthIdx = parseInt(parts[1]!, 10) - 1;
    if (!isNaN(day) && monthIdx >= 0 && monthIdx < 12) {
      return `${day} ${ID_MONTHS[monthIdx]}`;
    }
  }
  return dateStr;
}

/**
 * Bangun agregasi laporan penjualan jasa dari daftar pesanan dan katalog produk.
 */
export function buildServiceReport(
  orders: readonly Order[],
  products: readonly Product[],
  options?: { timezone?: string; from?: string; to?: string }
): ServiceReport {
  const tz = options?.timezone ?? 'Asia/Jakarta';
  const serviceProducts = new Map<string, Product>();

  for (const p of products) {
    if (p.kind === 'service') {
      serviceProducts.set(p.id, p);
    }
  }

  // Jika tidak ada produk berjenis service, kembalikan laporan kosong
  if (serviceProducts.size === 0) {
    return {
      summary: {
        totalRevenue: 0,
        totalTransactions: 0,
        totalQty: 0,
        topService: null,
      },
      items: [],
      daily: [],
    };
  }

  const itemStatsMap = new Map<
    string,
    {
      productId: string;
      name: string;
      sku?: string;
      qty: number;
      revenue: number;
    }
  >();

  const dailyMap = new Map<
    string,
    {
      date: string;
      revenue: number;
      orderCount: number;
      qty: number;
    }
  >();

  let totalTransactions = 0;

  for (const o of orders) {
    if (o.status !== 'paid') continue;

    const orderDate = new Date(o.closedAt ?? o.openedAt);
    const dateKey = localDateKey(orderDate, tz);

    if (options?.from && dateKey < options.from) continue;
    if (options?.to && dateKey > options.to) continue;

    let orderHasService = false;

    for (const item of o.items) {
      const prod = serviceProducts.get(item.productId);
      if (!prod) continue;

      orderHasService = true;

      const cur = itemStatsMap.get(item.productId) ?? {
        productId: item.productId,
        name: prod.name || item.name,
        sku: prod.sku,
        qty: 0,
        revenue: 0,
      };

      cur.qty += item.qty;
      cur.revenue += item.lineTotal;
      itemStatsMap.set(item.productId, cur);

      const curDaily = dailyMap.get(dateKey) ?? {
        date: dateKey,
        revenue: 0,
        orderCount: 0,
        qty: 0,
      };
      curDaily.revenue += item.lineTotal;
      curDaily.qty += item.qty;
      dailyMap.set(dateKey, curDaily);
    }

    if (orderHasService) {
      totalTransactions += 1;
      const curDaily = dailyMap.get(dateKey);
      if (curDaily) {
        curDaily.orderCount += 1;
      }
    }
  }

  let totalRevenue = 0;
  let totalQty = 0;

  for (const stat of itemStatsMap.values()) {
    totalRevenue += stat.revenue;
    totalQty += stat.qty;
  }

  const items: ServiceItemStat[] = Array.from(itemStatsMap.values()).map((stat) => {
    const avgPrice = stat.qty > 0 ? Math.round(stat.revenue / stat.qty) : 0;
    const percentOfTotal = totalRevenue > 0 ? (stat.revenue / totalRevenue) * 100 : 0;

    return {
      productId: stat.productId,
      name: stat.name,
      sku: stat.sku,
      qty: stat.qty,
      revenue: stat.revenue,
      avgPrice,
      percentOfTotal,
    };
  });

  // Urutkan item berdasarkan pendapatan tertinggi, lalu kuantitas, lalu nama
  items.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || a.name.localeCompare(b.name));

  const topService =
    items.length > 0 && totalRevenue > 0
      ? {
          productId: items[0]!.productId,
          name: items[0]!.name,
          qty: items[0]!.qty,
          revenue: items[0]!.revenue,
        }
      : null;

  // Urutkan harian berdasarkan tanggal naik
  const daily: ServiceDailyStat[] = Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      label: formatShortDate(d.date),
    }));

  return {
    summary: {
      totalRevenue,
      totalTransactions,
      totalQty,
      topService,
    },
    items,
    daily,
  };
}

/**
 * Bangun baris-baris data tabular CSV untuk laporan jasa.
 */
export function buildServiceReportCsvRows(
  report: ServiceReport,
  rangeLabel?: string
): (string | number)[][] {
  const rows: (string | number)[][] = [
    ['LAPORAN PENJUALAN JASA'],
    rangeLabel ? [`Periode: ${rangeLabel}`] : [],
    [
      `Total Pendapatan: ${report.summary.totalRevenue}`,
      `Total Transaksi: ${report.summary.totalTransactions}`,
      `Total Item Terjual: ${report.summary.totalQty}`,
    ],
    [],
    [
      'Nama Jasa',
      'SKU',
      'Kuantitas',
      'Pendapatan',
      'Harga Rata-rata',
      'Kontribusi (%)',
    ],
  ];

  for (const it of report.items) {
    rows.push([
      it.name,
      it.sku ?? '-',
      it.qty,
      it.revenue,
      it.avgPrice,
      Number(it.percentOfTotal.toFixed(1)),
    ]);
  }

  const avgPriceTotal =
    report.summary.totalQty > 0
      ? Math.round(report.summary.totalRevenue / report.summary.totalQty)
      : 0;

  rows.push([]);
  rows.push([
    'TOTAL',
    '',
    report.summary.totalQty,
    report.summary.totalRevenue,
    avgPriceTotal,
    report.summary.totalRevenue > 0 ? 100 : 0,
  ]);

  return rows;
}

/**
 * Format string CSV dengan UTF-8 Byte Order Mark (BOM).
 */
export function toServiceReportCsv(
  report: ServiceReport,
  rangeLabel?: string
): string {
  const rows = buildServiceReportCsvRows(report, rangeLabel);
  return '\uFEFF' + toCsv(rows);
}

