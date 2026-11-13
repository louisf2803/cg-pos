import { useMemo, useReducer } from 'react';
import { appliedFromEntries, computeOrder, extrasKey, extrasLineTotal, newId, overridePricingForProduct, resolveDiscounts, type AppliedDiscount, type CalcResult, type ItemExtra, type Order, type OrderType, type OutletContext, type Product, type Promotion, type ResolvedDiscounts } from '@cgpos/shared';

export interface CartLine { id: string; productId: string; name: string; qty: number; unitPrice: number; extras?: ItemExtra[]; note?: string; taxRate?: number | null; /** harga daftar saat ditambahkan dan batas persen ubah harga; dipertahankan dari katalog saat muat ulang */ basePrice?: number; overridePct?: number }
/** orderId terisi setelah pesanan pernah disimpan ke server: simpan berikutnya memperbarui pesanan yang sama, tidak membuat ganda. */
export interface CartState { type: OrderType; lines: CartLine[]; orderId?: string; tableId?: string; tableName?: string; label?: string; guestCount?: number; customerId?: string; customerName?: string; discounts: AppliedDiscount[] }
type Action =
  | { t: 'add'; product: Product; extras?: ItemExtra[] }
  | { t: 'custom'; productId: string; name: string; unitPrice: number; qty: number; note?: string }
  | { t: 'qty'; lineId: string; qty: number }
  | { t: 'note'; lineId: string; note: string }
  | { t: 'price'; lineId: string; unitPrice: number }
  | { t: 'type'; type: OrderType }
  | { t: 'table'; tableId?: string; tableName?: string }
  | { t: 'meta'; label?: string; guestCount?: number }
  | { t: 'customer'; customerId?: string; customerName?: string }
  | { t: 'discount-add'; discount: AppliedDiscount }
  | { t: 'discount-remove'; id: string }
  | { t: 'load'; order: Order; tableName?: string; products?: Product[] }
  | { t: 'saved'; orderId: string }
  | { t: 'clear' };

const initial: CartState = { type: 'takeaway', lines: [], discounts: [] };

function reduce(s: CartState, a: Action): CartState {
  switch (a.t) {
    case 'add': {
      // baris yang sama = produk sama dan pilihan Ekstra sama persis
      const ex = s.lines.find((l) => l.productId === a.product.id && extrasKey(l.extras) === extrasKey(a.extras) && !l.note && l.unitPrice === (l.basePrice ?? l.unitPrice));
      if (ex) return { ...s, lines: s.lines.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l)) };
      return { ...s, lines: [...s.lines, { id: newId(), productId: a.product.id, name: a.product.name, qty: 1, unitPrice: a.product.price, basePrice: a.product.price, taxRate: a.product.taxRate, ...(a.product.priceOverridePct ? { overridePct: a.product.priceOverridePct } : {}), ...(a.extras?.length ? { extras: a.extras } : {}) }] };
    }
    // Item bebas: selalu baris baru (nama dan harga diketik kasir), tidak digabung dengan baris lain
    case 'custom': return { ...s, lines: [...s.lines, { id: newId(), productId: a.productId, name: a.name, qty: a.qty, unitPrice: a.unitPrice, ...(a.note ? { note: a.note } : {}) }] };
    case 'qty':
      return { ...s, lines: a.qty <= 0 ? s.lines.filter((l) => l.id !== a.lineId) : s.lines.map((l) => (l.id === a.lineId ? { ...l, qty: a.qty } : l)) };
    case 'note': return { ...s, lines: s.lines.map((l) => (l.id === a.lineId ? { ...l, note: a.note.slice(0, 120) || undefined } : l)) };
    case 'price': return { ...s, lines: s.lines.map((l) => (l.id === a.lineId ? { ...l, unitPrice: a.unitPrice } : l)) };
    case 'type': return a.type === 'dine_in' ? { ...s, type: a.type } : { ...s, type: a.type, tableId: undefined, tableName: undefined, guestCount: undefined };
    case 'table': return { ...s, tableId: a.tableId, tableName: a.tableName };
    case 'meta': return { ...s, label: a.label, guestCount: a.guestCount };
    // Poin milik pelanggan tertentu: ganti atau lepas pelanggan = potongan poin ikut lepas.
    case 'customer': return { ...s, customerId: a.customerId, customerName: a.customerName, discounts: a.customerId === s.customerId ? s.discounts : s.discounts.filter((d) => d.source !== 'points') };
    case 'discount-add': return { ...s, discounts: [...s.discounts, a.discount] };
    case 'discount-remove': return { ...s, discounts: s.discounts.filter((d) => d.id !== a.id) };
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
        lines: a.order.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          name: i.name,
          qty: i.qty,
          unitPrice: i.unitPrice,
          ...overridePricingForProduct(byId.get(i.productId)),
          ...(i.extras?.length ? { extras: i.extras } : {}),
          ...(i.note ? { note: i.note } : {}),
          taxRate: byId.get(i.productId)?.taxRate,
        })),
      };
    }
    case 'saved': return { ...s, orderId: a.orderId };
    case 'clear': return initial;
  }
}

export function useCart(ctx: OutletContext, roundingStep = 0, promos: Promotion[] = []) {
  const [state, dispatch] = useReducer(reduce, initial);
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
