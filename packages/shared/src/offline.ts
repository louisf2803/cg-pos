import type { DataLayer } from './data';
import { DataError } from './types';
import type { Order, OrderDraft, OutletContext, PaymentInput } from './types';
import { computeOrder } from './order-calc';
import { extrasLineTotal } from './extras';
import { roundToStep } from './money';
import { newId } from './id';

/** Penyimpanan kunci-nilai sinkron (localStorage di peramban, Map di tes). */
export interface KV { get(key: string): string | null; set(key: string, value: string): void }
export const memoryKV = (): KV => { const m = new Map<string, string>(); return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) }; };

export interface PendingEntry {
  id: string; kind: 'order' | 'payment'; orderId: string;
  /** teks singkat untuk daftar: nomor sementara + ringkasan */
  label: string; amount: number; createdAt: string;
  status: 'waiting' | 'failed'; error?: string; attempts: number;
  draft?: OrderDraft; cashierId?: string; payment?: PaymentInput;
}

export interface PendingApi {
  list(): PendingEntry[];
  subscribe(fn: () => void): () => void;
  /** Kirim semua yang menunggu sesuai urutan. Berhenti bila koneksi putus. */
  flush(): Promise<void>;
  /** Setel ulang entri gagal menjadi menunggu lalu kirim. */
  retry(id: string): Promise<void>;
  /** Buang entri (dan entri turunannya). Pemanggil wajib sudah meminta PIN manajer. */
  discard(id: string): void;
}
export type OfflineData = DataLayer & { pending: PendingApi };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function isNetworkError(e: unknown): boolean {
  if (e instanceof DataError) return e.code === 'network';
  if (e instanceof TypeError) return true;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(e instanceof Error ? e.message : String(e));
}

const CACHED_READS = [
  'getContext', 'listCategories', 'listDepartments', 'listProducts', 'listEmployees', 'listPaymentMethods', 'currentShift',
  'listExtraGroups', 'listFloors', 'listTables', 'listTableStatus', 'listPromotions', 'getLoyaltyRules', 'getCustomItemProductId',
] as const;

interface Options { storage: KV; isOnline?: () => boolean; now?: () => Date }

/**
 * Pembungkus DataLayer untuk kasir yang koneksinya kadang putus:
 *  - bacaan yang dipakai kasir disimpan; saat offline dipakai salinan terakhir
 *  - pesanan dan pembayaran yang dibuat saat offline dihitung di perangkat, disimpan di antrean, dan dikirim
 *    ke server (idempoten menurut id) begitu koneksi kembali. Yang ditolak server tampil di daftar tertunda.
 * Batasan: nomor pesanan sementara diganti nomor server saat terkirim; refund, void, buka/tutup shift butuh koneksi.
 */
