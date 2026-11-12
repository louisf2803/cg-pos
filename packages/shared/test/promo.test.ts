import { describe, expect, it } from 'vitest';
import {
  accessFor, appliedFromEntries, cartGross, couponInputProblem, couponProblem, couponReferenceProblem, COUPON_REFERENCE_MAX,
  createFakeData, discountDisplayLabel, fitDiscounts, manualProblem, newApplied, newId, normalizeCode, normalizeCouponReference,
  promoProductIds, promotionAmount, promotionBlock, promotionProblem, resolveDiscounts, type AppliedDiscount, type Promotion, type PromoCart,
} from '../src';

const NOW = new Date('2026-11-09T05:00:00Z');
const promo = (o: Partial<Promotion>): Promotion => ({ id: 'x', name: 'P', kind: 'percent_order', value: 10, minSpend: 0, productIds: [], orderTypes: ['dine_in', 'takeaway', 'delivery', 'service'], isActive: true, ...o });
const cart = (lines: PromoCart['lines'], orderType: PromoCart['orderType'] = 'takeaway'): PromoCart => ({ orderType, lines });
const L = (productId: string, qty: number, unitPrice: number, extrasTotal = 0) => ({ productId, qty, unitPrice, extrasTotal });

describe('promo: validasi isian', () => {
  it('nama, persen, rupiah, produk gratis, jadwal', () => {
    expect(promotionProblem({ name: ' ', kind: 'percent_order', value: 10 })).toMatch(/Nama/);
    expect(promotionProblem({ name: 'A', kind: 'percent_order', value: 0 })).toMatch(/1 dan 100/);
    expect(promotionProblem({ name: 'A', kind: 'percent_item', value: 101 })).toMatch(/1 dan 100/);
    expect(promotionProblem({ name: 'A', kind: 'amount_order', value: 0.5 })).toMatch(/rupiah bulat/);
    expect(promotionProblem({ name: 'A', kind: 'free_item', value: 0 })).toMatch(/produk yang digratiskan/);
    expect(promotionProblem({ name: 'A', kind: 'free_item', value: 0, freeProductId: 'p1' })).toBeNull();
    expect(promotionProblem({ name: 'A', kind: 'amount_order', value: 5000, orderTypes: [] })).toMatch(/jenis order/);
    expect(promotionProblem({ name: 'A', kind: 'amount_order', value: 5000, startsAt: '2026-12-01', endsAt: '2026-11-01' })).toMatch(/setelah tanggal mulai/);
    expect(promotionProblem({ name: 'A', kind: 'percent_order', value: 15 })).toBeNull();
  });
  it('kode kupon dinormalkan dan diperiksa', () => {
    expect(normalizeCode(' hemat 5 ')).toBe('HEMAT5');
    expect(couponInputProblem({ code: 'ab' })).toMatch(/3 sampai 20/);
    expect(couponInputProblem({ code: 'a b!' })).toMatch(/huruf, angka/);
    expect(couponInputProblem({ code: 'OK-1', usageLimit: 0 })).toMatch(/minimal 1/);
    expect(couponInputProblem({ code: 'OK-1', usageLimit: 3 })).toBeNull();
  });
});

