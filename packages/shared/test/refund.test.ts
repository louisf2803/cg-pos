import { describe, expect, it } from 'vitest';
import { createFakeData, newId, refundAmounts, refundableLines } from '../src';

const mk = () => { const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') }); d.reset(); return d; };
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `it${i}`, productId: 'p1', name: `Kopi ${i}`, qty: 2, unitPrice: 20000 }));

async function paidOrder(d: ReturnType<typeof mk>, cashierId = 'e-sari') {
  await d.openShift({ id: newId(), cashierId, openingCash: 100000 });
  const o = await d.saveOrder({ id: newId(), type: 'takeaway', items: items(2).map((i) => ({ ...i, id: newId() })) }, cashierId);
  return d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: o.total, tendered: o.total });
}

describe('refund', () => {
  it('refund sebagian menurut jumlah, sisa berkurang, total sebanding', async () => {
    const d = mk(); const o = await paidOrder(d);
    const first = o.items[0]!;
    const r = await d.refundOrder({ id: newId(), orderId: o.id, methodId: 'm-cash', items: [{ orderItemId: first.id, qty: 1 }], reason: 'salah pesan', restock: false, authorizedBy: 'e-budi' });
    expect(r.total).toBe(refundAmounts(o, [{ orderItemId: first.id, qty: 1 }])[0]!.amount);
    expect(r.total).toBeGreaterThan(0);
    const left = refundableLines(o, await d.listRefunds(o.id));
    expect(left.find((l) => l.orderItemId === first.id)!.remainingQty).toBe(1);
    // sisa 1 saja: minta 2 ditolak
    await expect(d.refundOrder({ id: newId(), orderId: o.id, methodId: 'm-cash', items: [{ orderItemId: first.id, qty: 2 }], reason: 'x', restock: false, authorizedBy: 'e-budi' })).rejects.toThrow(/sisa/);
  });

  it('idempoten menurut id; tanpa alasan, QRIS, atau pesanan belum lunas ditolak', async () => {
    const d = mk(); const o = await paidOrder(d);
    const input = { id: newId(), orderId: o.id, methodId: 'm-cash', items: [{ orderItemId: o.items[0]!.id, qty: 1 }], reason: 'salah pesan', restock: false, authorizedBy: 'e-budi' };
    const a = await d.refundOrder(input); const b = await d.refundOrder(input);
    expect(b.id).toBe(a.id); expect((await d.listRefunds(o.id)).length).toBe(1);
    await expect(d.refundOrder({ ...input, id: newId(), reason: ' ' })).rejects.toThrow(/Alasan/);
    const open = await d.saveOrder({ id: newId(), type: 'takeaway', items: items(1).map((i) => ({ ...i, id: newId() })) }, 'e-sari');
    await expect(d.refundOrder({ ...input, id: newId(), orderId: open.id, items: [{ orderItemId: open.items[0]!.id, qty: 1 }] })).rejects.toThrow(/lunas/);
  });

  it('refund penuh tidak bisa melebihi yang dibayar; tunai dikurangkan dari kas saat tutup shift', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 100000 });
    const o0 = await d.saveOrder({ id: newId(), type: 'takeaway', items: items(1).map((i) => ({ ...i, id: newId() })) }, 'e-sari');
    const o = await d.addPayment(o0.id, { id: newId(), methodId: 'm-cash', amount: o0.total, tendered: o0.total });
    const it = o.items[0]!;
    const r = await d.refundOrder({ id: newId(), orderId: o.id, methodId: 'm-cash', items: [{ orderItemId: it.id, qty: it.qty }], reason: 'batal', restock: false, authorizedBy: 'e-budi' });
    expect(r.total).toBeLessThanOrEqual(o.paidTotal);
    expect(refundableLines(o, await d.listRefunds(o.id)).every((l) => l.remainingQty === 0)).toBe(true);
    await expect(d.refundOrder({ id: newId(), orderId: o.id, methodId: 'm-cash', items: [{ orderItemId: it.id, qty: 1 }], reason: 'lagi', restock: false, authorizedBy: 'e-budi' })).rejects.toThrow();
    const sh = await d.currentShift();
    const rep = await d.closeShift({ shiftId: sh!.id, counted: 100000, closedBy: 'e-sari' });
    expect(rep.shift.expectedCash).toBe(100000 + o.paidTotal - r.total);
    expect(rep.cashRefunds).toBe(r.total);
    expect(rep.byMethod).toEqual([expect.objectContaining({ methodName: expect.any(String), kind: 'cash', count: 1, amount: o.paidTotal })]);
  });
});
