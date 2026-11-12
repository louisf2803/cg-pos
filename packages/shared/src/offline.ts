import type { DataLayer } from './data';
import { DataError } from './types';
import type { Order, OrderDraft, OutletContext, PaymentInput, Refund, Shift, ShiftReport } from './types';
import { computeOrder } from './order-calc';
import { extrasLineTotal } from './extras';
import { formatRp, roundToStep } from './money';
import { newId } from './id';
import { hashPin } from './hash';

/** Penyimpanan kunci-nilai sinkron (localStorage di peramban, Map di tes). */
export interface KV { get(key: string): string | null; set(key: string, value: string): void }
export const memoryKV = (): KV => { const m = new Map<string, string>(); return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) }; };

export type PendingKind = 'order' | 'payment' | 'void' | 'refund' | 'shift_open' | 'shift_close';

export interface PendingEntry {
  id: string; kind: PendingKind; orderId: string;
  /** teks singkat untuk daftar: nomor sementara + ringkasan */
  label: string; amount: number; createdAt: string;
  status: 'waiting' | 'failed'; error?: string; attempts: number;
  draft?: OrderDraft; cashierId?: string; payment?: PaymentInput;
  reason?: string; authMethod?: 'pin' | 'code';
  refundInput?: Parameters<DataLayer['refundOrder']>[0];
  shiftOpenInput?: Parameters<DataLayer['openShift']>[0];
  shiftCloseInput?: Parameters<DataLayer['closeShift']>[0];
}

export interface SyncHistoryEntry {
  id: string;
  timestamp: string;
  status: 'success' | 'failed';
  durationMs: number;
  itemsPulled: number;
  error?: string;
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
  /** Sinkronisasi lengkap semua data katalog/outlet dari server ke cache lokal. */
  syncPull(): Promise<SyncHistoryEntry>;
  /** Riwayat sinkronisasi lokal. */
  getSyncHistory(): SyncHistoryEntry[];
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
  'listExtraGroups', 'listFloors', 'listTables', 'listTableStatus', 'listPromotions', 'getLoyaltyRules', 'getCustomItemProductId', 'listPrintStations', 'listNotePresets',
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
  const K = { queue: 'cgpos.offline.queue', orders: 'cgpos.offline.orders', seq: 'cgpos.offline.seq', shift: 'cgpos.offline.shift', sync: 'cgpos.offline.sync_history' };
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
      else if (e.kind === 'payment') await inner.addPayment(e.orderId, e.payment!);
      else if (e.kind === 'void') await inner.voidUnpaidOrder(e.orderId, e.reason ?? 'Batal offline', e.cashierId ?? '', e.authMethod);
      else if (e.kind === 'refund') await inner.refundOrder(e.refundInput!);
      else if (e.kind === 'shift_open') await inner.openShift(e.shiftOpenInput!);
      else if (e.kind === 'shift_close') await inner.closeShift(e.shiftCloseInput!);
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
  api.verifyPin = async (employeeId: string, pin: string): Promise<boolean> => {
    if (isOnline()) {
      try {
        const ok = await inner.verifyPin(employeeId, pin);
        if (ok) {
          const hash = await hashPin(employeeId, pin);
          kv.set(`cgpos.offline.pin_hash.${employeeId}`, hash);
        }
        return ok;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
      }
    }
    const cachedHash = kv.get(`cgpos.offline.pin_hash.${employeeId}`);
    if (!cachedHash) {
      throw new DataError(
        'forbidden',
        'PIN belum pernah diverifikasi di perangkat ini saat online. Masuk pertama kali membutuhkan koneksi internet.',
      );
    }
    const computed = await hashPin(employeeId, pin);
    return computed === cachedHash;
  };

  api.voidUnpaidOrder = async (orderId: string, reason: string, by: string, authMethod?: 'pin' | 'code') => {
    if (local[orderId]) {
      const o = local[orderId]!;
      o.status = 'void';
      o.closedAt = now().toISOString();
      delete local[orderId];
      queue = queue.filter((x) => x.orderId !== orderId);
      persist();
      return o;
    }
    if (isOnline() && queue.length === 0) {
      try {
        return await inner.voidUnpaidOrder(orderId, reason, by, authMethod);
      } catch (e) {
        if (!isNetworkError(e)) throw e;
      }
    }
    const at = now().toISOString();
    enqueue({
      orderId,
      kind: 'void',
      label: `Batal pesanan ${orderId} (${reason})`,
      amount: 0,
      reason,
      cashierId: by,
      authMethod,
    });
    persist();
    void flush();
    return {
      id: orderId,
      number: orderId,
      status: 'void',
      openedAt: at,
      closedAt: at,
      cashierId: by,
      items: [],
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      serviceFeeTotal: 0,
      rounding: 0,
      total: 0,
      paidTotal: 0,
      payments: [],
      notes: reason,
    } as unknown as Order;
  };

  api.refundOrder = async (input: Parameters<DataLayer['refundOrder']>[0]): Promise<Refund> => {
    if (isOnline() && queue.length === 0) {
      try {
        return await inner.refundOrder(input);
      } catch (e) {
        if (!isNetworkError(e)) throw e;
      }
    }
    const at = now().toISOString();
    const ref: Refund = {
      id: input.id || newId(),
      number: `REF-OFF-${Date.now().toString().slice(-4)}`,
      orderId: input.orderId,
      total: input.items.reduce((sum, it) => sum + (it.qty * 10000), 0),
      reason: input.reason,
      note: input.note,
      methodName: 'Tunai',
      createdAt: at,
      items: input.items.map((it) => ({ orderItemId: it.orderItemId, qty: it.qty, amount: 0 })),
    };
    enqueue({
      orderId: input.orderId,
      kind: 'refund',
      label: `Pengembalian dana ${input.orderId} · ${input.reason}`,
      amount: ref.total,
      refundInput: input,
      cashierId: input.authorizedBy,
    });
    persist();
    void flush();
    return ref;
  };

