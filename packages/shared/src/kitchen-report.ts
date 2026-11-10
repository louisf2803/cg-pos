import type { KitchenStatus, KitchenTicket } from './kitchen';
import { localParts } from './order-number';
import type { Order } from './types';

export interface KitchenReportStationRow {
  key: string;
  stationName: string;
  ticketCount: number;
  itemCount: number;
  readyItemCount: number;
  avgReadyMinutes: number | null;
}

export interface KitchenReportHourRow {
  hour: number;
  label: string;
  ticketCount: number;
  itemCount: number;
  readyItemCount: number;
  avgReadyMinutes: number | null;
}

export interface KitchenReportStatusRow {
  status: KitchenStatus;
  label: string;
  ticketCount: number;
  itemCount: number;
}

export interface KitchenReportTotals {
  totalTickets: number;
  completedTickets: number;
  inProgressTickets: number;
  cancelledTickets: number;
  totalItems: number;
  readyItems: number;
  avgReadyMinutes: number | null;
}

export interface KitchenReport {
  totals: KitchenReportTotals;
  byStation: KitchenReportStationRow[];
  byHour: KitchenReportHourRow[];
  byStatus: KitchenReportStatusRow[];
}

export interface BuildKitchenReportInput {
  tickets: KitchenTicket[];
  voidedOrders?: Order[];
  products?: { id: string; name: string; categoryId?: string | null }[];
  categories?: { id: string; name: string }[];
  timezone?: string;
}

