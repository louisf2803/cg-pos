import type { Order, Refund } from './types';

export interface RefundLine { orderItemId: string; name: string; unitPrice: number; soldQty: number; refundedQty: number; remainingQty: number }

/** Baris pesanan beserta sisa jumlah yang masih bisa di-refund. */
export function refundableLines(order: Order, refunds: Refund[]): RefundLine[] {
  const done = new Map<string, number>();
  for (const r of refunds) for (const i of r.items) done.set(i.orderItemId, (done.get(i.orderItemId) ?? 0) + i.qty);
  return order.items.map((i) => {
    const refundedQty = done.get(i.id) ?? 0;
    return { orderItemId: i.id, name: i.name, unitPrice: i.unitPrice, soldQty: i.qty, refundedQty, remainingQty: Math.max(i.qty - refundedQty, 0) };
  });
}

/**
 * Nilai refund per baris: porsi baris itu dari total yang dibayar, sehingga pajak, biaya layanan, potongan,
 * dan pembulatan ikut dikembalikan secara proporsional. Dibulatkan ke rupiah per baris.
 */
export function refundAmounts(order: Order, picks: { orderItemId: string; qty: number }[]): { orderItemId: string; qty: number; amount: number }[] {
  const base = order.items.reduce((a, i) => a + i.lineTotal, 0);
  const ratio = base > 0 ? order.total / base : 0;
  return picks.filter((p) => p.qty > 0).map((p) => {
    const it = order.items.find((i) => i.id === p.orderItemId);
    if (!it || it.qty <= 0) return { orderItemId: p.orderItemId, qty: p.qty, amount: 0 };
    return { orderItemId: p.orderItemId, qty: p.qty, amount: Math.round((it.lineTotal * (p.qty / it.qty)) * ratio) };
  });
}

/** Galat pertama untuk permintaan refund, atau null. Dipakai kedua lapisan data dan layar. */
export function refundProblem(order: Order, refunds: Refund[], picks: { orderItemId: string; qty: number }[]): string | null {
  if (order.status !== 'paid') return 'Hanya pesanan lunas yang bisa di-refund.';
  const chosen = picks.filter((p) => p.qty > 0);
  if (chosen.length === 0) return 'Pilih minimal satu item untuk di-refund.';
  const lines = new Map(refundableLines(order, refunds).map((l) => [l.orderItemId, l]));
  for (const p of chosen) {
    const l = lines.get(p.orderItemId);
    if (!l) return 'Ada item yang bukan bagian dari pesanan ini.';
    if (!Number.isFinite(p.qty) || p.qty <= 0 || Math.round(p.qty * 1000) !== p.qty * 1000) return `Jumlah refund ${l.name} tidak sah.`;
    if (p.qty > l.remainingQty) return `${l.name}: sisa yang bisa di-refund hanya ${l.remainingQty}.`;
  }
  const already = refunds.reduce((a, r) => a + r.total, 0);
  const total = refundAmounts(order, chosen).reduce((a, x) => a + x.amount, 0);
  if (total <= 0) return 'Nilai refund 0, tidak ada yang dikembalikan.';
  if (already + total > order.paidTotal) return 'Total refund melebihi jumlah yang sudah dibayar.';
  return null;
}