describe('promo: hitungan potongan', () => {
  const c = cart([L('p1', 2, 20000, 4000), L('p2', 1, 18000)]); // 44.000 + 18.000 = 62.000
  it('belanja kotor termasuk ekstra', () => expect(cartGross(c)).toBe(62000));
  it('persen dan rupiah untuk seluruh pesanan', () => {
    expect(promotionAmount(promo({ kind: 'percent_order', value: 10 }), c)).toBe(6200);
    expect(promotionAmount(promo({ kind: 'amount_order', value: 5000 }), c)).toBe(5000);
  });
  it('produk tertentu: persen dari baris, rupiah per unit (maks nilai baris)', () => {
    expect(promotionAmount(promo({ kind: 'percent_item', value: 50, productIds: ['p2'] }), c)).toBe(9000);
    expect(promotionAmount(promo({ kind: 'amount_item', value: 3000, productIds: ['p1'] }), c)).toBe(6000);
    expect(promotionAmount(promo({ kind: 'amount_item', value: 99999, productIds: ['p2'] }), c)).toBe(18000);
    expect(promotionAmount(promo({ kind: 'percent_item', value: 10, productIds: [] }), c)).toBe(6200);
  });
  it('gratis satu produk = harga satuannya', () => {
    expect(promotionAmount(promo({ kind: 'free_item', freeProductId: 'p2' }), c)).toBe(18000);
    expect(promotionAmount(promo({ kind: 'free_item', freeProductId: 'p9' }), c)).toBe(0);
  });
  it('syarat: jadwal, jenis order, belanja minimum, produk', () => {
    expect(promotionBlock(promo({}), c, NOW)).toBeNull();
    expect(promotionBlock(promo({ isActive: false }), c, NOW)).toMatch(/dinonaktifkan/);
    expect(promotionBlock(promo({ startsAt: '2026-12-01T00:00:00Z' }), c, NOW)).toMatch(/belum mulai/);
    expect(promotionBlock(promo({ endsAt: '2026-11-01T00:00:00Z' }), c, NOW)).toMatch(/sudah berakhir/);
    expect(promotionBlock(promo({ orderTypes: ['dine_in'] }), c, NOW)).toMatch(/jenis order/);
    expect(promotionBlock(promo({ minSpend: 70000 }), c, NOW)).toMatch(/minimum Rp\s?70\.000/);
    expect(promotionBlock(promo({}), cart([]), NOW)).toMatch(/masih kosong/);
    expect(promotionBlock(promo({ kind: 'percent_item', productIds: ['p9'] }), c, NOW)).toMatch(/Tidak ada produk/);
    expect(promotionBlock(promo({ kind: 'free_item', freeProductId: 'p9' }), c, NOW)).toMatch(/produk gratisnya/);
    expect(promotionBlock(promo({ kind: 'free_item', freeProductId: 'p2', productIds: ['p9'] }), c, NOW)).toMatch(/produk syarat/);
  });
  it('kupon: nonaktif, masa berlaku, batas pemakaian, promo hilang', () => {
    const p = promo({});
    const cp = { id: 'c', promotionId: 'x', code: 'A', usedCount: 0, isActive: true };
    expect(couponProblem(cp, p, NOW, 0)).toBeNull();
    expect(couponProblem({ ...cp, isActive: false }, p, NOW, 0)).toMatch(/dinonaktifkan/);
    expect(couponProblem({ ...cp, validTo: '2026-11-01T00:00:00Z' }, p, NOW, 0)).toMatch(/berakhir/);
    expect(couponProblem({ ...cp, usageLimit: 2 }, p, NOW, 2)).toMatch(/habis dipakai/);
    expect(couponProblem(cp, undefined, NOW, 0)).toMatch(/tidak ada/);
  });
  it('manual: batas persen dan rupiah', () => {
    expect(manualProblem('percent', 101, 1000)).toMatch(/maksimal 100/);
    expect(manualProblem('amount', 2000, 1000)).toMatch(/melebihi/);
    expect(manualProblem('amount', 500, 1000)).toBeNull();
    expect(manualProblem('percent', 0, 1000)).toMatch(/Isi/);
  });
});

