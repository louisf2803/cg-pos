import { describe, expect, it } from 'vitest';
import { createFakeData, DataError, pickLastPurchasePrice, purchasePriceProblem, suggestPurchasePrice, type PurchaseInvoice } from '../src';

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof DataError ? e.code : 'galat'));
const inv = (number: string, date: string, status: PurchaseInvoice['status'], price: number): PurchaseInvoice => ({
  id: number, number, supplierName: 'X', invoiceDate: date, termDays: 0, status, subtotal: 0, discount: 0, taxAmount: 0, otherCost: 0, total: 0, paidTotal: 0, outstanding: 0, payments: [],
  lines: [{ id: number + 'l', productId: 'p1', name: 'Biji', unitId: 'gram', unit: 'gram', qty: 1, receivedQty: 1, unitPrice: price, discount: 0, lineTotal: price }],
});

describe('pemetaan harga beli', () => {
  it('validasi', () => {
    expect(purchasePriceProblem({ productId: 'p1', mode: 'manual', price: 100 })).toBeNull();
    expect(purchasePriceProblem({ productId: 'p1', mode: 'last' })).toBeNull();
    expect(purchasePriceProblem({ productId: '', mode: 'last' })).toMatch(/Pilih barang/);
    expect(purchasePriceProblem({ productId: 'p1', mode: 'manual' })).toMatch(/Isi harga/);
    expect(purchasePriceProblem({ productId: 'p1', mode: 'manual', price: -1 })).toMatch(/negatif/);
    expect(purchasePriceProblem({ productId: 'p1', mode: 'manual', price: 1.00001 })).toMatch(/4 angka/);
    expect(purchasePriceProblem({ productId: 'p1', mode: 'harian' as never })).toMatch(/Mode/);
  });
  it('terakhir = faktur terbaru yang tidak batal; manual menimpa; tanpa riwayat = none', () => {
    const invs = [inv('A', '2026-01-10', 'open', 280), inv('B', '2026-03-05', 'paid', 310), inv('C', '2026-04-01', 'void', 999)];
    expect(pickLastPurchasePrice(invs, 'p1')).toMatchObject({ source: 'last', price: 310, invoiceNumber: 'B', unitId: 'gram' });
    expect(pickLastPurchasePrice(invs, 'lain')).toEqual({ source: 'none' });
    expect(suggestPurchasePrice({ productId: 'p1', mode: 'manual', manualPrice: 295.5 }, invs, 'p1')).toEqual({ source: 'manual', price: 295.5 });
    expect(suggestPurchasePrice({ productId: 'p1', mode: 'last' }, invs, 'p1').source).toBe('last');
    expect(suggestPurchasePrice(undefined, invs, 'p1').price).toBe(310);
  });
});

describe('pemetaan harga beli di data demo', () => {
  it('mengatur manual, kembali ke terakhir, dan menolak isian salah', async () => {
    const d = createFakeData();
    expect(await d.listPurchasePriceMappings()).toEqual([]);
    expect(await code(d.setPurchasePriceMapping({ productId: 'ing-kopi', mode: 'manual', price: -5 }))).toBe('invalid');
    expect(await code(d.setPurchasePriceMapping({ productId: 'tidak-ada', mode: 'last' }))).toBe('not_found');
    await d.setPurchasePriceMapping({ productId: 'ing-kopi', mode: 'manual', price: 321 });
    expect(await d.suggestPurchasePrice('ing-kopi')).toMatchObject({ source: 'manual', price: 321 });
    await d.setPurchasePriceMapping({ productId: 'ing-kopi', mode: 'last' });
    expect(await d.listPurchasePriceMappings()).toEqual([{ productId: 'ing-kopi', mode: 'last' }]);
    expect((await d.suggestPurchasePrice('ing-kopi')).source).not.toBe('manual');
  });
});