function calcDurationMinutes(sentAt: string, statusAt: string): number {
  const start = new Date(sentAt).getTime();
  const end = new Date(statusAt).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

const STATUS_LABELS: Record<KitchenStatus, string> = {
  new: 'Baru',
  preparing: 'Diproses',
  ready: 'Siap',
  served: 'Disajikan',
};

/**
 * Laporan operasional dapur:
 * - Menghitung jumlah tiket keseluruhan, tiket selesai, tiket dalam proses, dan tiket dibatalkan.
 * - Menghitung waktu rata-rata dari pesanan dikirim sampai siap per stasiun (kategori dapur).
 * - Menghitung waktu rata-rata dan beban pesanan per jam kerja (00-23).
 * - Menghitung sebaran status tiket saat ini.
 * Murni, tanpa efek samping.
 */
export function buildKitchenReport(input: BuildKitchenReportInput): KitchenReport {
  const tickets = input.tickets ?? [];
  const voidedOrders = input.voidedOrders ?? [];
  const tz = input.timezone || 'Asia/Jakarta';

  // Peta produk dan kategori untuk menentukan stasiun
  const prodCategoryMap = new Map<string, string>(); // productName -> categoryId
  for (const p of input.products ?? []) {
    if (p.categoryId) {
      prodCategoryMap.set(p.name.trim().toLowerCase(), p.categoryId);
    }
  }

  const catNameMap = new Map<string, string>(); // categoryId -> categoryName
  for (const c of input.categories ?? []) {
    catNameMap.set(c.id, c.name);
  }

  const resolveStation = (itemName: string): string => {
    const cid = prodCategoryMap.get(itemName.trim().toLowerCase());
    if (cid && catNameMap.has(cid)) {
      return catNameMap.get(cid)!;
    }
    return 'Dapur Utama';
  };

  // 1. Data per Status Tiket
  const statusCounts: Record<KitchenStatus, { ticketCount: number; itemCount: number }> = {
    new: { ticketCount: 0, itemCount: 0 },
    preparing: { ticketCount: 0, itemCount: 0 },
    ready: { ticketCount: 0, itemCount: 0 },
    served: { ticketCount: 0, itemCount: 0 },
  };

  // 2. Data per Stasiun
  interface StationAccumulator {
    stationName: string;
    ticketIds: Set<string>;
    itemCount: number;
    readyItemCount: number;
    totalReadyMinutes: number;
  }
  const stationMap = new Map<string, StationAccumulator>();

  const getStationAcc = (stName: string): StationAccumulator => {
    let s = stationMap.get(stName);
    if (!s) {
      s = {
        stationName: stName,
        ticketIds: new Set(),
        itemCount: 0,
        readyItemCount: 0,
        totalReadyMinutes: 0,
      };
      stationMap.set(stName, s);
    }
    return s;
  };

  // 3. Data per Jam (0..23)
  interface HourAccumulator {
    ticketIds: Set<string>;
    itemCount: number;
    readyItemCount: number;
    totalReadyMinutes: number;
  }
  const hourMap = Array.from({ length: 24 }, (): HourAccumulator => ({
    ticketIds: new Set(),
    itemCount: 0,
    readyItemCount: 0,
    totalReadyMinutes: 0,
  }));

  let overallTotalItems = 0;
  let overallReadyItems = 0;
  let overallTotalReadyMinutes = 0;
  let completedTickets = 0;
  let inProgressTickets = 0;

  for (const t of tickets) {
    const lane = t.lane;
    const ticketItemQty = t.items.reduce((sum, it) => sum + it.qty, 0);

    if (statusCounts[lane]) {
      statusCounts[lane].ticketCount += 1;
      statusCounts[lane].itemCount += ticketItemQty;
    }

    if (lane === 'ready' || lane === 'served') {
      completedTickets += 1;
    } else {
      inProgressTickets += 1;
    }

    // Jam dari sentAt
    const ticketDate = new Date(t.sentAt);
    let h = 0;
    try {
      h = localParts(ticketDate, tz).h;
      if (h < 0 || h > 23 || isNaN(h)) h = 0;
    } catch {
      h = 0;
    }

    const hourAcc = hourMap[h]!;
    hourAcc.ticketIds.add(t.orderId);

    // Proses item dalam tiket
    for (const item of t.items) {
      const qty = item.qty || 1;
      overallTotalItems += qty;
      hourAcc.itemCount += qty;

      const stationName = resolveStation(item.name);
      const stAcc = getStationAcc(stationName);
      stAcc.ticketIds.add(t.orderId);
      stAcc.itemCount += qty;

      if (item.status === 'ready' || item.status === 'served') {
        const dur = calcDurationMinutes(item.sentAt, item.statusAt);
        stAcc.readyItemCount += qty;
        stAcc.totalReadyMinutes += dur * qty;

        hourAcc.readyItemCount += qty;
        hourAcc.totalReadyMinutes += dur * qty;

        overallReadyItems += qty;
        overallTotalReadyMinutes += dur * qty;
      }
    }
  }

  // Bangun byStation
  const byStation: KitchenReportStationRow[] = [...stationMap.entries()].map(([key, s]) => ({
    key,
    stationName: s.stationName,
    ticketCount: s.ticketIds.size,
    itemCount: s.itemCount,
    readyItemCount: s.readyItemCount,
    avgReadyMinutes: s.readyItemCount > 0 ? Math.round(s.totalReadyMinutes / s.readyItemCount) : null,
  }));
  byStation.sort((a, b) => b.itemCount - a.itemCount || a.stationName.localeCompare(b.stationName, 'id'));

  // Bangun byHour (hanya jam yang memiliki tiket atau item, atau semua jam jika diinginkan)
  const byHour: KitchenReportHourRow[] = hourMap
    .map((hAcc, hour) => {
      const padHour = String(hour).padStart(2, '0');
      return {
        hour,
        label: `${padHour}:00 - ${padHour}:59`,
        ticketCount: hAcc.ticketIds.size,
        itemCount: hAcc.itemCount,
        readyItemCount: hAcc.readyItemCount,
        avgReadyMinutes: hAcc.readyItemCount > 0 ? Math.round(hAcc.totalReadyMinutes / hAcc.readyItemCount) : null,
      };
    })
    .filter((h) => h.ticketCount > 0 || h.itemCount > 0);

  // Bangun byStatus
  const byStatus: KitchenReportStatusRow[] = (['new', 'preparing', 'ready', 'served'] as KitchenStatus[]).map((st) => ({
    status: st,
    label: STATUS_LABELS[st],
    ticketCount: statusCounts[st].ticketCount,
    itemCount: statusCounts[st].itemCount,
  }));

  const cancelledTickets = voidedOrders.length;

  const totals: KitchenReportTotals = {
    totalTickets: tickets.length,
    completedTickets,
    inProgressTickets,
    cancelledTickets,
    totalItems: overallTotalItems,
    readyItems: overallReadyItems,
    avgReadyMinutes: overallReadyItems > 0 ? Math.round(overallTotalReadyMinutes / overallReadyItems) : null,
  };

  return { totals, byStation, byHour, byStatus };
}
