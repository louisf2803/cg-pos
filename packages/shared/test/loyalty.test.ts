import { describe, expect, it } from 'vitest';
import {
  createFakeData, earnedPoints, loyaltyRulesProblem, maxRedeemPoints, newId, redeemAmount, redeemProblem, refundPointsDelta, resolveDiscounts, newApplied,
  type LoyaltyRules,
} from '../src';

const R: LoyaltyRules = { isActive: true, earnAmount: 10000, earnPoints: 1, redeemValuePerPoint: 100 };
const NOW = new Date('2026-11-09T05:00:00Z');
const mk = () => { const d = createFakeData({ now: () => NOW }); d.reset(); return d; };

describe('loyalti: rumus', () => {
  it('validasi aturan', () => {
    expect(loyaltyRulesProblem(R)).toBeNull();
    expect(loyaltyRulesProblem({ ...R, earnAmount: 0 })).toMatch(/Kelipatan/);
    expect(loyaltyRulesProblem({ ...R, earnPoints: 0 })).toMatch(/1 dan 1.000/);
    expect(loyaltyRulesProblem({ ...R, redeemValuePerPoint: 0.5 })).toMatch(/Nilai 1 poin/);
  });
  it('poin didapat: kelipatan penuh, mati = nol', () => {
    expect(earnedPoints(55000, R)).toBe(5);
    expect(earnedPoints(9999, R)).toBe(0);
    expect(earnedPoints(55000, { ...R, earnPoints: 3 })).toBe(15);
    expect(earnedPoints(55000, { ...R, isActive: false })).toBe(0);
  });
  it('batas tukar: saldo dan sisa tagihan', () => {
    expect(maxRedeemPoints(120, 50000, R)).toBe(120);
    expect(maxRedeemPoints(900, 50000, R)).toBe(500);
    expect(maxRedeemPoints(900, 50, R)).toBe(0);
    expect(maxRedeemPoints(900, 50000, { ...R, isActive: false })).toBe(0);
    expect(redeemAmount(7, R)).toBe(700);
    expect(redeemProblem(0, 10, 5000, R)).toMatch(/Isi/);
    expect(redeemProblem(11, 10, 50000, R)).toMatch(/Saldo poin hanya 10/);
    expect(redeemProblem(60, 100, 5000, R)).toMatch(/maksimal 50 poin/);
    expect(redeemProblem(5, 10, 5000, R)).toBeNull();
  });
  it('refund: poin didapat dikurangi, poin tukar kembali, sebanding', () => {
    expect(refundPointsDelta(5, 0, 55000, 55000)).toBe(-5);
    expect(refundPointsDelta(5, 0, 27500, 55000)).toBe(-2);
    expect(refundPointsDelta(4, 5, 49500, 49500)).toBe(1);
    expect(refundPointsDelta(4, 5, 10, 0)).toBe(0);
  });
  it('potongan poin dihitung terakhir dan tidak dipotong sebagian', () => {
    const cart = { orderType: 'takeaway' as const, lines: [{ productId: 'p1', qty: 1, unitPrice: 20000 }] };
    const pts = (n: number) => ({ ...newApplied({ source: 'points', label: 'Tukar poin', points: n, fixed: n * 100 }) });
    const manual = newApplied({ source: 'manual', label: 'M', manual: { mode: 'amount', value: 15000 } });
    const r = resolveDiscounts([pts(30), manual], [], cart, NOW);
    expect(r.entries.map((e) => [e.source, e.amount])).toEqual([['manual', 15000], ['points', 3000]]);
    const r2 = resolveDiscounts([pts(80), manual], [], cart, NOW);   // sisa 5.000 < 8.000: poin dilewati, bukan dipotong
    expect(r2.entries.map((e) => e.source)).toEqual(['manual']);
    expect(r2.skipped[0]!.reason).toMatch(/melebihi sisa/);
  });
});

