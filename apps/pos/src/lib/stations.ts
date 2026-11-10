import { useSyncExternalStore } from 'react';
import {
  groupByStation, printPlan, stationBytes,
  type DataLayer, type Order, type OutletContext, type PrintStation, type SentLine, type TicketMeta,
} from '@cgpos/shared';
import { printBytes, printerStore } from './printer';

/**
 * Meneruskan pesanan ke stasiun (Dapur, Bar, Label) otomatis lalu mencetak tiketnya sesuai mode cetak stasiun:
 *  - auto : kirim langsung ke printer Bluetooth bila tersambung; bila tidak, tiket menunggu di kartu "Tiket baru"
 *  - ask  : tiket menunggu di kartu, kasir menekan Cetak
 *  - off  : tidak dicetak (hanya tampil di layar dapur)
 * Tidak ada tombol kirim manual: dipanggil saat pesanan disimpan atau dibayar. Idempoten di server per baris.
 */
export interface PendingTicket { id: string; station: PrintStation; meta: TicketMeta; lines: SentLine[]; error?: string }

let tickets: PendingTicket[] = [];
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
export const ticketStore = {
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => tickets,
};
export const useTickets = () => useSyncExternalStore(ticketStore.subscribe, ticketStore.get, ticketStore.get);
export const dismissTicket = (id: string) => { tickets = tickets.filter((t) => t.id !== id); emit(); };
const addTicket = (t: PendingTicket) => { tickets = [...tickets, t]; emit(); };
export const clearTickets = () => { tickets = []; emit(); };

export const printerReady = () => printerStore.get().status === 'connected';

/** Kirim satu tiket ke printer Bluetooth; melempar galat bila gagal. */
export async function printTicket(t: PendingTicket): Promise<void> {
  await printBytes(stationBytes({ station: t.station, meta: t.meta, lines: t.lines }));
}

export interface ForwardResult { forwarded: number; stations: string[]; printed: string[]; waiting: string[]; skipped?: 'offline' | 'no-stations'; error?: string }
const none = (extra: Partial<ForwardResult> = {}): ForwardResult => ({ forwarded: 0, stations: [], printed: [], waiting: [], ...extra });

/** Pesanan yang gagal diteruskan karena offline; dicoba lagi begitu online. */
const retry = new Map<string, { args: ForwardArgs; tries: number }>();

export interface ForwardArgs { data: DataLayer; ctx: OutletContext; order: Order; cashierName: string; online?: boolean }

export async function forwardOrder(args: ForwardArgs): Promise<ForwardResult> {
  const { data, ctx, order, cashierName } = args;
  const online = args.online ?? (globalThis.navigator?.onLine ?? true);
  let stations: PrintStation[];
  try { stations = await data.listPrintStations(); } catch { stations = []; }
  if (!stations.some((s) => s.isActive)) return none({ skipped: 'no-stations' });
  if (!online) { retry.set(order.id, { args, tries: 0 }); return none({ skipped: 'offline' }); }
  let sent: { sent: number; lines: SentLine[] };
  try { sent = await data.kitchenSend(order.id); }
  catch (e) {
    retry.set(order.id, { args, tries: (retry.get(order.id)?.tries ?? 0) });
    return none({ error: e instanceof Error ? e.message : 'Gagal meneruskan ke dapur.' });
  }
  retry.delete(order.id);
  if (sent.sent === 0) return none();
  const tableName = order.tableId ? (await data.listTables().catch(() => [])).find((t) => t.id === order.tableId)?.name : undefined;
  const meta: TicketMeta = {
    orderNumber: order.number, orderType: order.type, cashierName, at: new Date().toISOString(), timezone: ctx.timezone,
    ...(tableName ? { tableName } : {}), ...(order.label ? { label: order.label } : {}), ...(order.guestCount ? { guestCount: order.guestCount } : {}),
  };
  const groups = groupByStation(sent.lines, stations);
  const plan = printPlan(groups);
  const res = none({ forwarded: sent.sent, stations: groups.map((g) => g.station.name) });
  for (const g of plan.auto) {
    const t: PendingTicket = { id: `${order.id}:${g.station.id}:${Date.now()}`, station: g.station, meta, lines: g.lines };
    if (printerReady()) {
      try { await printTicket(t); res.printed.push(g.station.name); continue; }
      catch (e) { t.error = e instanceof Error ? e.message : 'Gagal mencetak.'; }
    }
    addTicket(t); res.waiting.push(g.station.name);
  }
  for (const g of plan.ask) {
    addTicket({ id: `${order.id}:${g.station.id}:${Date.now()}`, station: g.station, meta, lines: g.lines });
    res.waiting.push(g.station.name);
  }
  return res;
}

/** Kalimat ringkas untuk pemberitahuan kasir. Kosong bila tidak ada yang perlu disampaikan. */
export function forwardNotice(r: ForwardResult): string {
  if (r.error) return `Pesanan tersimpan, tetapi belum diteruskan ke dapur: ${r.error}`;
  if (r.skipped === 'offline') return 'Offline: tiket dapur menunggu koneksi.';
  if (r.forwarded === 0) return '';
  const parts = [`${r.forwarded} baris diteruskan ke ${r.stations.join(', ')}.`];
  if (r.printed.length) parts.push(`Tiket ${r.printed.join(', ')} tercetak.`);
  if (r.waiting.length) parts.push(`Tiket ${r.waiting.join(', ')} siap dicetak.`);
  return parts.join(' ');
}

if (typeof addEventListener === 'function') {
  addEventListener('online', () => {
    setTimeout(() => {
      for (const [id, r] of [...retry]) {
        if (r.tries >= 5) { retry.delete(id); continue; }
        retry.set(id, { args: r.args, tries: r.tries + 1 });
        void forwardOrder({ ...r.args, online: true });
      }
    }, 4000);
  });
}
