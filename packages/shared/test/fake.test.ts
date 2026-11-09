import { describe, expect, it, beforeEach } from 'vitest';
import { createFakeData, DataError, newId } from '../src';

const at = new Date('2026-11-09T05:00:00Z'); // 12:00 WIB
const mk = () => createFakeData({ now: () => at });

async function rejects(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof DataError && e.code === code);
}

describe('lapisan data palsu', () => {
  let d: ReturnType<typeof mk>;
  beforeEach(() => { d = mk(); d.reset(); });

  it('produk: tambah, ubah, cari, SKU ganda ditolak', async () => {
    const before = (await d.listProducts()).length;
    const p = await d.saveProduct({ name: ' Matcha latte ', categoryId: 'c-non', price: 26000, sku: 'NK-100' });
    expect(p.name).toBe('Matcha latte');
    expect((await d.listProducts()).length).toBe(before + 1);
    expect((await d.listProducts({ search: 'matcha' })).map((x) => x.id)).toEqual([p.id]);
    await rejects(d.saveProduct({ name: 'Lain', categoryId: null, price: 1, sku: 'NK-100' }), 'invalid');
    await rejects(d.saveProduct({ name: '', categoryId: null, price: 1 }), 'invalid');
    await rejects(d.saveProduct({ name: 'X', categoryId: null, price: -5 }), 'invalid');
    const u = await d.saveProduct({ id: p.id, name: 'Matcha latte', categoryId: 'c-non', price: 27000, sku: 'NK-100' });
    expect(u.price).toBe(27000);
    await d.setProductActive(p.id, false);
    expect((await d.listProducts()).some((x) => x.id === p.id)).toBe(false);
    expect((await d.listProducts({ includeInactive: true })).some((x) => x.id === p.id)).toBe(true);
  });

  it('PIN', async () => {
    expect(await d.verifyPin('e-sari', '222222')).toBe(true);
    expect(await d.verifyPin('e-sari', '000000')).toBe(false);
    expect((await d.listEmployees()).every((e) => !('pin' in e))).toBe(true);
  });

  it('alur tunai: buka kasir, pesan, bayar, tutup kasir dengan selisih', async () => {
    // outlet baru mulai tanpa shift terbuka; riwayat benih ada di shift yang sudah ditutup
    expect(await d.currentShift()).toBeNull();
    const draft = { id: newId(), type: 'takeaway' as const, items: [{ id: newId(), productId: 'p1', name: 'Kopi susu gula aren', qty: 2, unitPrice: 20000 }, { id: newId(), productId: 'p8', name: 'Air mineral', qty: 1, unitPrice: 5000 }] };
    await rejects(d.saveOrder(draft, 'e-sari'), 'no_open_shift');
    const shiftId = newId();
    await d.openShift({ id: shiftId, cashierId: 'e-sari', openingCash: 100000 });
    await rejects(d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 }), 'shift_already_open');
    const o = await d.saveOrder(draft, 'e-sari');
    expect(o.total).toBe(49500);
    expect(o.status).toBe('open');
    await rejects(d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: 60000 }), 'bad_amount');
    const payId = newId();
    const paid = await d.addPayment(o.id, { id: payId, methodId: 'm-cash', amount: 49500, tendered: 50000 });
    expect(paid.status).toBe('paid');
    expect(paid.payments[0]!.change).toBe(500);
    // kirim ulang pembayaran yang sama: tidak menggandakan
    const again = await d.addPayment(o.id, { id: payId, methodId: 'm-cash', amount: 49500, tendered: 50000 });
    expect(again.paidTotal).toBe(49500);
    await rejects(d.saveOrder(draft, 'e-sari'), 'order_locked');
    await rejects(d.voidUnpaidOrder(o.id, 'x', 'e-budi'), 'order_locked');
    const rep = await d.closeShift({ shiftId, counted: 148500, closedBy: 'e-sari' });
    expect(rep.expectedCash).toBe(149500);
    expect(rep.variance).toBe(-1000);
    expect(rep.orderCount).toBe(1);
    expect(rep.productsSold[0]!.name).toBe('Kopi susu gula aren');
  });

  it('bayar campuran: sebagian non-tunai lalu tunai dengan kembalian dari jumlah yang dibayar', async () => {
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const o = await d.saveOrder({ id: newId(), type: 'takeaway' as const, items: [{ id: newId(), productId: 'p1', name: 'Kopi susu gula aren', qty: 2, unitPrice: 20000 }] }, 'e-sari');
    const methods = await d.listPaymentMethods();
    const card = methods.find((m) => m.kind === 'noncash')!;
    const part = await d.addPayment(o.id, { id: newId(), methodId: card.id, amount: 10000 });
    expect(part.status).toBe('partially_paid');
    expect(part.paidTotal).toBe(10000);
    const rest = o.total - 10000;
    const done = await d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: rest, tendered: rest + 5000 });
    expect(done.status).toBe('paid');
    expect(done.payments.map((x) => x.amount)).toEqual([10000, rest]);
    expect(done.payments[1]!.change).toBe(5000);
  });

  it('pembulatan tunai kelipatan 100 mengikuti metode bayar', async () => {
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const draft = { id: newId(), type: 'takeaway' as const, items: [{ id: newId(), productId: 'p12', name: 'Kentang goreng', qty: 1, unitPrice: 15150 }] };
    const o = await d.saveOrder(draft, 'e-sari');
    expect(o.total).toBe(16665);
    const cash = await d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: 16700 });
    expect(cash.total).toBe(16700);
    expect(cash.rounding).toBe(35);
    const draft2 = { ...draft, id: newId(), items: [{ id: newId(), productId: 'p12', name: 'Kentang goreng', qty: 1, unitPrice: 15150 }] };
    const o2 = await d.saveOrder(draft2, 'e-sari');
    const edc = await d.addPayment(o2.id, { id: newId(), methodId: 'm-edc', amount: 16665 });
    expect(edc.total).toBe(16665);
    expect(edc.rounding).toBe(0);
  });

  it('bayar sebagian lalu lunas; void hanya untuk yang belum dibayar', async () => {
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const draft = { id: newId(), type: 'dine_in' as const, items: [{ id: newId(), productId: 'p10', name: 'Nasi goreng kampung', qty: 2, unitPrice: 32000 }] };
    const o = await d.saveOrder(draft, 'e-sari');
    const half = await d.addPayment(o.id, { id: newId(), methodId: 'm-edc', amount: 30000 });
    expect(half.status).toBe('partially_paid');
    await rejects(d.voidUnpaidOrder(o.id, 'x', 'e-budi'), 'order_locked');
    const done = await d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: done_balance(half) });
    expect(done.status).toBe('paid');
    const d2 = { id: newId(), type: 'takeaway' as const, items: [{ id: newId(), productId: 'p2', name: 'Americano', qty: 1, unitPrice: 18000 }] };
    const o2 = await d.saveOrder(d2, 'e-sari');
    const v = await d.voidUnpaidOrder(o2.id, 'salah input', 'e-budi');
    expect(v.status).toBe('void');
  });

  it('ringkasan penjualan dari riwayat benih', async () => {
    const s = await d.salesSummary({ from: '2026-11-08T17:00:00Z', to: '2026-11-09T17:00:00Z' });
    expect(s.orderCount).toBeGreaterThan(0);
    expect(s.total).toBe(s.gross - s.discounts + s.serviceCharge + s.tax);
    expect(s.byMethod.reduce((a, m) => a + m.amount, 0)).toBe(s.total);
    expect(s.byHour.reduce((a, h) => a + h.total, 0)).toBe(s.total);
    expect(s.topProducts.length).toBeGreaterThan(0);
  });
});

function done_balance(o: { total: number; paidTotal: number; rounding: number }): number {
  // sisa setelah pembayaran sebagian, termasuk pembulatan tunai pada pembayaran pertama non-tunai = 0
  return o.total - o.paidTotal;
}
