import { useEffect, useMemo, useReducer } from 'react';
import {
  appliedFromEntries,
  computeOrder,
  effectiveTimedPrice,
  extrasKey,
  extrasLineTotal,
  newId,
  overridePricingForProduct,
  resolveDiscounts,
  resolveScheduledPrice,
  resolveTieredPrice,
  type AppliedDiscount,
  type CalcResult,
  type Channel,
  type ChannelPrice,
  type TimePrice,
  type GroupProductTieredPricing,
  type ItemExtra,
  type Order,
  type OrderType,
  type OutletContext,
  type PriceSchedule,
  type Product,
  type Promotion,
  type ResolvedDiscounts,
  type SellUnit,
} from '@cgpos/shared';

export interface CartPricingRules {
  schedules?: readonly PriceSchedule[];
  tieredPrices?: readonly GroupProductTieredPricing[];
  customerGroupId?: string | null;
  /** kanal ojek online yang dipilih kasir (hanya jenis order Antar) dan harga per kanal */
  channel?: Channel | null;
  channelPrices?: readonly ChannelPrice[];
  /** harga berdasarkan hari dan jam (zona waktu outlet); `now` bisa diisi untuk tes */
  timePrices?: readonly TimePrice[];
  timezone?: string;
  now?: Date;
}

const DAY_NUM: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
/** Hari (1 = Senin sampai 7 = Minggu) dan jam HH:MM pada zona waktu outlet. */
export function localDayTime(now: Date, tz: string): { day: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: DAY_NUM[get('weekday')] ?? 1, time: `${get('hour')}:${get('minute')}` };
}

export interface CartLine {
  id: string;
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  extras?: ItemExtra[];
  note?: string;
  /** harga daftar saat ditambahkan dan batas persen ubah harga; dipertahankan dari katalog saat muat ulang */
  basePrice?: number;
  overridePct?: number;
  manualPrice?: boolean;
  /** pajak khusus produk (persen); kosong = pakai pajak order */
  taxRate?: number | null;
  /** satuan ganda: satuan lain yang sedang dipilih (kosong = satuan dasar), pilihan yang tersedia, dan harga satuan dasar */
  unitId?: string;
  unitName?: string;
  sellUnits?: SellUnit[];
  baseUnitName?: string;
  listPrice?: number;
}

/** Nama baris untuk pesanan/struk: satuan lain dicantumkan di belakang nama, mis. "Air mineral (dus)". */
export const lineOrderName = (l: Pick<CartLine, 'name' | 'unitName'>) => (l.unitName ? `${l.name} (${l.unitName})` : l.name);


/** orderId terisi setelah pesanan pernah disimpan ke server: simpan berikutnya memperbarui pesanan yang sama, tidak membuat ganda. */
export interface CartState {
  type: OrderType;
  /** kanal ojek online (jenis order Antar); kosong = pesan langsung */
  channel?: Channel;
  lines: CartLine[];
  orderId?: string;
  tableId?: string;
  tableName?: string;
  label?: string;
  guestCount?: number;
  customerId?: string;
  customerName?: string;
  customerGroupId?: string;
  discounts: AppliedDiscount[];
}

export type Action =
  | { t: 'add'; product: Product; extras?: ItemExtra[]; pricing?: CartPricingRules; /** dari Detail Produk: jumlah, satuan lain, dan catatan */ qty?: number; unitId?: string; note?: string }
  | { t: 'custom'; productId: string; name: string; unitPrice: number; qty: number; note?: string }
  | { t: 'qty'; lineId: string; qty: number; pricing?: CartPricingRules }
  | { t: 'note'; lineId: string; note: string }
  | { t: 'unit'; lineId: string; unitId?: string; pricing?: CartPricingRules }
  | { t: 'price'; lineId: string; unitPrice: number; reason?: string }
  | { t: 'type'; type: OrderType; pricing?: CartPricingRules }
  | { t: 'channel'; channel?: Channel; pricing?: CartPricingRules }
  | { t: 'table'; tableId?: string; tableName?: string }
  | { t: 'meta'; label?: string; guestCount?: number }
  | { t: 'customer'; customerId?: string; customerName?: string; customerGroupId?: string; pricing?: CartPricingRules }
  | { t: 'discount-add'; discount: AppliedDiscount }
  | { t: 'discount-remove'; id: string }
  | { t: 'load'; order: Order; tableName?: string; products?: Product[] }
  | { t: 'saved'; orderId: string }
  | { t: 'clear' }
  | { t: 'sync-pricing'; pricing: CartPricingRules };

