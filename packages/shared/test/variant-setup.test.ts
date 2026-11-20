import { describe, expect, it } from 'vitest';
import { comboKeyFor, groupsForProduct, setupFromGroups, variantColumns, variantSetupProblem, variantStockPreview, type ExtraGroup } from '../src';
import { createFakeData } from '../src/fake';

const size: ExtraGroup = { id: 'g-size', name: 'Ukuran', required: true, mode: 'single', maxSelect: null, kind: 'plain', productIds: ['p1'],
  options: [{ id: 's', name: 'Small', price: 0, sort: 1 }, { id: 'm', name: 'Medium', price: 0, sort: 2 }, { id: 'l', name: 'Large', price: 0, sort: 3 }],
  productSetups: { p1: { sort: 0, isParent: true, options: { s: 0, l: 3000 } } } };
const temp: ExtraGroup = { id: 'g-temp', name: 'Suhu', required: true, mode: 'single', maxSelect: null, productIds: ['p1'],
  options: [{ id: 'hot', name: 'Hot', price: 0, sort: 1 }, { id: 'ice', name: 'Iced', price: 0, sort: 2 }],
  productSetups: { p1: { sort: 1, isParent: true, options: null } } };
const sugar: ExtraGroup = { id: 'g-sugar', name: 'Gula', required: false, mode: 'single', maxSelect: null, kind: 'material', productIds: ['p1'],
  options: [{ id: 'n', name: 'Normal', price: 0, sort: 1 }, { id: 'h', name: 'Half sugar', price: 0, sort: 2 }],
  productSetups: { p1: { sort: 2, isParent: false, options: { n: 0, h: 0 } } } };

describe('varian: kolom dan kunci', () => {
  it('tanpa induk satu kolom, dua induk = kombinasi', () => {
    expect(variantColumns([])).toEqual([{ key: '*', label: 'Semua' }]);
    const cols = variantColumns([{ options: [{ id: 's', name: 'Small' }, { id: 'l', name: 'Large' }] }, { options: [{ id: 'hot', name: 'Hot' }, { id: 'ice', name: 'Iced' }] }]);
    expect(cols.map((c) => c.key)).toEqual(['s|hot', 's|ice', 'l|hot', 'l|ice']);
    expect(cols[3]!.label).toBe('Large · Iced');
  });
  it('comboKeyFor null bila induk belum lengkap', () => {
    const ps = [{ options: [{ id: 's' }, { id: 'l' }] }, { options: [{ id: 'hot' }, { id: 'ice' }] }];
    expect(comboKeyFor(ps, ['l', 'ice', 'n'])).toBe('l|ice');
    expect(comboKeyFor(ps, ['l'])).toBeNull();
    expect(comboKeyFor([], [])).toBe('*');
  });
});

describe('varian: groupsForProduct memakai pengaturan produk', () => {
  it('menyaring isi yang diizinkan, memakai tambahan harga, urut sesuai pengaturan, menandai induk', () => {
    const gs = groupsForProduct([sugar, temp, size], { id: 'p1' });
    expect(gs.map((g) => g.id)).toEqual(['g-size', 'g-temp', 'g-sugar']);
    expect(gs[0]!.options.map((o) => [o.id, o.price])).toEqual([['s', 0], ['l', 3000]]);
    expect(gs[0]!.isParent).toBe(true);
    expect(gs[2]!.isParent).toBeUndefined();
    expect(groupsForProduct([size], { id: 'zzz' })).toEqual([]);
  });
});

describe('varian: takaran dan galat', () => {
  const lines = [
    { optionId: null, comboKey: 'l', ingredientId: 'kopi', qty: 18, unitId: 'g' },
    { optionId: null, comboKey: 's', ingredientId: 'kopi', qty: 9, unitId: 'g' },
    { optionId: 'h', comboKey: 'l', ingredientId: 'gula', qty: 8, unitId: 'g' },
    { optionId: 'n', comboKey: 'l', ingredientId: 'gula', qty: 15, unitId: 'g' },
  ];
  it('pratinjau mengikuti kolom induk dan pilihan', () => {
    expect(variantStockPreview(lines, [{ options: [{ id: 's' }, { id: 'l' }] }], ['l', 'h'])).toEqual([{ ingredientId: 'kopi', qty: 18, unitId: 'g' }, { ingredientId: 'gula', qty: 8, unitId: 'g' }]);
    expect(variantStockPreview(lines, [{ options: [{ id: 's' }, { id: 'l' }] }], [])).toEqual([]);
  });
  it('tiga induk ditolak, takaran nol ditolak', () => {
    const g = (i: number, p: boolean) => ({ groupId: `g${i}`, isParent: p, options: null });
    expect(variantSetupProblem({ groups: [g(1, true), g(2, true), g(3, true)], lines: [] })).toMatch(/2 varian induk/);
    expect(variantSetupProblem({ groups: [g(1, true)], lines: [{ optionId: null, comboKey: '*', ingredientId: 'x', qty: 0, unitId: 'u' }] })).toMatch(/lebih dari 0/);
    expect(variantSetupProblem({ groups: [g(1, true), g(2, false)], lines: [] })).toBeNull();
  });
  it('setupFromGroups mengurut dan memetakan isi', () => {
    expect(setupFromGroups([sugar, temp, size], 'p1').map((x) => x.groupId)).toEqual(['g-size', 'g-temp', 'g-sugar']);
  });
});

describe('varian: DataLayer palsu menyimpan pengaturan produk', () => {
  it('simpan lalu baca kembali, dan listExtraGroups ikut terbarui', async () => {
    const data = createFakeData();
    const gs = await data.listExtraGroups();
    const g = gs[0]!;
    await data.saveProductVariants('p2', { groups: [{ groupId: g.id, isParent: true, options: [{ optionId: g.options[0]!.id, priceDelta: 1000 }] }], lines: [{ optionId: null, comboKey: g.options[0]!.id, ingredientId: 'bahan', qty: 5, unitId: 'u' }] });
    const back = await data.getProductVariants('p2');
    expect(back.groups).toEqual([{ groupId: g.id, isParent: true, options: [{ optionId: g.options[0]!.id, priceDelta: 1000 }] }]);
    expect(back.lines).toHaveLength(1);
    const after = (await data.listExtraGroups()).find((x) => x.id === g.id)!;
    expect(after.productIds).toContain('p2');
    await expect(data.saveProductVariants('p2', { groups: [{ groupId: 'tidak-ada', isParent: false, options: null }], lines: [] })).rejects.toThrow();
  });
});
