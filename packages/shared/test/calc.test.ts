import { describe, expect, it } from 'vitest';
import { allocate, cashChange, computeOrder, formatRp, parseRp, quickCashAmounts, roundToStep, formatOrderNumber, localDateKey } from '../src';
import type { CalcSettings } from '../src';

const S: CalcSettings = { taxCalc: 'after_discount', taxMode: 'per_order', serviceChargePct: 0, serviceChargeTaxable: false, serviceChargeOrderTypes: ['dine_in'] };
const PB1 = [{ name: 'PB1', rate: 10 }];
const identity = (r: ReturnType<typeof computeOrder>) => r.subtotal - r.discountTotal + r.serviceCharge + r.taxTotal + r.rounding;

describe('uang', () => {
  it('memformat rupiah', () => {
    expect(formatRp(49500)).toBe('Rp 49.500');
    expect(formatRp(0)).toBe('Rp 0');
    expect(formatRp(1250000)).toBe('Rp 1.250.000');
    expect(formatRp(-1000)).toBe('-Rp 1.000');
    expect(formatRp(999.6)).toBe('Rp 1.000');
  });
  it('membaca input', () => {
    expect(parseRp('Rp 49.500')).toBe(49500);
    expect(parseRp('')).toBe(0);
    expect(parseRp('abc')).toBe(0);
  });
  it('pembulatan ke kelipatan', () => {
    expect(roundToStep(49550, 100)).toBe(49600);
    expect(roundToStep(49549, 100)).toBe(49500);
    expect(roundToStep(49549, 0)).toBe(49549);
  });
  it('nominal cepat', () => {
    expect(quickCashAmounts(49500)).toEqual([49500, 50000, 60000, 100000]);
    expect(quickCashAmounts(20000)).toEqual([20000, 50000, 100000]);
    expect(quickCashAmounts(100000)).toEqual([100000]);
    expect(quickCashAmounts(16700)).toEqual([16700, 20000, 50000, 100000]);
  });
});

