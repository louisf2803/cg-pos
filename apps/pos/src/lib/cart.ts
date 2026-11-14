import { useEffect, useMemo, useReducer } from 'react';
import {
  appliedFromEntries,
  computeOrder,
  extrasKey,
  extrasLineTotal,
  newId,
  overridePricingForProduct,
  resolveDiscounts,
  resolveScheduledPrice,
  resolveTieredPrice,
  type AppliedDiscount,
  type CalcResult,
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
  | { t: 'type'; type: OrderType }
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
  let price = basePrice;
  if (rules.schedules && rules.schedules.length > 0) {
    const sched = resolveScheduledPrice(rules.schedules, productId, basePrice);
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
        const unitPrice = ex.unitId ? ex.unitPrice : resolveEffectivePrice(
          ex.productId,
          ex.basePrice ?? ex.unitPrice,
          nextQty,
          a.pricing ?? (s.customerGroupId ? { customerGroupId: s.customerGroupId } : undefined),
        );
        return { ...s, lines: s.lines.map((l) => (l === ex ? { ...l, qty: nextQty, unitPrice } : l)) };
      }
      const initialPrice = alt ? alt.price : resolveEffectivePrice(
        a.product.id,
        a.product.price,
        addQty,
        a.pricing ?? (s.customerGroupId ? { customerGroupId: s.customerGroupId } : undefined),
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
            basePrice: alt ? alt.price : a.product.price,
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
          const unitPrice = l.manualPrice || l.unitId
            ? l.unitPrice
            : resolveEffectivePrice(
                l.productId,
                l.basePrice ?? l.unitPrice,
                a.qty,
                a.pricing ?? (s.customerGroupId ? { customerGroupId: s.customerGroupId } : undefined),
              );
          return { ...l, qty: a.qty, unitPrice };
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
          const list = l.listPrice ?? l.unitPrice;
          const unitPrice = resolveEffectivePrice(l.productId, list, l.qty, a.pricing ?? (s.customerGroupId ? { customerGroupId: s.customerGroupId } : undefined));
          const { unitId: _u, unitName: _n, ...rest } = l;
          return { ...rest, unitPrice, basePrice: list, manualPrice: false };
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
    case 'type':
      return a.type === 'dine_in' ? { ...s, type: a.type } : { ...s, type: a.type, tableId: undefined, tableName: undefined, guestCount: undefined };
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
          const unitPrice = resolveEffectivePrice(
            l.productId,
            l.basePrice ?? l.unitPrice,
            l.qty,
            pricingOpts,
          );
          return { ...l, unitPrice };
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
          const unitPrice = resolveEffectivePrice(
            l.productId,
            l.basePrice ?? l.unitPrice,
            l.qty,
            effectivePricing,
          );
          return { ...l, unitPrice };
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
          ...(prod?.sellUnits?.length ? { sellUnits: prod.sellUnits, baseUnitName: prod.baseUnitName, listPrice: prod.price } : {}),
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
  }, [pricing?.customerGroupId, pricing?.schedules, pricing?.tieredPrices]);

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