  api.openShift = async (input: Parameters<DataLayer['openShift']>[0]): Promise<Shift> => {
    if (isOnline() && queue.length === 0) {
      try {
        const s = await inner.openShift(input);
        save(K.shift, s);
        return s;
      } catch (e) {
        if (!isNetworkError(e)) throw e;
      }
    }
    const at = now().toISOString();
    const shift: Shift = {
      id: input.id,
      cashierId: input.cashierId,
      openedAt: at,
      openingCash: input.openingCash,
      status: 'open',
    };
    save(K.shift, shift);
    enqueue({
      orderId: shift.id,
      kind: 'shift_open',
      label: `Buka shift offline (${formatRp(input.openingCash)})`,
      amount: input.openingCash,
      shiftOpenInput: input,
      cashierId: input.cashierId,
    });
    persist();
    void flush();
    return shift;
  };

  api.currentShift = async (): Promise<Shift | null> => {
    const localShift = load<Shift | null>(K.shift, null);
    if (localShift) return localShift;
    return cachedRead('currentShift', []);
  };

  api.closeShift = async (input: Parameters<DataLayer['closeShift']>[0]): Promise<ShiftReport> => {
    if (queue.some((e) => e.kind === 'order' || e.kind === 'payment')) {
      throw new DataError(
        'order_locked',
        'Masih ada transaksi tertunda. Sambungkan internet atau buang transaksi dengan persetujuan manajer sebelum menutup kasir.',
      );
    }
    if (isOnline()) {
      try {
        const res = await inner.closeShift(input);
        save(K.shift, null);
        return res;
      } catch (e) {
        if (!isNetworkError(e)) throw e;
      }
    }
    const cur = load<Shift | null>(K.shift, null);
    const at = now().toISOString();
    save(K.shift, null);
    enqueue({
      orderId: input.shiftId,
      kind: 'shift_close',
      label: `Tutup shift offline (${formatRp(input.counted)})`,
      amount: input.counted,
      shiftCloseInput: input,
      cashierId: input.closedBy,
    });
    persist();
    void flush();
    const closedShift: Shift = cur ?? {
      id: input.shiftId,
      cashierId: input.closedBy,
      openedAt: at,
      openingCash: 0,
      status: 'closed',
      closedAt: at,
      counted: input.counted,
      expectedCash: input.counted,
      variance: 0,
    };
    return {
      shift: { ...closedShift, status: 'closed', closedAt: at, counted: input.counted, expectedCash: input.counted, variance: 0 },
      expectedCash: input.counted,
      counted: input.counted,
      variance: 0,
      cashSales: 0,
      otherSales: 0,
      cashIn: 0,
      cashOut: 0,
      orderCount: 0,
      byMethod: [],
      cashRefunds: 0,
      productsSold: [],
    };
  };

  async function syncPull(): Promise<SyncHistoryEntry> {
    const start = Date.now();
    const at = now().toISOString();
    if (!isOnline()) {
      const failedEntry: SyncHistoryEntry = {
        id: newId(),
        timestamp: at,
        status: 'failed',
        durationMs: Date.now() - start,
        itemsPulled: 0,
        error: 'Tidak ada koneksi internet',
      };
      const hist = load<SyncHistoryEntry[]>(K.sync, []);
      save(K.sync, [failedEntry, ...hist].slice(0, 20));
      return failedEntry;
    }

    try {
      const names = [
        'getContext',
        'listCategories',
        'listDepartments',
        'listProducts',
        'listEmployees',
        'listPaymentMethods',
        'listFloors',
        'listTables',
        'listTableStatus',
        'listPromotions',
        'getLoyaltyRules',
        'listPrintStations',
        'listNotePresets',
      ];
      const pulls = await Promise.all(names.map((name) => call(name, [])));
      let count = 0;
      pulls.forEach((res, i) => {
        save(cacheKey(names[i]!, []), res);
        count += Array.isArray(res) ? res.length : 1;
      });

      const successEntry: SyncHistoryEntry = {
        id: newId(),
        timestamp: at,
        status: 'success',
        durationMs: Date.now() - start,
        itemsPulled: count,
      };
      const hist = load<SyncHistoryEntry[]>(K.sync, []);
      save(K.sync, [successEntry, ...hist].slice(0, 20));
      return successEntry;
    } catch (e) {
      const errEntry: SyncHistoryEntry = {
        id: newId(),
        timestamp: at,
        status: 'failed',
        durationMs: Date.now() - start,
        itemsPulled: 0,
        error: e instanceof Error ? e.message : 'Gagal sinkronisasi data',
      };
      const hist = load<SyncHistoryEntry[]>(K.sync, []);
      save(K.sync, [errEntry, ...hist].slice(0, 20));
      return errEntry;
    }
  }

  function getSyncHistory(): SyncHistoryEntry[] {
    return load<SyncHistoryEntry[]>(K.sync, []);
  }

  const pending: PendingApi = {
    list: () => clone(queue),
    subscribe: (fn) => { subs.add(fn); return () => void subs.delete(fn); },
    flush,
    syncPull,
    getSyncHistory,
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
