import { describe, expect, it } from 'vitest';
import { buildShiftReport, createFakeData, newId, type Shift } from '../src';

const mk = () => { const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') }); d.reset(); return d; };
const line = (qty: number, productId = 'p1', name = 'Kopi susu gula aren') => ({ id: newId(), productId, name, qty, unitPrice: 20000 });

describe('ringkasan shift berjalan', () => {
  it('menghitung penerimaan per metode, kas seharusnya, dan produk terjual tanpa menutup shift', async () => {
    const d = mk();
    const shift = await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 100000 });
    const a = await d.saveOrder({ id: newId(), type: 'takeaway', items: [line(2)] }, 'e-sari');
    await d.addPayment(a.id, { id: newId(), methodId: 'm-cash', amount: a.total, tendered: a.total });
    const b = await d.saveOrder({ id: newId(), type: 'takeaway', items: [line(1), line(1, 'p2', 'Americano')] }, 'e-sari');
    await d.addPayment(b.id, { id: newId(), methodId: 'm-edc', amount: b.total });
    const c = await d.saveOrder({ id: newId(), type: 'takeaway', items: [line(1)] }, 'e-sari');   // belum dibayar: tidak dihitung
    expect(c.status).toBe('open');

    const r = await d.shiftSummary(shift.id);
    expect(r.shift.status).toBe('open');
    expect(r.orderCount).toBe(2);
    expect(r.cashSales).toBe(a.total); expect(r.otherSales).toBe(b.total);
    expect(r.expectedCash).toBe(100000 + a.total);
    expect(r.byMethod.map((m) => [m.methodName, m.count, m.amount])).toEqual(expect.arrayContaining([['Tunai', 1, a.total], ['Kartu', 1, b.total]]));
    const kopi = r.productsSold.find((p) => p.productId === 'p1')!;
    expect(kopi.qty).toBe(3);
    // dipanggil lagi: sama, dan shift tetap terbuka
    expect(await d.shiftSummary(shift.id)).toEqual(r);
    expect((await d.currentShift())?.id).toBe(shift.id);
  });

  it('refund tunai mengurangi kas seharusnya; tutup kasir memberi angka yang sama dengan ringkasan terakhir', async () => {
    const d = mk();
    const shift = await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 50000 });
    const a = await d.saveOrder({ id: newId(), type: 'takeaway', items: [line(2)] }, 'e-sari');
    const paid = await d.addPayment(a.id, { id: newId(), methodId: 'm-cash', amount: a.total, tendered: a.total });
    const ref = await d.refundOrder({ id: newId(), orderId: a.id, methodId: 'm-cash', items: [{ orderItemId: paid.items[0]!.id, qty: 1 }], reason: 'salah pesan', restock: false, authorizedBy: 'e-budi' });
    const live = await d.shiftSummary(shift.id);
    expect(live.cashRefunds).toBe(ref.total);
    expect(live.expectedCash).toBe(50000 + a.total - ref.total);
    const closed = await d.closeShift({ shiftId: shift.id, counted: live.expectedCash - 1000, closedBy: 'e-sari' });
    expect(closed.expectedCash).toBe(live.expectedCash);
    expect(closed.variance).toBe(-1000);
    expect(closed.shift.status).toBe('closed');
    // shift tertutup tetap bisa diringkas, dengan angka yang sama
    const after = await d.shiftSummary(shift.id);
    expect(after.expectedCash).toBe(closed.expectedCash); expect(after.variance).toBe(-1000);
    await expect(d.shiftSummary('nope')).rejects.toThrow(/tidak ditemukan/);
  });

  it('buildShiftReport: kas masuk dan keluar ikut dihitung; nilai server dipakai untuk shift tertutup', () => {
    const base: Shift = { id: 's', cashierId: 'e', openedAt: '2026-11-09T01:00:00Z', openingCash: 10000, status: 'open' };
    const open = buildShiftReport({ shift: base, payments: [{ methodName: 'Tunai', kind: 'cash', amount: 5000 }], cashIn: 2000, cashOut: 500, cashRefunds: 300, paidOrderCount: 1, soldLines: [] });
    expect(open.expectedCash).toBe(10000 + 5000 + 2000 - 500 - 300);
    expect(open.counted).toBe(0); expect(open.variance).toBe(0);
    const closed = buildShiftReport({ shift: { ...base, status: 'closed', expectedCash: 99999, counted: 99000, variance: -999 }, payments: [], cashIn: 0, cashOut: 0, cashRefunds: 0, paidOrderCount: 0, soldLines: [] });
    expect(closed.expectedCash).toBe(99999); expect(closed.counted).toBe(99000); expect(closed.variance).toBe(-999);
  });
});