export function resolveEffectivePrice(
  productId: string,
  basePrice: number,
  qty: number,
  rules?: CartPricingRules,
): number {
  if (!rules) return basePrice;
  // urutan: harga kanal ojek online > harga berdasarkan waktu > jadwal harga dan harga bertingkat grup
  if (rules.channel && rules.channelPrices) {
    const cp = rules.channelPrices.find((c) => c.productId === productId && c.channel === rules.channel);
    if (cp) return cp.price;
  }
  let price = basePrice;
  if (rules.timePrices && rules.timePrices.length > 0) {
    const { day, time } = localDayTime(rules.now ?? new Date(), rules.timezone ?? 'Asia/Jakarta');
    const timed = effectiveTimedPrice(rules.timePrices as TimePrice[], productId, day, time);
    if (timed !== null) price = timed;
  }
  if (rules.schedules && rules.schedules.length > 0) {
    const sched = resolveScheduledPrice(rules.schedules, productId, price);
    price = sched.effectivePrice;
  }
  if (rules.customerGroupId && rules.tieredPrices && rules.tieredPrices.length > 0) {
    const groupTier = rules.tieredPrices.find(
      (tp) => tp.groupId === rules.customerGroupId && tp.productId === productId,
    );
    if (groupTier && groupTier.tiers.length > 0) {
      const tierRes = resolveTieredPrice(groupTier.tiers, qty, price);
      price = tierRes.unitPrice;
    }
  }
  return price;
}

const initial: CartState = { type: 'takeaway', lines: [], discounts: [] };

/** Aturan harga untuk keranjang ini: aturan dari luar + grup pelanggan + kanal (hanya bila jenis order Antar). */
const rulesFor = (s: CartState, p?: CartPricingRules): CartPricingRules => ({ ...(p ?? {}), customerGroupId: p?.customerGroupId ?? s.customerGroupId, channel: s.type === 'delivery' ? s.channel ?? null : null });
/** Harga satuan dasar hasil aturan. Harga yang berasal dari aturan (bukan diubah kasir) dicatat juga sebagai harga dasar, supaya tidak dianggap perubahan harga oleh server. */
const repriced = (l: CartLine, qty: number, rules: CartPricingRules): { unitPrice: number; basePrice: number } => {
  const price = resolveEffectivePrice(l.productId, l.listPrice ?? l.basePrice ?? l.unitPrice, qty, rules);
  return { unitPrice: price, basePrice: price };
};