export function createOfflineData(inner: DataLayer, opts: Options): OfflineData {
  const kv = opts.storage;
  const isOnline = opts.isOnline ?? (() => ((globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine ?? true));
  const now = opts.now ?? (() => new Date());
  const K = { queue: 'cgpos.offline.queue', orders: 'cgpos.offline.orders', seq: 'cgpos.offline.seq' };
  const load = <T,>(k: string, d: T): T => { try { const v = kv.get(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
  const save = (k: string, v: unknown) => { try { kv.set(k, JSON.stringify(v)); } catch { /* penyimpanan penuh/diblokir: antrean tetap di memori */ } };

  let queue: PendingEntry[] = load(K.queue, []);
  let local: Record<string, Order> = load(K.orders, {});
  const subs = new Set<() => void>();
  const persist = () => { save(K.queue, queue); save(K.orders, local); subs.forEach((f) => f()); };
  let flushing: Promise<void> | null = null;

  const call = <T,>(name: string, args: unknown[]): Promise<T> => (inner as unknown as Record<string, (...a: unknown[]) => Promise<T>>)[name]!(...args);
  const cacheKey = (name: string, args: unknown[]) => `cgpos.offline.cache.${name}.${JSON.stringify(args)}`;

  async function cachedRead<T>(name: string, args: unknown[]): Promise<T> {
    if (!isOnline()) {
      const hit = kv.get(cacheKey(name, args));
      if (hit !== null) return JSON.parse(hit) as T;
    }
    try {
      const v = await call<T>(name, args);
      save(cacheKey(name, args), v);
      return v;
    } catch (e) {
      const hit = kv.get(cacheKey(name, args));
      if (isNetworkError(e) && hit !== null) return JSON.parse(hit) as T;
      throw e;
    }
  }

  async function ctxOffline(): Promise<OutletContext> { return cachedRead<OutletContext>('getContext', []); }

  function localNumber(ctx: OutletContext): string {
    const n = (load<number>(K.seq, 0)) + 1; save(K.seq, n);
    return `${ctx.outletCode}/${ctx.deviceCode}/OFF-${String(n).padStart(3, '0')}`;
  }

  function buildLocalOrder(draft: OrderDraft, cashierId: string, ctx: OutletContext, existing?: Order): Order {
    const calc = computeOrder({
      orderType: draft.type, orderDiscount: draft.orderDiscount, roundingStep: 0, settings: ctx.settings,
      items: draft.items.map((i) => ({ id: i.id, qty: i.qty, unitPrice: i.unitPrice, extrasTotal: extrasLineTotal(i.qty, i.extras) })),
      orderTaxes: ctx.taxes.map((t) => ({ taxId: t.id, name: t.name, rate: t.rate })),
    });
    return {
      id: draft.id, number: existing?.number ?? localNumber(ctx), type: draft.type, tableId: draft.tableId, customerId: draft.customerId, customerName: draft.customerName, discounts: draft.discounts, label: draft.label, guestCount: draft.guestCount,
      cashierId, status: 'open', items: draft.items.map((d, k) => ({ ...d, lineTotal: calc.lines[k]!.lineTotal })),
      subtotal: calc.subtotal, discountTotal: calc.discountTotal, serviceCharge: calc.serviceCharge, taxTotal: calc.taxTotal, rounding: 0, total: calc.total, paidTotal: 0,
      payments: [], openedAt: existing?.openedAt ?? now().toISOString(),
    };
  }

  const enqueue = (e: Omit<PendingEntry, 'id' | 'createdAt' | 'status' | 'attempts'>) => {
    queue.push({ ...e, id: newId(), createdAt: now().toISOString(), status: 'waiting', attempts: 0 });
  };
  const hasPending = (orderId: string) => queue.some((e) => e.orderId === orderId);

  async function sendEntry(e: PendingEntry): Promise<'sent' | 'offline' | 'failed'> {
    e.attempts += 1;
    try {
      if (e.kind === 'order') await inner.saveOrder(e.draft!, e.cashierId!);
      else await inner.addPayment(e.orderId, e.payment!);
      return 'sent';
    } catch (err) {
      if (isNetworkError(err)) return 'offline';
      e.status = 'failed'; e.error = err instanceof Error ? err.message : 'Ditolak server';
      return 'failed';
    }
  }

  function flush(): Promise<void> {
    if (flushing) return flushing;
    flushing = (async () => {
      if (!isOnline()) return;
      for (const e of [...queue]) {
        if (e.status === 'failed') continue;
        // entri turunan dari pesanan yang gagal ikut tertahan
        const blocker = queue.find((x) => x.orderId === e.orderId && x.kind === 'order' && x.status === 'failed');
        if (blocker && blocker.id !== e.id) { e.status = 'failed'; e.error = 'Menunggu pesanan induknya terkirim'; continue; }
        const r = await sendEntry(e);
        if (r === 'offline') break;
        if (r === 'sent') {
          queue = queue.filter((x) => x.id !== e.id);
          if (!queue.some((x) => x.orderId === e.orderId)) delete local[e.orderId];
        }
      }
      persist();
    })().finally(() => { flushing = null; });
    return flushing;
  }

  const api: Record<string, unknown> = {};
  for (const k of Object.keys(inner)) api[k] = (...a: unknown[]) => call(k, a);
  for (const name of CACHED_READS) api[name] = (...a: unknown[]) => cachedRead(name, a);

  api.saveOrder = async (draft: OrderDraft, cashierId: string): Promise<Order> => {
    const mine = local[draft.id];
    if (mine && mine.paidTotal > 0) throw new DataError('order_locked', 'Pesanan sudah ada pembayaran, tidak bisa diubah');
    if (!mine && isOnline() && queue.length === 0) {
      try { return await inner.saveOrder(draft, cashierId); } catch (e) { if (!isNetworkError(e)) throw e; }
    }
    if (draft.items.length === 0) throw new DataError('invalid', 'Pesanan masih kosong');
    if (draft.items.some((i) => i.qty <= 0)) throw new DataError('invalid', 'Jumlah item harus lebih dari 0');
    const ctx = await ctxOffline();
    const o = buildLocalOrder(draft, cashierId, ctx, mine);
    local[o.id] = o;
    queue = queue.filter((e) => !(e.kind === 'order' && e.orderId === o.id));
    enqueue({ orderId: o.id, kind: 'order', label: `${o.number} · ${o.items.reduce((n, i) => n + i.qty, 0)} item`, amount: o.total, draft, cashierId });
    persist();
    void flush();
    return clone(o);
  };

  api.addPayment = async (orderId: string, pay: PaymentInput): Promise<Order> => {
    const o = local[orderId];
    if (!o) {
      if (isOnline() && !hasPending(orderId)) {
        try { return await inner.addPayment(orderId, pay); } catch (e) { if (!isNetworkError(e)) throw e; throw new DataError('network', 'Koneksi terputus. Muat ulang pesanan lalu coba lagi.'); }
      }
      throw new DataError('network', 'Tidak ada koneksi. Pesanan ini sudah tersimpan di server; bayar saat online.');
    }
    if (o.payments.some((p) => p.id === pay.id)) return clone(o);
    const ctx = await ctxOffline();
    const methods = await cachedRead<Awaited<ReturnType<DataLayer['listPaymentMethods']>>>('listPaymentMethods', []);
    const m = methods.find((x) => x.id === pay.methodId);
    if (!m) throw new DataError('not_found', 'Metode bayar tidak ditemukan');
    if (m.kind === 'gateway') throw new DataError('invalid', 'Pembayaran QRIS (DOKU) belum diaktifkan');
    const step = m.kind === 'cash' ? ctx.settings.roundingCashStep : ctx.settings.roundingNoncashStep;
    let total = o.total, rounding = o.rounding;
    if (o.paidTotal === 0 && step) { total = roundToStep(o.total, step); rounding = total - o.total; }
    if (pay.amount <= 0 || pay.amount > total - o.paidTotal) throw new DataError('bad_amount', 'Jumlah melebihi sisa tagihan');
    const tendered = pay.tendered ?? pay.amount;
    const at = pay.paidAt ?? now().toISOString();
    o.payments.push({ id: pay.id, methodId: m.id, methodName: m.name, kind: m.kind, amount: pay.amount, tendered, change: m.kind === 'cash' ? Math.max(tendered - pay.amount, 0) : 0, paidAt: at, ...(pay.reference?.trim() ? { reference: pay.reference.trim() } : {}) });
    o.total = total; o.rounding = rounding; o.paidTotal += pay.amount;
    o.status = o.paidTotal >= o.total ? 'paid' : 'partially_paid';
    if (o.status === 'paid') o.closedAt = at;
    enqueue({ orderId, kind: 'payment', label: `Pembayaran ${m.name} · ${o.number}`, amount: pay.amount, payment: { ...pay, paidAt: at } });
    persist();
    void flush();
    return clone(o);
  };

  api.getOrder = async (id: string) => (local[id] ? clone(local[id]!) : call<Order | null>('getOrder', [id]));
  api.listOrders = async (q: Parameters<DataLayer['listOrders']>[0] = {}) => {
    const mine = Object.values(local).filter((o) => !q.status || o.status === q.status);
    let remote: Order[] = [];
    try { remote = await call<Order[]>('listOrders', [q]); } catch (e) { if (!isNetworkError(e)) throw e; }
    const ids = new Set(mine.map((o) => o.id));
    return [...mine.map((o) => clone(o)), ...remote.filter((o) => !ids.has(o.id))].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  };
  api.voidUnpaidOrder = async (orderId: string, reason: string, by: string, authMethod?: 'pin' | 'code') => {
    if (local[orderId] || hasPending(orderId)) {
      if (isOnline()) await flush();
      if (local[orderId] || hasPending(orderId)) throw new DataError('network', 'Pesanan ini belum terkirim ke server. Sinkronkan dulu atau hapus dari daftar tertunda.');
    }
    return inner.voidUnpaidOrder(orderId, reason, by, authMethod);
  };
  api.closeShift = async (input: Parameters<DataLayer['closeShift']>[0]) => {
    if (queue.length > 0) {
      await flush();
      if (queue.length > 0) throw new DataError('invalid', `Masih ada ${queue.length} transaksi tertunda. Sinkronkan atau selesaikan dulu sebelum tutup kasir.`);
    }
    return inner.closeShift(input);
  };

  const pending: PendingApi = {
    list: () => clone(queue),
    subscribe: (fn) => { subs.add(fn); return () => void subs.delete(fn); },
    flush,
    async retry(id) {
      const e = queue.find((x) => x.id === id);
      if (e) { e.status = 'waiting'; e.error = undefined; }
      // entri turunan yang ikut tertahan dibuka lagi
      if (e?.kind === 'order') for (const x of queue) if (x.orderId === e.orderId && x.status === 'failed' && x.error?.startsWith('Menunggu')) { x.status = 'waiting'; x.error = undefined; }
      persist();
      await flush();
    },
    discard(id) {
      const e = queue.find((x) => x.id === id);
      if (!e) return;
      queue = queue.filter((x) => (e.kind === 'order' ? x.orderId !== e.orderId : x.id !== e.id));
      if (e.kind === 'order') delete local[e.orderId];
      else if (local[e.orderId] && !queue.some((x) => x.orderId === e.orderId)) delete local[e.orderId];
      else if (local[e.orderId]) {
        // pembayaran dibuang: hitung ulang status pesanan lokal dari pembayaran yang tersisa
        const o = local[e.orderId]!; const p = o.payments.find((x) => x.id === e.payment?.id);
        if (p) { o.payments = o.payments.filter((x) => x !== p); o.paidTotal -= p.amount; o.status = o.paidTotal > 0 ? 'partially_paid' : 'open'; o.closedAt = undefined; }
      }
      persist();
    },
  };
  api.pending = pending;
  return api as unknown as OfflineData;
}