describe('computeOrder', () => {
  it('kasus acuan basis data: 2 kopi + 1 air, pajak 10% = 49.500', () => {
    const r = computeOrder({ orderType: 'takeaway', orderTaxes: PB1, settings: S, items: [
      { id: 'a', qty: 2, unitPrice: 20000 }, { id: 'b', qty: 1, unitPrice: 5000 }] });
    expect(r.subtotal).toBe(45000);
    expect(r.taxTotal).toBe(4500);
    expect(r.total).toBe(49500);
    expect(identity(r)).toBe(r.total);
  });
  it('potongan order mengurangi dasar pajak (after_discount) tetapi tidak (before_discount)', () => {
    const base = { orderType: 'takeaway' as const, orderTaxes: PB1, orderDiscount: 5000, items: [{ id: 'a', qty: 1, unitPrice: 50000 }] };
    const after = computeOrder({ ...base, settings: S });
    const before = computeOrder({ ...base, settings: { ...S, taxCalc: 'before_discount' } });
    expect(after.taxTotal).toBe(4500);
    expect(before.taxTotal).toBe(5000);
    expect(identity(after)).toBe(after.total);
    expect(identity(before)).toBe(before.total);
  });
  it('biaya layanan hanya untuk jenis order terpilih dan bisa kena pajak', () => {
    const cfg = { ...S, serviceChargePct: 5, serviceChargeTaxable: true };
    const dine = computeOrder({ orderType: 'dine_in', orderTaxes: PB1, settings: cfg, items: [{ id: 'a', qty: 1, unitPrice: 100000 }] });
    expect(dine.serviceCharge).toBe(5000);
    expect(dine.taxTotal).toBe(10500);
    const take = computeOrder({ orderType: 'takeaway', orderTaxes: PB1, settings: cfg, items: [{ id: 'a', qty: 1, unitPrice: 100000 }] });
    expect(take.serviceCharge).toBe(0);
    expect(take.taxTotal).toBe(10000);
    expect(identity(dine)).toBe(dine.total);
  });
  it('pembulatan tunai kelipatan 100', () => {
    const r = computeOrder({ orderType: 'takeaway', orderTaxes: PB1, settings: S, roundingStep: 100, items: [{ id: 'a', qty: 1, unitPrice: 15150 }] });
    // 15150 + 1515 = 16665 -> 16700
    expect(r.taxTotal).toBe(1515);
    expect(r.rounding).toBe(35);
    expect(r.total).toBe(16700);
    expect(identity(r)).toBe(r.total);
  });
  it('baris gratis, dibatalkan, ekstra, dan potongan baris', () => {
    const r = computeOrder({ orderType: 'takeaway', orderTaxes: [], settings: S, items: [
      { id: 'a', qty: 2, unitPrice: 20000, extrasTotal: 10000, discount: 5000 },
      { id: 'b', qty: 1, unitPrice: 8000, isFree: true },
      { id: 'c', qty: 1, unitPrice: 9000, voided: true },
      { id: 'd', qty: 1, unitPrice: 1000, discount: 99999 }] });
    expect(r.lines.map((l) => [l.id, l.lineTotal])).toEqual([['a', 45000], ['b', 0], ['d', 0]]);
    expect(r.subtotal).toBe(45000);
  });
  it('pajak per produk membagi potongan order secara proporsional', () => {
    const r = computeOrder({ orderType: 'takeaway', orderDiscount: 10000, settings: { ...S, taxMode: 'per_product' }, items: [
      { id: 'a', qty: 1, unitPrice: 60000, taxRate: 10 }, { id: 'b', qty: 1, unitPrice: 40000, taxRate: 0 }] });
    // diskon 10.000 dibagi 6.000 / 4.000; pajak hanya atas a: (60.000 - 6.000) * 10% = 5.400
    expect(r.taxTotal).toBe(5400);
    expect(r.total).toBe(100000 - 10000 + 5400);
    expect(r.taxLines).toHaveLength(1);
  });
  it('inclusive: harga menu sudah termasuk pajak; subtotal bersih, total = harga menu', () => {
    const I = { ...S, taxCalc: 'inclusive' as const };
    const r = computeOrder({ orderType: 'takeaway', settings: I, orderTaxes: PB1, items: [{ id: 'a', qty: 1, unitPrice: 11000 }] });
    expect(r).toMatchObject({ subtotal: 10000, discountTotal: 0, taxTotal: 1000, total: 11000 });
    expect(r.lines[0]).toMatchObject({ lineTotal: 10000, taxAmount: 1000 }); // taxAmount = pajak di harga baris (sebelum potongan order)
    expect(r.grossTotal).toBe(11000);
    expect(r.taxLines).toEqual([{ taxId: undefined, name: 'PB1', rate: 10, base: 10000, amount: 1000 }]);
  });
  it('inclusive dengan potongan order: pajak mengecil, identitas total tetap', () => {
    const r = computeOrder({ orderType: 'takeaway', orderDiscount: 1100, settings: { ...S, taxCalc: 'inclusive' }, orderTaxes: PB1, items: [{ id: 'a', qty: 1, unitPrice: 11000 }] });
    expect(r).toMatchObject({ subtotal: 10000, discountTotal: 1000, taxTotal: 900, total: 9900 });
    expect(identity(r)).toBe(r.total);
  });
  it('inclusive tanpa tarif pajak (PB1 mati) = tanpa pajak', () => {
    const r = computeOrder({ orderType: 'takeaway', settings: { ...S, taxCalc: 'inclusive' }, items: [{ id: 'a', qty: 2, unitPrice: 15000 }] });
    expect(r).toMatchObject({ subtotal: 30000, taxTotal: 0, total: 30000 });
  });
  it('inclusive: biaya layanan dari nilai bersih, pembulatan terakhir, per produk memakai tarif sendiri', () => {
    const I = { ...S, taxCalc: 'inclusive' as const, serviceChargePct: 5 };
    const r = computeOrder({ orderType: 'dine_in', roundingStep: 100, settings: I, orderTaxes: PB1, items: [{ id: 'a', qty: 3, unitPrice: 22000 }] });
    expect(r.subtotal).toBe(60000); expect(r.taxTotal).toBe(6000); expect(r.serviceCharge).toBe(3000);
    expect(identity(r)).toBe(r.total);
    const pp = computeOrder({ orderType: 'takeaway', settings: { ...I, taxMode: 'per_product' }, items: [{ id: 'a', qty: 1, unitPrice: 11000, taxRate: 10 }, { id: 'b', qty: 1, unitPrice: 5000, taxRate: 0 }] });
    expect(pp).toMatchObject({ subtotal: 15000, taxTotal: 1000, total: 16000 });
  });
  it('inclusive: identitas total dan total = harga menu - potongan untuk 2000 kombinasi acak', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let n = 0; n < 2000; n++) {
      const items = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => ({ id: `i${k}`, qty: 1 + Math.floor(rnd() * 4), unitPrice: 1000 + Math.floor(rnd() * 90) * 500, extrasTotal: rnd() < 0.3 ? 2500 : 0 }));
      const gross = items.reduce((a, i) => a + i.qty * i.unitPrice + i.extrasTotal, 0);
      const disc = rnd() < 0.5 ? Math.floor(rnd() * gross * 0.5) : 0;
      const pct = rnd() < 0.5 ? 5 : 0;
      const r = computeOrder({ orderType: 'dine_in', orderDiscount: disc, settings: { ...S, taxCalc: 'inclusive', serviceChargePct: pct }, orderTaxes: PB1, items });
      expect(identity(r)).toBe(r.total);
      expect(r.discountTotal).toBeGreaterThanOrEqual(0);
      expect(r.subtotal - r.discountTotal + r.taxTotal).toBe(gross - disc);
    }
  });
  it('identitas total berlaku untuk 2000 kombinasi acak', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let n = 0; n < 2000; n++) {
      const items = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => ({
        id: String(k), qty: Math.round((0.5 + rnd() * 4) * 100) / 100, unitPrice: Math.round(rnd() * 80000),
        extrasTotal: rnd() < 0.3 ? Math.round(rnd() * 8000) : 0, discount: rnd() < 0.2 ? Math.round(rnd() * 5000) : 0,
        taxRate: [0, 10, 11][Math.floor(rnd() * 3)] }));
      const cfg: CalcSettings = { taxCalc: rnd() < 0.5 ? 'after_discount' : 'before_discount', taxMode: rnd() < 0.5 ? 'per_order' : 'per_product',
        serviceChargePct: [0, 5, 7.5][Math.floor(rnd() * 3)]!, serviceChargeTaxable: rnd() < 0.5, serviceChargeOrderTypes: ['dine_in'] };
      const r = computeOrder({ orderType: rnd() < 0.5 ? 'dine_in' : 'takeaway', items, orderDiscount: Math.round(rnd() * 20000), orderTaxes: PB1, settings: cfg, roundingStep: [0, 100, 500][Math.floor(rnd() * 3)] });
      expect(identity(r)).toBe(r.total);
      expect(r.subtotal).toBe(r.lines.reduce((a, l) => a + l.lineTotal, 0));
      expect(r.total).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(r.total)).toBe(true);
    }
  });
});

