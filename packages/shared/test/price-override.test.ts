import { describe, expect, it } from 'vitest';
import { createFakeData, declaredBasePrice, overridePricingForProduct, priceOverrideBounds, priceOverridePctProblem, priceOverrideProblem } from '../src';

describe('ubah harga di kasir', () => {
  it('menghitung batas dan memeriksa harga baru', () => {
    expect(priceOverrideBounds(20000, 20)).toEqual({ min: 16000, max: 24000 });
    expect(priceOverrideBounds(1000, 150)).toEqual({ min: 0, max: 2000 });
    expect(priceOverrideProblem(20000, 20, 18000)).toBeNull();
    expect(priceOverrideProblem(20000, 20, 16000)).toBeNull();
    expect(priceOverrideProblem(20000, 20, 24001)).toMatch(/antara 16\.000 dan 24\.000/);
    expect(priceOverrideProblem(20000, 20, 15999)).toMatch(/antara/);
    expect(priceOverrideProblem(20000, 0, 20000)).toMatch(/tidak boleh/);
    expect(priceOverrideProblem(20000, 20, Number.NaN)).toMatch(/rupiah/);
    expect(priceOverrideProblem(20000, 20, 18000.5)).toMatch(/penuh/);
    expect(priceOverrideProblem(20000, 20, -1)).toMatch(/rupiah/);
  });
  it('memeriksa batas persen produk', () => {
    expect(priceOverridePctProblem(0)).toBeNull();
    expect(priceOverridePctProblem(100)).toBeNull();
    expect(priceOverridePctProblem(101)).toMatch(/0 dan 100/);
    expect(priceOverridePctProblem(-1)).toMatch(/0 dan 100/);
    expect(priceOverridePctProblem(12.345)).toMatch(/2 angka/);
  });
  it('data palsu menyimpan batas ke produk dan katalog', async () => {
    const d = createFakeData();
    await d.setPriceOverride(['p1'], 25);
    expect((await d.getProduct('p1'))!.priceOverridePct).toBe(25);
    expect((await d.listCatalog()).find((c) => c.id === 'p1')!.priceOverridePct).toBe(25);
    await d.setPriceOverride(['p1'], 0);
    expect((await d.getProduct('p1'))!.priceOverridePct).toBeUndefined();
    await expect(d.setPriceOverride(['p1'], 150)).rejects.toThrow(/0 dan 100/);
    await expect(d.setPriceOverride(['tidak-ada'], 10)).rejects.toThrow(/tidak ditemukan/);
  });
  it('declaredBasePrice hanya mengirim harga dasar bila harga baris diubah dari harga daftar', () => {
    expect(declaredBasePrice({ unitPrice: 25000, basePrice: 25000 })).toEqual({});
    expect(declaredBasePrice({ unitPrice: 25000 })).toEqual({});
    expect(declaredBasePrice({ unitPrice: 23000, basePrice: 25000 })).toEqual({ basePrice: 25000 });
    expect(declaredBasePrice({ unitPrice: 0, basePrice: 25000 })).toEqual({ basePrice: 25000 });
  });
  it('memulihkan basePrice dan overridePct saat memuat ulang pesanan dari daftar produk', () => {
    expect(overridePricingForProduct(undefined)).toEqual({});
    expect(overridePricingForProduct({ price: 25000 })).toEqual({ basePrice: 25000 });
    expect(overridePricingForProduct({ price: 25000, priceOverridePct: 0 })).toEqual({ basePrice: 25000 });
    expect(overridePricingForProduct({ price: 25000, priceOverridePct: 15 })).toEqual({ basePrice: 25000, overridePct: 15 });
  });
});
