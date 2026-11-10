import { describe, expect, it } from 'vitest';
import { buyPricePerBase, createFakeData, describeProductUnit, productUnitProblem } from '../src';

describe('satuan ganda: aturan isian', () => {
  it('menolak isian yang salah dengan pesan Indonesia', () => {
    expect(productUnitProblem({ unitName: ' ', conversion: 5 })).toMatch(/nama satuan/i);
    expect(productUnitProblem({ unitName: 'x'.repeat(31), conversion: 5 })).toMatch(/30/);
    expect(productUnitProblem({ unitName: 'Gram', conversion: 5 }, 'gram')).toMatch(/satuan dasar/i);
    expect(productUnitProblem({ unitName: 'kg', conversion: 0 })).toMatch(/lebih dari 0/);
    expect(productUnitProblem({ unitName: 'kg', conversion: 1_000_001 })).toMatch(/terlalu besar/);
    expect(productUnitProblem({ unitName: 'kg', conversion: 1.0000001 })).toMatch(/6 angka/);
    expect(productUnitProblem({ unitName: 'kg', conversion: 5, buyPrice: -1 })).toMatch(/minus/);
    expect(productUnitProblem({ unitName: 'kg', conversion: 5, minPurchase: 0 })).toMatch(/minimum/i);
    expect(productUnitProblem({ unitName: 'kg', conversion: 1000, buyPrice: 90000, minPurchase: 2 }, 'gram')).toBeNull();
  });
  it('kalimat dan harga per satuan dasar', () => {
    expect(describeProductUnit({ name: 'kg', conversion: 1000 }, 'gram')).toBe('1 kg = 1.000 gram');
    expect(buyPricePerBase({ buyPrice: 320000, conversion: 1000 })).toBe(320);
    expect(buyPricePerBase({ buyPrice: 5, conversion: 0 })).toBe(0);
  });
});

describe('satuan ganda: data tiruan', () => {
  it('tambah, ubah, arsip satuan; satuan dasar tetap', async () => {
    const d = createFakeData();
    const [item] = await d.listPurchaseItems();
    const id = item!.productId;
    const before = await d.listProductUnits(id);
    expect(before[0]!.isBase).toBe(true);
    await d.saveProductUnit({ productId: id, unitName: 'Karung', conversion: 25000, buyPrice: 700000, minPurchase: 2 });
    let rows = await d.listProductUnits(id);
    const k = rows.find((r) => r.name === 'Karung')!;
    expect(k).toMatchObject({ conversion: 25000, buyPrice: 700000, minPurchase: 2, isBase: false, inUse: false });
    await d.saveProductUnit({ productId: id, unitName: 'karung', conversion: 25000, buyPrice: 720000 });
    rows = await d.listProductUnits(id);
    expect(rows.filter((r) => r.name.toLowerCase() === 'karung')).toHaveLength(1);
    expect(rows.find((r) => r.name === 'Karung')!.buyPrice).toBe(720000);
    expect((await d.listPurchaseItems()).find((i) => i.productId === id)!.units.some((u) => u.name === 'Karung')).toBe(true);
    await expect(d.saveProductUnit({ productId: id, unitName: 'dus', conversion: 0 })).rejects.toMatchObject({ code: 'invalid' });
    expect(await d.removeProductUnit(id, k.unitId)).toBe(true);
    expect(await d.removeProductUnit(id, k.unitId)).toBe(false);
    await expect(d.listProductUnits('tidak-ada')).rejects.toMatchObject({ code: 'not_found' });
  });
  it('satuan yang dipakai resep terkunci', async () => {
    const d = createFakeData();
    const liter = (await d.listProductUnits('ing-susu')).find((u) => u.name === 'liter')!;
    expect(liter.inUse).toBe(true);
    await expect(d.saveProductUnit({ productId: 'ing-susu', unitName: 'liter', conversion: 999 })).rejects.toMatchObject({ code: 'invalid' });
    await expect(d.removeProductUnit('ing-susu', liter.unitId)).rejects.toMatchObject({ code: 'invalid' });
    await d.saveProductUnit({ productId: 'ing-susu', unitName: 'liter', conversion: 1000, buyPrice: 19000 });
    expect((await d.listProductUnits('ing-susu')).find((u) => u.name === 'liter')!.buyPrice).toBe(19000);
  });
});
