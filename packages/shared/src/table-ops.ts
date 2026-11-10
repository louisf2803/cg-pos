import { newId } from './id';
import { DataError, type Order, type OrderDraft, type TableStatus } from './types';

/**
 * Pindah dan gabung meja. Dibuat dari operasi yang sudah ada (simpan pesanan, batalkan pesanan),
 * jadi aturan server tidak berubah: hanya pesanan yang belum ada pembayarannya yang boleh diubah.
 */

/** Pesanan tersimpan menjadi draf yang bisa disimpan ulang (angka dihitung ulang oleh penyimpan). */
export function orderToDraft(o: Order): OrderDraft {
  return {
    id: o.id, type: o.type, tableId: o.tableId, label: o.label, guestCount: o.guestCount,
    items: o.items.map((i) => ({ id: i.id, productId: i.productId, name: i.name, qty: i.qty, unitPrice: i.unitPrice, note: i.note, extras: i.extras })),
    orderDiscount: o.discountTotal > 0 ? o.discountTotal : undefined,
  };
}

/** Alasan sebuah pesanan tidak bisa dipindah/digabung, atau null bila boleh. */
export function tableOpProblem(o: Order): string | null {
  if (o.status === 'void') return `Pesanan ${o.number} sudah dibatalkan.`;
  if (o.status !== 'open' || o.paidTotal > 0) return `Pesanan ${o.number} sudah ada pembayaran, jadi mejanya tidak bisa diubah.`;
  if (o.type !== 'dine_in' || !o.tableId) return `Pesanan ${o.number} bukan pesanan meja.`;
  return null;
}

/** Draf gabungan: item pesanan sumber ditambahkan ke pesanan tujuan (dengan id baru, supaya tidak bentrok di server). */
export function mergeDrafts(into: Order, from: Order): OrderDraft {
  const base = orderToDraft(into);
  const moved = from.items.map((i) => ({ id: newId(), productId: i.productId, name: i.name, qty: i.qty, unitPrice: i.unitPrice, note: i.note, extras: i.extras }));
  const guests = (into.guestCount ?? 0) + (from.guestCount ?? 0);
  const discount = (into.discountTotal ?? 0) + (from.discountTotal ?? 0);
  return {
    ...base,
    items: [...base.items, ...moved],
    guestCount: guests > 0 ? guests : undefined,
    label: into.label ?? from.label,
    orderDiscount: discount > 0 ? discount : undefined,
  };
}

type Core = {
  getOrder(id: string): Promise<Order | null>;
  saveOrder(draft: OrderDraft, cashierId: string): Promise<Order>;
  voidUnpaidOrder(orderId: string, reason: string, authorizedBy: string): Promise<Order>;
  listTableStatus(): Promise<TableStatus[]>;
};

export function createTableOps(core: Core) {
  async function load(id: string): Promise<Order> {
    const o = await core.getOrder(id);
    if (!o) throw new DataError('not_found', 'Pesanan tidak ditemukan');
    return o;
  }
  return {
    async moveOrderTable(orderId: string, toTableId: string): Promise<Order> {
      const o = await load(orderId);
      const problem = tableOpProblem(o);
      if (problem) throw new DataError('order_locked', problem);
      if (o.tableId === toTableId) throw new DataError('invalid', 'Pesanan sudah ada di meja ini.');
      const dest = (await core.listTableStatus()).find((t) => t.id === toTableId);
      if (!dest) throw new DataError('not_found', 'Meja tujuan tidak ditemukan');
      if (dest.order) throw new DataError('invalid', `Meja ${dest.name} sedang dipakai pesanan ${dest.order.number}. Pakai Gabung meja bila ingin disatukan.`);
      return core.saveOrder({ ...orderToDraft(o), tableId: toTableId }, o.cashierId);
    },
    async mergeOrders(input: { intoId: string; fromId: string; authorizedBy: string }): Promise<Order> {
      if (input.intoId === input.fromId) throw new DataError('invalid', 'Pilih dua pesanan yang berbeda.');
      const [into, from] = [await load(input.intoId), await load(input.fromId)];
      const problem = tableOpProblem(into) ?? tableOpProblem(from);
      if (problem) throw new DataError('order_locked', problem);
      // Simpan hasil gabungan dulu; pesanan sumber baru dibatalkan setelahnya. Bila langkah kedua gagal,
      // item tampil di dua pesanan (terlihat dan bisa dibereskan), bukan hilang.
      const saved = await core.saveOrder(mergeDrafts(into, from), into.cashierId);
      await core.voidUnpaidOrder(from.id, `Digabung ke ${into.number}`, input.authorizedBy);
      return saved;
    },
  };
}