export function reduce(s: CartState, a: Action): CartState {
  switch (a.t) {
    case 'add': {
      // baris yang sama = produk sama dan pilihan Ekstra sama persis
      const addQty = Math.max(1, Math.floor(a.qty ?? 1));
      const alt = a.unitId ? a.product.sellUnits?.find((u) => u.id === a.unitId) : undefined;
      const addNote = a.note?.trim().slice(0, 100) || undefined;
      const ex = s.lines.find((l) => l.productId === a.product.id && (l.unitId ?? '') === (alt?.id ?? '') && extrasKey(l.extras) === extrasKey(a.extras) && !l.note && !addNote && !l.manualPrice);
      if (ex) {
        const nextQty = ex.qty + addQty;
        const np = ex.unitId ? {} : repriced(ex, nextQty, rulesFor(s, a.pricing));
        return { ...s, lines: s.lines.map((l) => (l === ex ? { ...l, qty: nextQty, ...np } : l)) };
      }
      const initialPrice = alt ? alt.price : resolveEffectivePrice(
        a.product.id,
        a.product.price,
        addQty,
        rulesFor(s, a.pricing),
      );
      return {
        ...s,
        lines: [
          ...s.lines,
          {
            id: newId(),
            productId: a.product.id,
            name: a.product.name,
            qty: addQty,
            unitPrice: initialPrice,
            basePrice: initialPrice,
            listPrice: a.product.price,
            ...(alt ? { unitId: alt.id, unitName: alt.name } : {}),
            ...(addNote ? { note: addNote } : {}),
            ...(a.product.sellUnits?.length ? { sellUnits: a.product.sellUnits, baseUnitName: a.product.baseUnitName } : {}),
            ...(a.product.taxRate !== undefined ? { taxRate: a.product.taxRate } : {}),
            ...(a.product.priceOverridePct ? { overridePct: a.product.priceOverridePct } : {}),
            ...(a.extras?.length ? { extras: a.extras } : {}),
          },
        ],
      };
    }
    // Item bebas: selalu baris baru (nama dan harga diketik kasir), tidak digabung dengan baris lain
    case 'custom':
      return {
        ...s,
        lines: [
          ...s.lines,
          { id: newId(), productId: a.productId, name: a.name, qty: a.qty, unitPrice: a.unitPrice, ...(a.note ? { note: a.note } : {}) },
        ],
      };
    case 'qty': {
      if (a.qty <= 0) return { ...s, lines: s.lines.filter((l) => l.id !== a.lineId) };
      return {
        ...s,
        lines: s.lines.map((l) => {
          if (l.id !== a.lineId) return l;
          const np = l.manualPrice || l.unitId ? {} : repriced(l, a.qty, rulesFor(s, a.pricing));
          return { ...l, qty: a.qty, ...np };
        }),
      };
    }
    case 'unit': {
      return {
        ...s,
        lines: s.lines.map((l) => {
          if (l.id !== a.lineId) return l;
          const alt = a.unitId ? l.sellUnits?.find((u) => u.id === a.unitId) : undefined;
          if (alt) return { ...l, unitId: alt.id, unitName: alt.name, unitPrice: alt.price, basePrice: alt.price, manualPrice: false };
          // kembali ke satuan dasar: harga daftar + aturan harga bertingkat/jadwal seperti saat ditambahkan
          const { unitId: _u, unitName: _n, ...rest } = l;
          return { ...rest, ...repriced({ ...rest, listPrice: l.listPrice ?? l.unitPrice }, l.qty, rulesFor(s, a.pricing)), manualPrice: false };
        }),
      };
    }
    case 'note':
      return { ...s, lines: s.lines.map((l) => (l.id === a.lineId ? { ...l, note: a.note.slice(0, 100) || undefined } : l)) };
    case 'price':
      return {
        ...s,
        lines: s.lines.map((l) => (l.id === a.lineId ? {
          ...l,
          unitPrice: a.unitPrice,
          manualPrice: true,
          ...(a.reason ? { note: (l.note ? `${l.note} (${a.reason})` : a.reason).slice(0, 120) } : {}),
        } : l)),
      };
    case 'type': {
      const base = a.type === 'dine_in' ? { ...s, type: a.type } : { ...s, type: a.type, tableId: undefined, tableName: undefined, guestCount: undefined };
      const next: CartState = a.type === 'delivery' ? base : { ...base, channel: undefined };
      // jenis order berubah: harga kanal ikut berlaku atau lepas
      return { ...next, lines: next.lines.map((l) => (l.manualPrice || l.unitId ? l : { ...l, ...repriced(l, l.qty, rulesFor(next, a.pricing)) })) };
    }
    case 'channel': {
      const next: CartState = { ...s, channel: a.channel };
      return { ...next, lines: next.lines.map((l) => (l.manualPrice || l.unitId ? l : { ...l, ...repriced(l, l.qty, rulesFor(next, a.pricing)) })) };
    }
    case 'table':
      return { ...s, tableId: a.tableId, tableName: a.tableName };
    case 'meta':
      return { ...s, label: a.label, guestCount: a.guestCount };
    // Poin milik pelanggan tertentu: ganti atau lepas pelanggan = potongan poin ikut lepas.
    case 'customer': {
      const gId = a.customerGroupId;
      const pricingOpts: CartPricingRules = {
        ...a.pricing,
        customerGroupId: gId,
      };
      return {
        ...s,
        customerId: a.customerId,
        customerName: a.customerName,
        customerGroupId: gId,
        discounts: a.customerId === s.customerId ? s.discounts : s.discounts.filter((d) => d.source !== 'points'),
        lines: s.lines.map((l) => {
          if (l.manualPrice || l.unitId) return l;
          return { ...l, ...repriced(l, l.qty, rulesFor(s, pricingOpts)) };
        }),
      };
    }
    case 'sync-pricing': {
      const effectivePricing: CartPricingRules = {
        ...a.pricing,
        customerGroupId: a.pricing.customerGroupId ?? s.customerGroupId,
      };
      return {
        ...s,
        customerGroupId: effectivePricing.customerGroupId ?? undefined,
        lines: s.lines.map((l) => {
          if (l.manualPrice || l.unitId) return l;
          return { ...l, ...repriced(l, l.qty, rulesFor(s, effectivePricing)) };
        }),
      };
    }
    case 'discount-add':
      return { ...s, discounts: [...s.discounts, a.discount] };
    case 'discount-remove':
      return { ...s, discounts: s.discounts.filter((d) => d.id !== a.id) };
    case 'load': {
      const byId = new Map((a.products ?? []).map((p) => [p.id, p]));
      return {
        discounts: appliedFromEntries(a.order.discounts ?? (a.order.discountTotal > 0 ? [{ id: newId(), source: 'manual', label: 'Diskon', amount: a.order.discountTotal }] : [])),
        type: a.order.type,
        customerId: a.order.customerId,
        customerName: a.order.customerName,
        orderId: a.order.id,
        tableId: a.order.tableId,
        tableName: a.tableName,
        label: a.order.label,
        guestCount: a.order.guestCount,
        lines: a.order.items.map((i) => {
          const prod = byId.get(i.productId);
          const alt = i.unitId ? prod?.sellUnits?.find((u) => u.id === i.unitId) : undefined;
          const suffix = alt ? ` (${alt.name})` : '';
          return {
          id: i.id,
          productId: i.productId,
          name: suffix && i.name.endsWith(suffix) ? i.name.slice(0, -suffix.length) : i.name,
          qty: i.qty,
          unitPrice: i.unitPrice,
          ...overridePricingForProduct(prod),
          ...(prod ? { listPrice: prod.price } : {}),
          ...(prod?.sellUnits?.length ? { sellUnits: prod.sellUnits, baseUnitName: prod.baseUnitName } : {}),
          ...(alt ? { unitId: alt.id, unitName: alt.name, basePrice: alt.price } : {}),
          ...(i.extras?.length ? { extras: i.extras } : {}),
          ...(i.note ? { note: i.note } : {}),
          taxRate: byId.get(i.productId)?.taxRate,
          };
        }),
      };
    }
    case 'saved':
      return { ...s, orderId: a.orderId };
    case 'clear':
      return initial;
  }
}

