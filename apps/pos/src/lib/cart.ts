import { useMemo, useReducer } from 'react';
import { computeOrder, newId, type CalcResult, type Order, type OrderType, type OutletContext, type Product } from '@cgpos/shared';

export interface CartLine { id: string; productId: string; name: string; qty: number; unitPrice: number }
/** orderId terisi setelah pesanan pernah disimpan ke server: simpan berikutnya memperbarui pesanan yang sama, tidak membuat ganda. */
export interface CartState { type: OrderType; lines: CartLine[]; orderId?: string }
type Action =
  | { t: 'add'; product: Product }
  | { t: 'qty'; lineId: string; qty: number }
  | { t: 'type'; type: OrderType }
  | { t: 'load'; order: Order }
  | { t: 'saved'; orderId: string }
  | { t: 'clear' };

const initial: CartState = { type: 'takeaway', lines: [] };

function reduce(s: CartState, a: Action): CartState {
  switch (a.t) {
    case 'add': {
      const ex = s.lines.find((l) => l.productId === a.product.id);
      if (ex) return { ...s, lines: s.lines.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l)) };
      return { ...s, lines: [...s.lines, { id: newId(), productId: a.product.id, name: a.product.name, qty: 1, unitPrice: a.product.price }] };
    }
    case 'qty':
      return { ...s, lines: a.qty <= 0 ? s.lines.filter((l) => l.id !== a.lineId) : s.lines.map((l) => (l.id === a.lineId ? { ...l, qty: a.qty } : l)) };
    case 'type': return { ...s, type: a.type };
    case 'load':
      return { type: a.order.type, orderId: a.order.id, lines: a.order.items.map((i) => ({ id: i.id, productId: i.productId, name: i.name, qty: i.qty, unitPrice: i.unitPrice })) };
    case 'saved': return { ...s, orderId: a.orderId };
    case 'clear': return initial;
  }
}

export function useCart(ctx: OutletContext, roundingStep = 0) {
  const [state, dispatch] = useReducer(reduce, initial);
  const calc: CalcResult = useMemo(
    () => computeOrder({
      orderType: state.type, orderTaxes: ctx.taxes, settings: ctx.settings, roundingStep,
      items: state.lines.map((l) => ({ id: l.id, qty: l.qty, unitPrice: l.unitPrice })),
    }),
    [state, ctx, roundingStep],
  );
  const count = state.lines.reduce((a, l) => a + l.qty, 0);
  return { state, calc, count, dispatch };
}