describe('promo: beberapa diskon sekaligus', () => {
  const c = cart([L('p1', 1, 20000)]);
  const a = (o: Partial<AppliedDiscount>): AppliedDiscount => ({ id: newId(), source: 'promo', label: 'x', ...o });
  it('berurutan dan tidak pernah melebihi belanja', () => {
    const r = resolveDiscounts([
      a({ promotionId: 'pr', label: 'Setengah' }), a({ source: 'manual', manual: { mode: 'amount', value: 15000 }, label: 'Manual' }),
    ], [promo({ id: 'pr', value: 50 })], c, NOW);
    expect(r.entries.map((e) => e.amount)).toEqual([10000, 10000]);   // manual 15.000 dibatasi sisa 10.000
    expect(r.total).toBe(20000);
  });
  it('persen manual dihitung dari sisa; promo yang tak berlaku dilewati dengan alasan', () => {
    const r = resolveDiscounts([
      a({ promotionId: 'pr' }), a({ promotionId: 'mati', label: 'Mati' }), a({ source: 'manual', manual: { mode: 'percent', value: 50 } }),
    ], [promo({ id: 'pr', kind: 'amount_order', value: 4000 }), promo({ id: 'mati', isActive: false })], c, NOW);
    expect(r.entries.map((e) => e.amount)).toEqual([4000, 8000]);
    expect(r.skipped).toHaveLength(1); expect(r.skipped[0]).toMatchObject({ label: 'Mati' });
  });
  it('pesanan lama dengan promo yang sudah dihapus tetap memakai angka tersimpan', () => {
    const entries = [{ id: 'e1', source: 'promo' as const, promotionId: 'hilang', label: 'Promo', amount: 3000 }, { id: 'e2', source: 'manual' as const, label: 'Diskon manual', amount: 1000 }];
    const r = resolveDiscounts(appliedFromEntries(entries), [], c, NOW);
    expect(r.entries.map((e) => e.amount)).toEqual([3000, 1000]);
  });
  it('fitDiscounts menyesuaikan dengan potongan akhir', () => {
    const e = (id: string, amount: number) => ({ id, source: 'promo' as const, label: id, amount });
    expect(fitDiscounts([e('a', 5000), e('b', 3000)], 7000).map((x) => x.amount)).toEqual([5000, 2000]);
    expect(fitDiscounts([e('a', 5000)], 6000).map((x) => x.amount)).toEqual([6000]);
    expect(fitDiscounts([e('a', 5000)], 0)).toEqual([]);
  });
  it('kasir butuh persetujuan untuk diskon manual; manajer tidak', () => {
    expect(accessFor('cashier', 'manual_discount')).toBe('approve');
    expect(accessFor('manager', 'manual_discount')).toBe('allow');
  });
});