describe('loyalti: data palsu', () => {
  const sale = async (d: ReturnType<typeof mk>, o: { customerId?: string; qty?: number; points?: number }) => {
    const items = [{ id: newId(), productId: 'p4', name: 'Espresso', qty: o.qty ?? 3, unitPrice: 15000 }];
    const discounts = o.points ? [{ id: newId(), source: 'points' as const, points: o.points, label: 'Tukar poin', amount: o.points * 100 }] : undefined;
    return d.saveOrder({ id: newId(), type: 'takeaway', customerId: o.customerId, items, orderDiscount: discounts?.[0]?.amount, discounts }, 'e-sari');
  };
  const pay = async (d: ReturnType<typeof mk>, o: { id: string; total: number }) => d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: o.total });

  it('aturan disimpan; salah ditolak', async () => {
    const d = mk();
    expect((await d.getLoyaltyRules()).isActive).toBe(true);
    await d.saveLoyaltyRules({ ...R, earnPoints: 2 });
    expect((await d.getLoyaltyRules()).earnPoints).toBe(2);
    await expect(d.saveLoyaltyRules({ ...R, earnAmount: 0 })).rejects.toThrow(/Kelipatan/);
  });

  it('poin didapat hanya saat lunas dan hanya bila ada pelanggan', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const o = await sale(d, { customerId: 'cu-budi' });                       // 3 x 15.000 = 45.000 (+ pajak)
    expect((await d.getCustomer('cu-budi'))!.pointsBalance).toBe(0);
    await d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: 1000 });
    expect((await d.getCustomer('cu-budi'))!.pointsBalance).toBe(0);           // belum lunas
    await d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: o.total - 1000 });
    const expected = Math.floor((await d.getOrder(o.id))!.total / 10000);
    expect((await d.getCustomer('cu-budi'))!.pointsBalance).toBe(expected);
    const led = await d.listLoyaltyLedger('cu-budi');
    expect(led).toMatchObject([{ kind: 'earn', points: expected, orderId: o.id }]);
    const anon = await sale(d, {});
    await pay(d, anon);
    expect((await d.listLoyaltyLedger('cu-budi')).length).toBe(1);
  });

  it('tukar poin: ditolak bila saldo kurang, tanpa pelanggan, atau loyalti mati; sah mengurangi saldo saat lunas', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    await expect(sale(d, { customerId: 'cu-ani', points: 121 })).rejects.toThrow(/Saldo poin/);
    await expect(sale(d, { points: 5 })).rejects.toThrow(/butuh pelanggan/);
    const o = await sale(d, { customerId: 'cu-ani', points: 100 });          // Rp 10.000 dari saldo 120
    expect(o.discountTotal).toBe(10000);
    expect(o.discounts).toMatchObject([{ source: 'points', points: 100, amount: 10000 }]);
    expect((await d.getCustomer('cu-ani'))!.pointsBalance).toBe(120);         // belum berkurang sebelum lunas
    const full = (await d.getOrder(o.id))!;
    await pay(d, { id: o.id, total: full.total });
    const earned = Math.floor(full.total / 10000);
    expect((await d.getCustomer('cu-ani'))!.pointsBalance).toBe(120 - 100 + earned);
    expect((await d.listLoyaltyLedger('cu-ani')).map((e) => e.kind).sort()).toEqual(['adjust', 'earn', 'redeem']);
    await d.saveLoyaltyRules({ ...R, isActive: false });
    await expect(sale(d, { customerId: 'cu-ani', points: 1 })).rejects.toThrow(/tidak aktif/);
  });

  it('refund penuh membalik poin; koreksi manual tidak boleh membuat saldo negatif', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const o = await sale(d, { customerId: 'cu-ani', points: 50 });
    const full = (await d.getOrder(o.id))!;
    await pay(d, { id: o.id, total: full.total });
    const earned = Math.floor(full.total / 10000);
    expect((await d.getCustomer('cu-ani'))!.pointsBalance).toBe(120 - 50 + earned);
    const paid = (await d.getOrder(o.id))!;
    await d.refundOrder({ id: newId(), orderId: o.id, methodId: 'm-cash', reason: 'salah pesan', items: paid.items.map((i) => ({ orderItemId: i.id, qty: i.qty })) });
    expect((await d.getCustomer('cu-ani'))!.pointsBalance).toBe(120);         // didapat dibalik, tukar kembali
    expect((await d.adjustPoints('cu-ani', 30, ' bonus '))).toBe(150);
    expect((await d.listLoyaltyLedger('cu-ani'))[0]).toMatchObject({ kind: 'adjust', points: 30, note: 'bonus' });
    await expect(d.adjustPoints('cu-ani', -151)).rejects.toThrow(/negatif/);
    await expect(d.adjustPoints('cu-ani', 0)).rejects.toThrow(/dari nol/);
    await expect(d.adjustPoints('nope', 5)).rejects.toThrow(/tidak ditemukan/);
    const sum = (await d.listLoyaltyLedger('cu-ani', 999)).reduce((n, e) => n + e.points, 0);
    expect(sum).toBe((await d.getCustomer('cu-ani'))!.pointsBalance);
  });
});