export function useCart(
  ctx: OutletContext,
  roundingStep = 0,
  promos: Promotion[] = [],
  pricing?: CartPricingRules,
) {
  const [state, dispatch] = useReducer(reduce, initial);

  useEffect(() => {
    if (pricing) {
      dispatch({ t: 'sync-pricing', pricing });
    }
  }, [pricing?.customerGroupId, pricing?.schedules, pricing?.tieredPrices, pricing?.channelPrices, pricing?.timePrices]);

  const discounts: ResolvedDiscounts = useMemo(
    () => resolveDiscounts(state.discounts, promos, {
      orderType: state.type, lines: state.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice, extrasTotal: extrasLineTotal(l.qty, l.extras) })),
    }, new Date()),
    [state, promos],
  );
  const calc: CalcResult = useMemo(
    () => computeOrder({
      orderType: state.type, orderTaxes: ctx.taxes, settings: ctx.settings, roundingStep, orderDiscount: discounts.total,
      items: state.lines.map((l) => ({ id: l.id, qty: l.qty, unitPrice: l.unitPrice, extrasTotal: extrasLineTotal(l.qty, l.extras), taxRate: l.taxRate ?? undefined })),
    }),
    [state, ctx, roundingStep, discounts],
  );
  const count = state.lines.reduce((a, l) => a + l.qty, 0);
  return { state, calc, count, dispatch, discounts };
}
