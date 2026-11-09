import { describe, expect, it } from 'vitest';
import { groupVariants, splitVariantName } from '../src/variants';
import type { Product } from '../src/types';

const P = (id: string, name: string, price: number, extra: Partial<Product> = {}): Product =>
  ({ id, name, categoryId: 'c1', price, kind: 'goods', trackStock: false, isActive: true, isFavorite: false, ...extra });

describe('splitVariantName', () => {
  it('memisah induk dan ukuran', () => {
    expect(splitVariantName('Es Teh Manis (M)')).toEqual({ base: 'Es Teh Manis', label: 'M' });
    expect(splitVariantName('Kopi (Hot) Susu (L)')).toEqual({ base: 'Kopi (Hot) Susu', label: 'L' });
  });
  it('tanpa kurung: label = nama', () => {
    expect(splitVariantName('Air mineral')).toEqual({ base: 'Air mineral', label: 'Air mineral' });
  });
});

describe('groupVariants', () => {
  it('menggabungkan varian satu induk, mengurutkan S<M<L, menghitung rentang harga', () => {
    const t = groupVariants([
      P('a', 'Air mineral', 5000),
      P('v-l', 'Latte (L)', 30000, { parentId: 'pl' }), P('v-s', 'Latte (S)', 20000, { parentId: 'pl' }), P('v-m', 'Latte (M)', 25000, { parentId: 'pl' }),
    ]);
    expect(t.map((x) => x.kind)).toEqual(['single', 'group']);
    const g = t[1]!;
    if (g.kind !== 'group') throw new Error('harus grup');
    expect(g.name).toBe('Latte');
    expect(g.options.map((o) => o.label)).toEqual(['S', 'M', 'L']);
    expect([g.minPrice, g.maxPrice]).toEqual([20000, 30000]);
  });
  it('varian yatim tampil sebagai produk tunggal', () => {
    const t = groupVariants([P('x', 'Teh (S)', 10000, { parentId: 'pt' })]);
    expect(t).toHaveLength(1);
    expect(t[0]!.kind).toBe('single');
  });
  it('grup habis hanya bila semua ukuran habis (stok dilacak)', () => {
    const out = { trackStock: true, stock: 0 };
    const g1 = groupVariants([P('a', 'X (S)', 1, { parentId: 'p', ...out }), P('b', 'X (M)', 2, { parentId: 'p', trackStock: true, stock: 3 })])[0]!;
    const g2 = groupVariants([P('a', 'X (S)', 1, { parentId: 'p', ...out }), P('b', 'X (M)', 2, { parentId: 'p', ...out })])[0]!;
    expect(g1.kind === 'group' && g1.soldOut).toBe(false);
    expect(g2.kind === 'group' && g2.soldOut).toBe(true);
  });
  it('urutan ubin mengikuti kemunculan pertama', () => {
    const t = groupVariants([P('1', 'A', 1), P('2', 'B (S)', 1, { parentId: 'b' }), P('3', 'C', 1), P('4', 'B (M)', 2, { parentId: 'b' })]);
    expect(t.map((x) => x.key)).toEqual(['1', 'g:b', '3']);
  });
});
