/** Layar dapur: status per baris, pengelompokan menjadi tiket per pesanan, dan penanda lama menunggu. */

export type KitchenStatus = 'new' | 'preparing' | 'ready' | 'served';
export const KITCHEN_STATUSES: KitchenStatus[] = ['new', 'preparing', 'ready', 'served'];
export const KITCHEN_STATUS_LABEL: Record<KitchenStatus, string> = { new: 'Baru', preparing: 'Diproses', ready: 'Siap', served: 'Disajikan' };
/** Langkah maju: Baru, Diproses, Siap, Disajikan. */
export const KITCHEN_NEXT: Partial<Record<KitchenStatus, KitchenStatus>> = { new: 'preparing', preparing: 'ready', ready: 'served' };
export const KITCHEN_NEXT_LABEL: Partial<Record<KitchenStatus, string>> = { new: 'Mulai olah', preparing: 'Tandai siap', ready: 'Sudah disajikan' };

/** Baris datar dari server, satu per baris pesanan yang sudah dikirim ke dapur. */
export interface KitchenRow {
  itemId: string; orderId: string; orderNumber: string; orderType: string; tableName?: string; label?: string; guestCount?: number; queueNo?: number;
  name: string; qty: number; note?: string; extras: { name: string; qty: number }[]; status: KitchenStatus; sentAt: string; statusAt: string; stationId?: string;
}
export interface KitchenTicket {
  orderId: string; orderNumber: string; orderType: string; tableName?: string; label?: string; guestCount?: number; queueNo?: number;
  items: KitchenRow[]; sentAt: string;
  /** tahap paling awal yang belum selesai: tiket tampil di kolom ini */
  lane: KitchenStatus;
}

export function ticketLane(items: { status: KitchenStatus }[]): KitchenStatus {
  if (items.some((i) => i.status === 'new')) return 'new';
  if (items.some((i) => i.status === 'preparing')) return 'preparing';
  if (items.some((i) => i.status === 'ready')) return 'ready';
  return 'served';
}

/** Kelompokkan baris menjadi tiket per pesanan, tiket tertua di depan. */
export function groupTickets(rows: KitchenRow[]): KitchenTicket[] {
  const by = new Map<string, KitchenTicket>();
  for (const r of rows) {
    let t = by.get(r.orderId);
    if (!t) {
      t = { orderId: r.orderId, orderNumber: r.orderNumber, orderType: r.orderType, items: [], sentAt: r.sentAt, lane: 'new',
        ...(r.tableName ? { tableName: r.tableName } : {}), ...(r.label ? { label: r.label } : {}), ...(r.guestCount !== undefined ? { guestCount: r.guestCount } : {}), ...(r.queueNo !== undefined ? { queueNo: r.queueNo } : {}) };
      by.set(r.orderId, t);
    }
    t.items.push(r);
    if (r.sentAt < t.sentAt) t.sentAt = r.sentAt;
  }
  const out = [...by.values()];
  for (const t of out) { t.lane = ticketLane(t.items); t.items.sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.name.localeCompare(b.name, 'id')); }
  return out.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

export type KitchenAlert = 'ok' | 'warn' | 'late';
export interface KitchenThresholds { warnMin: number; lateMin: number }
export const DEFAULT_KITCHEN_THRESHOLDS: KitchenThresholds = { warnMin: 10, lateMin: 20 };
export const waitMinutes = (sentAt: string, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(sentAt).getTime()) / 60000));
export function kitchenAlert(minutes: number, t: KitchenThresholds = DEFAULT_KITCHEN_THRESHOLDS): KitchenAlert {
  return minutes >= t.lateMin ? 'late' : minutes >= t.warnMin ? 'warn' : 'ok';
}
export function thresholdsProblem(t: KitchenThresholds): string | null {
  if (!Number.isInteger(t.warnMin) || !Number.isInteger(t.lateMin)) return 'Isi menit dengan bilangan bulat.';
  if (t.warnMin < 1 || t.lateMin > 240) return 'Batas waktu antara 1 dan 240 menit.';
  if (t.warnMin >= t.lateMin) return 'Batas peringatan harus lebih kecil dari batas terlambat.';
  return null;
}

/** Saring baris dapur berdasarkan stasiun. Nilai kosong atau 'all' mengembalikan semua baris. */
export function filterRowsByStation(rows: KitchenRow[], stationId?: string | null): KitchenRow[] {
  if (!stationId || stationId === 'all') return rows;
  return rows.filter((r) => r.stationId === stationId);
}

