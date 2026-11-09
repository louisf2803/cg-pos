import { describe, expect, it } from 'vitest';
import { bundleProblem, bundleSeparatePrice, createFakeData, newId } from '../src';

const mk = () => { const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') }); d.reset(); return d; };
const base = { name: 'Paket Hemat', categoryId: 'c-kopi', price: 30000, items: [{ productId: 'p2', qty: 1 }, { productId: 'p9', qty: 1 }] };

describe('paket (bundle)', () => {
  it('validasi isian', () => {
    expect(bundleProblem({ ...base, name: ' ' })).toMatch(/Nama/);
    expect(bundleProblem({ ...base, price: -1 })).toMatch(/Harga/);
    expect(bundleProblem({ ...base, price: Number.NaN })).toMatch(/Harga/);
    expect(bundleProblem({ ...base, items: [] })).toMatch(/minimal satu/);
    expect(bundleProblem({ ...base, items: [{ productId: 'p2', qty: 1 }, { productId: 'p2', qty: 2 }] })).toMatch(/sekali/);
    expect(bundleProblem({ ...base, items: [{ productId: 'p2', qty: 0 }] })).toMatch(/lebih dari 0/);
    expect(bundleProblem({ ...base, id: 'p2' })).toMatch(/dirinya sendiri/);
    expect(bundleProblem(base)).toBeNull();
    expect(bundleSeparatePrice(base.items, (id) => ({ p2: 18000, p9: 18500 }[id] ?? 0))).toBe(36500);
  });

  it('simpan, daftar, ubah isi, nonaktifkan; nama ganda dan paket dalam paket ditolak', async () => {
    const d = mk();
    const b = await d.saveBundle(base);
    expect(b.items.map((i) => i.name)).toEqual(['Americano', 'Roti bakar cokelat keju']);
    await expect(d.saveBundle({ ...base, name: 'paket hemat' })).rejects.toThrow(/sudah ada/);
    await expect(d.saveBundle({ ...base, name: 'Lain', items: [{ productId: b.id, qty: 1 }] })).rejects.toThrow(/paket lain/);
    const b2 = await d.saveBundle({ ...base, id: b.id, price: 28000, items: [{ productId: 'p2', qty: 2 }] });
    expect(b2.price).toBe(28000); expect(b2.items).toHaveLength(1);
    await d.setBundleActive(b.id, false);
    expect(await d.listBundles()).toHaveLength(0);
    expect(await d.listBundles({ includeInactive: true })).toHaveLength(1);
    // paket tidak muncul di katalog produk pemilik, tetapi di kasir (listProducts) ya bila aktif
    expect((await d.listCatalog({ includeInactive: true })).some((p) => p.id === b.id)).toBe(false);
    await d.setBundleActive(b.id, true);
    expect((await d.listProducts()).some((p) => p.id === b.id && p.kind === 'bundle')).toBe(true);
  });

  it('menjual paket memotong stok komponennya, refund dengan restock mengembalikannya', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const b = await d.saveBundle({ ...base, items: [{ productId: 'p2', qty: 2 }, { productId: 'p8', qty: 1 }] });
    const before = async (id: string) => (await d.getProduct(id))!.stock!;
    const [a0, w0] = [await before('p2'), await before('p8')];
    const o = await d.saveOrder({ id: newId(), type: 'takeaway', items: [{ id: newId(), productId: b.id, name: b.name, qty: 2, unitPrice: b.price }] }, 'e-sari');
    const paid = await d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: o.total, tendered: o.total });
    expect([await before('p2'), await before('p8')]).toEqual([a0 - 4, w0 - 2]);
    await d.refundOrder({ id: newId(), orderId: paid.id, methodId: 'm-cash', items: [{ orderItemId: paid.items[0]!.id, qty: 1 }], reason: 'salah', restock: true, authorizedBy: 'e-budi' });
    expect([await before('p2'), await before('p8')]).toEqual([a0 - 2, w0 - 1]);
  });
});