describe('promo: data palsu', () => {
  const mk = () => { const d = createFakeData({ now: () => NOW }); d.reset(); return d; };
  it('CRUD promo dan kupon; kode ganda ditolak; promo yang dihapus lepas dari daftar', async () => {
    const d = mk();
    const n = (await d.listPromotions()).length;
    const p = await d.savePromotion({ name: ' Akhir pekan ', kind: 'percent_order', value: 15, minSpend: 20000 });
    expect(p).toMatchObject({ name: 'Akhir pekan', value: 15, minSpend: 20000, isActive: true });
    expect(p.orderTypes).toHaveLength(4);
    await expect(d.savePromotion({ name: 'X', kind: 'free_item', value: 0, freeProductId: 'nope' })).rejects.toThrow(/tidak ditemukan/);
    const off = await d.savePromotion({ id: p.id, name: 'Akhir pekan', kind: 'percent_order', value: 15, isActive: false });
    expect((await d.listPromotions({ activeOnly: true })).some((x) => x.id === off.id)).toBe(false);
    const cp = await d.saveCoupon({ promotionId: p.id, code: 'weekend 15', usageLimit: 1 });
    expect(cp.code).toBe('WEEKEND15');
    await expect(d.saveCoupon({ promotionId: p.id, code: 'WEEKEND15' })).rejects.toThrow(/sudah dipakai kupon lain/);
    expect((await d.findCoupon('weekend15'))?.promotion.id).toBe(p.id);
    expect(await d.findCoupon('nope')).toBeNull();
    await d.deleteCoupon(cp.id);
    await d.deletePromotion(p.id);
    expect((await d.listPromotions()).length).toBe(n);
    await expect(d.deletePromotion(p.id)).rejects.toThrow(/tidak ditemukan/);
  });

  it('pesanan menyimpan rincian diskon; pemakaian kupon terhitung dan batalnya dikembalikan', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const coupon = (await d.findCoupon('HEMAT5'))!;
    const draft = () => ({
      id: newId(), type: 'takeaway' as const, items: [{ id: newId(), productId: 'p1', name: 'Kopi susu gula aren', qty: 1, unitPrice: 20000 }],
      orderDiscount: 5000, discounts: [{ id: newId(), source: 'coupon' as const, promotionId: 'pr-5k', couponId: coupon.coupon.id, label: 'Potongan 5 ribu', amount: 5000 }],
    });
    const a = await d.saveOrder(draft(), 'e-sari');
    expect(a.discountTotal).toBe(5000);
    expect(a.discounts).toMatchObject([{ source: 'coupon', couponId: coupon.coupon.id, amount: 5000 }]);
    expect((await d.findCoupon('HEMAT5'))!.coupon.usedCount).toBe(1);
    const b = await d.saveOrder(draft(), 'e-sari');
    expect((await d.findCoupon('HEMAT5'))!.coupon.usedCount).toBe(2);
    await d.voidUnpaidOrder(b.id, 'salah', 'e-budi');
    expect((await d.findCoupon('HEMAT5'))!.coupon.usedCount).toBe(1);
    await expect(d.deleteCoupon(coupon.coupon.id)).rejects.toThrow(/sudah pernah dipakai/);
    // simpan ulang pesanan yang sama tidak menghitung pemakaian dua kali
    await d.saveOrder({ ...draft(), id: a.id }, 'e-sari');
    expect((await d.findCoupon('HEMAT5'))!.coupon.usedCount).toBe(1);
  });

  it('potongan dibatasi belanja; tanpa rincian dicatat sebagai manual; gabung meja menyatukan rincian', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const item = () => [{ id: newId(), productId: 'p1', name: 'Kopi susu gula aren', qty: 1, unitPrice: 20000 }];
    const a = await d.saveOrder({ id: newId(), type: 'dine_in', tableId: 't-T1', items: item(), orderDiscount: 99999 }, 'e-sari');
    expect(a.discountTotal).toBe(20000);
    expect(a.discounts).toMatchObject([{ source: 'manual', amount: 20000 }]);
    const b = await d.saveOrder({ id: newId(), type: 'dine_in', tableId: 't-T2', items: item(), orderDiscount: 2000, discounts: [{ id: newId(), source: 'promo', promotionId: 'pr-kopi', label: 'Hemat kopi', amount: 2000 }] }, 'e-sari');
    const merged = await d.mergeOrders({ intoId: b.id, fromId: a.id, authorizedBy: 'e-budi' });
    expect(merged.discountTotal).toBe(22000);
    expect(merged.discounts!.map((x) => x.amount).sort()).toEqual([2000, 20000]);
    expect(new Set(merged.discounts!.map((x) => x.id)).size).toBe(2);
  });
});

describe('promoProductIds (filter Promo di kasir)', () => {
  const mk = (o: Partial<Promotion>): Promotion => ({ id: 'p', name: 'x', kind: 'percent_item', value: 10, minSpend: 0, productIds: [], orderTypes: ['dine_in', 'takeaway'], isActive: true, ...o });
  const now = new Date('2026-11-10T05:00:00Z');
  it('mengumpulkan produk promo item yang berlaku untuk jenis order ini', () => {
    const ids = promoProductIds([mk({ productIds: ['a', 'b'] }), mk({ id: 'q', kind: 'amount_item', productIds: ['c'] })], now, 'takeaway');
    expect([...ids].sort()).toEqual(['a', 'b', 'c']);
  });
  it('mengabaikan promo nonaktif, kedaluwarsa, belum mulai, jenis order lain, dan promo semua produk', () => {
    const promos = [
      mk({ productIds: ['off'], isActive: false }), mk({ productIds: ['old'], endsAt: '2026-11-09T00:00:00Z' }),
      mk({ productIds: ['soon'], startsAt: '2026-11-11T00:00:00Z' }), mk({ productIds: ['other'], orderTypes: ['delivery'] }),
      mk({ productIds: [] }), mk({ kind: 'percent_order', productIds: ['ord'] }),
    ];
    expect(promoProductIds(promos, now, 'takeaway').size).toBe(0);
  });
  it('promo gratis item memasukkan produk syarat dan produk gratisnya', () => {
    expect([...promoProductIds([mk({ kind: 'free_item', productIds: ['s'], freeProductId: 'f' })], now, 'dine_in')].sort()).toEqual(['f', 's']);
  });
});