describe('allocate', () => {
  it('jumlah persis dan proporsional', () => {
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocate(100, [60, 40])).toEqual([60, 40]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(5, [0, 0])).toEqual([0, 0]);
    for (const w of [[3, 3, 3], [1, 7, 13], [10, 1]]) {
      expect(allocate(1001, w).reduce((a, b) => a + b, 0)).toBe(1001);
    }
  });
});

describe('kembalian', () => {
  it('tunai lebih, pas, dan kurang', () => {
    expect(cashChange(49500, 0, 50000)).toEqual({ applied: 49500, change: 500, shortfall: 0 });
    expect(cashChange(49500, 0, 49500)).toEqual({ applied: 49500, change: 0, shortfall: 0 });
    expect(cashChange(49500, 0, 40000)).toEqual({ applied: 40000, change: 0, shortfall: 9500 });
    expect(cashChange(49500, 20000, 30000)).toEqual({ applied: 29500, change: 500, shortfall: 0 });
  });
});

describe('nomor order', () => {
  it('format dan zona waktu outlet', () => {
    expect(formatOrderNumber('OUT1', 'A', new Date('2026-11-09T10:00:00Z'), 1)).toBe('OUT1/A/261109/001');
    // 18:00 UTC = 01:00 WIB hari berikutnya
    expect(formatOrderNumber('OUT1', 'A', new Date('2026-11-09T18:00:00Z'), 12)).toBe('OUT1/A/261110/012');
    expect(localDateKey(new Date('2026-11-09T18:00:00Z'), 'Asia/Makassar')).toBe('2026-11-10');
    expect(localDateKey(new Date('2026-11-09T15:59:00Z'), 'Asia/Jakarta')).toBe('2026-11-09');
  });
});
