import { describe, expect, it } from 'vitest';
import { createFakeData, extraGroupProblem, extrasKey, extrasLineTotal, groupsForProduct, newId, pickedExtras, selectionProblem } from '../src';

const mk = () => { const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') }); d.reset(); return d; };

describe('Ekstra (modifier)', () => {
  it('grup berlaku untuk produk dan varian anaknya; grup kosong tidak tampil', async () => {
    const d = mk(); const groups = await d.listExtraGroups();
    expect(groupsForProduct(groups, { id: 'p1' }).map((g) => g.id).sort()).toEqual(['g-gula', 'g-tambah']);
    expect(groupsForProduct(groups, { id: 'p7s', parentId: 'pv-teh' }).length).toBe(2);   // varian memakai grup induk
    expect(groupsForProduct(groups, { id: 'p10' })).toEqual([]);
  });

  it('aturan pilihan: wajib, satu, dan batas', async () => {
    const [gula, tambah] = (await mk().listExtraGroups()) as [never, never] as any[];
    expect(selectionProblem({ ...gula, required: true }, [])).toMatch(/pilih salah satu/);
    expect(selectionProblem(gula, ['o-normal', 'o-less'])).toMatch(/hanya boleh satu/);
    expect(selectionProblem(tambah, ['o-shot', 'o-oat', 'o-cream'])).toBeNull();
    expect(selectionProblem({ ...tambah, maxSelect: 2 }, ['o-shot', 'o-oat', 'o-cream'])).toMatch(/maksimal 2/);
  });

  it('total Ekstra masuk ke total pesanan dan tersimpan di baris; baris sama hanya bila pilihannya sama', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const groups = await d.listExtraGroups();
    const extras = pickedExtras(groups, ['o-shot', 'o-oat']);
    expect(extras.map((e) => e.name)).toEqual(['Extra shot', 'Susu oat']);
    expect(extrasLineTotal(2, extras)).toBe(22000);
    expect(extrasKey(extras)).toBe(extrasKey([...extras].reverse()));
    const o = await d.saveOrder({ id: newId(), type: 'takeaway', items: [{ id: newId(), productId: 'p1', name: 'Kopi susu gula aren', qty: 2, unitPrice: 20000, extras }] }, 'e-sari');
    expect(o.items[0]!.lineTotal).toBe(2 * 20000 + 22000);
    expect(o.items[0]!.extras!.length).toBe(2);
    expect(o.subtotal).toBe(62000);
  });

  it('simpan grup: validasi, nama ganda ditolak, pilihan dan produk diperbarui', async () => {
    const d = mk();
    const base = { name: 'Topping', required: false, mode: 'multiple' as const, options: [{ name: 'Boba', price: 4000 }], productIds: ['p3'] };
    expect(extraGroupProblem({ ...base, options: [] })).toMatch(/minimal satu/);
    expect(extraGroupProblem({ ...base, options: [{ name: 'A', price: 1 }, { name: 'a', price: 2 }] })).toMatch(/dua kali/);
    expect(extraGroupProblem({ ...base, options: [{ name: 'A', price: -5 }] })).toMatch(/rupiah/);
    const g = await d.saveExtraGroup(base);
    await expect(d.saveExtraGroup({ ...base, name: 'level GULA' })).rejects.toThrow(/sudah ada/);
    const g2 = await d.saveExtraGroup({ ...base, id: g.id, options: [{ id: g.options[0]!.id, name: 'Boba besar', price: 5000 }, { name: 'Jeli', price: 3000 }], productIds: ['p3', 'p4'], maxSelect: 2 });
    expect(g2.options.map((o) => o.name)).toEqual(['Boba besar', 'Jeli']);
    expect(g2.options[0]!.id).toBe(g.options[0]!.id);
    expect(g2.productIds).toEqual(['p3', 'p4']); expect(g2.maxSelect).toBe(2);
    await d.deleteExtraGroup(g.id);
    expect((await d.listExtraGroups()).some((x) => x.id === g.id)).toBe(false);
  });
});