describe('nomor referensi kupon/promo', () => {
  it('merapikan spasi ujung dan menolak panjang berlebih atau karakter kontrol', () => {
    expect(normalizeCouponReference('')).toBeUndefined();
    expect(normalizeCouponReference('   ')).toBeUndefined();
    expect(normalizeCouponReference('  CPN-001  ')).toBe('CPN-001');

    expect(couponReferenceProblem('')).toBeNull();
    expect(couponReferenceProblem('   ')).toBeNull();
    expect(couponReferenceProblem('a'.repeat(COUPON_REFERENCE_MAX))).toBeNull();
    expect(couponReferenceProblem(`  ${'a'.repeat(COUPON_REFERENCE_MAX)}  `)).toBeNull();
    expect(couponReferenceProblem('a'.repeat(COUPON_REFERENCE_MAX + 1))).toMatch(/60/);
    expect(couponReferenceProblem('CPN\u00001')).toMatch(/kontrol/);
    expect(couponReferenceProblem('CPN\n1')).toMatch(/kontrol/);

    expect(discountDisplayLabel({ label: 'Diskon 5 ribu' })).toBe('Diskon 5 ribu');
    expect(discountDisplayLabel({ label: 'Diskon 5 ribu', reference: 'CPN-001' })).toBe('Diskon 5 ribu · Ref: CPN-001');
  });

  it('mempertahankan nomor referensi lewat newApplied -> resolveDiscounts -> saveOrder -> getOrder -> appliedFromEntries', async () => {
    const p = promo({ id: 'pr-cpn', kind: 'amount_order', value: 5000, name: 'Potongan kupon' });
    const app = newApplied({ source: 'coupon', promotionId: p.id, couponId: 'cp-1', code: 'HEMAT5', label: p.name, reference: '  CPN-001  ' });
    expect(app.reference).toBe('CPN-001');
    const c = cart([L('p1', 1, 20000)]);
    const res = resolveDiscounts([app], [p], c, NOW);
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]!.reference).toBe('CPN-001');

    const d = createFakeData({ now: () => NOW });
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const cpn = (await d.findCoupon('HEMAT5'))!;
    const saved = await d.saveOrder({
      id: newId(), type: 'takeaway', items: [{ id: newId(), productId: 'p1', name: 'Kopi susu gula aren', qty: 1, unitPrice: 20000 }],
      orderDiscount: 5000,
      discounts: [{ id: newId(), source: 'coupon', promotionId: cpn.promotion.id, couponId: cpn.coupon.id, label: cpn.promotion.name, amount: 5000, reference: '  VOUCHER-42  ' }],
    }, 'e-sari');
    expect(saved.discounts?.[0]?.reference).toBe('VOUCHER-42');

    const loaded = (await d.getOrder(saved.id))!;
    expect(loaded.discounts?.[0]?.reference).toBe('VOUCHER-42');
    const reapplied = appliedFromEntries(loaded.discounts ?? []);
    expect(reapplied[0]?.reference).toBe('VOUCHER-42');
    const reresolved = resolveDiscounts(reapplied, await d.listPromotions(), c, NOW);
    expect(reresolved.entries[0]?.reference).toBe('VOUCHER-42');

    await expect(d.saveOrder({
      id: newId(), type: 'takeaway', items: [{ id: newId(), productId: 'p1', name: 'Kopi susu gula aren', qty: 1, unitPrice: 20000 }],
      orderDiscount: 5000,
      discounts: [{ id: newId(), source: 'coupon', promotionId: cpn.promotion.id, couponId: cpn.coupon.id, label: cpn.promotion.name, amount: 5000, reference: 'x'.repeat(61) }],
    }, 'e-sari')).rejects.toThrow(/60/);
  });
});
