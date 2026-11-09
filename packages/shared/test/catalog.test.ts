import { describe, expect, it } from 'vitest';
import { createFakeData } from '../src/fake';
import { assembleCatalog, variantsProblem } from '../src/variants';
import type { Product } from '../src/types';

const P = (id: string, name: string, price: number, extra: Partial<Product> = {}): Product =>
  ({ id, name, categoryId: 'c1', price, kind: 'goods', trackStock: false, isActive: true, isFavorite: false, ...extra });

describe('assembleCatalog', () => {
  it('induk memuat anak-anaknya sebagai varian terurut, produk lain tunggal', () => {
    const c = assembleCatalog([
      P('par', 'Americano', 0, { isSellable: false }),
      P('l', 'Americano (L)', 30000, { parentId: 'par' }), P('s', 'Americano (S)', 20000, { parentId: 'par' }), P('m', 'Americano (M)', 25000, { parentId: 'par' }),
      P('x', 'Air mineral', 5000),
    ]);
    expect(c.map((p) => p.name)).toEqual(['Air mineral', 'Americano']);
    const a = c[1]!;
    expect(a.variants.map((v) => v.label)).toEqual(['S', 'M', 'L']);
    expect(a.price).toBe(20000);
    expect(c[0]!.variants).toEqual([]);
  });
  it('foto induk atau anak pertama yang punya foto ikut ke katalog', () => {
    const c = assembleCatalog([
      P('par', 'Aerocano', 0, { isSellable: false }),
      P('s', 'Aerocano (S)', 20000, { parentId: 'par', photoUrl: 'https://x/a.png' }), P('m', 'Aerocano (M)', 25000, { parentId: 'par' }),
      P('x', 'Air mineral', 5000, { photoUrl: 'https://x/b.png' }), P('y', 'Teh', 4000),
    ]);
    expect(c.find((p) => p.name === 'Aerocano')!.photoUrl).toBe('https://x/a.png');
    expect(c.find((p) => p.name === 'Air mineral')!.photoUrl).toBe('https://x/b.png');
    expect(c.find((p) => p.name === 'Teh')!.photoUrl).toBeUndefined();
  });
  it('anak yatim dibuatkan grup dari nama dasar; induk tanpa anak tidak tampil', () => {
    const c = assembleCatalog([P('a', 'Teh (S)', 1, { parentId: 'gone' }), P('b', 'Teh (M)', 2, { parentId: 'gone' }), P('e', 'Kosong', 0, { isSellable: false })]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ id: 'gone', name: 'Teh' });
  });
});

describe('variantsProblem', () => {
  it('menolak nama kosong, kurung, dobel, harga tak valid', () => {
    expect(variantsProblem([{ label: ' ', price: 1 }])).toMatch(/wajib/);
    expect(variantsProblem([{ label: 'S (kecil)', price: 1 }])).toMatch(/kurung/);
    expect(variantsProblem([{ label: 'S', price: 1 }, { label: 's', price: 2 }])).toMatch(/dobel/);
    expect(variantsProblem([{ label: 'S', price: -1 }])).toMatch(/tidak valid/);
    expect(variantsProblem([{ label: 'S', price: 1 }, { label: 'M', price: 2 }])).toBeNull();
  });
});

describe('fake: simpan katalog', () => {
  it('membuat produk berarian, mengubah, menghapus varian, dan menjadikannya tunggal lagi', async () => {
    const d = createFakeData();
    const cat = (await d.listCategories())[0]!.id;
    const made = await d.saveCatalogProduct({ name: 'Matcha', categoryId: cat, price: 0, variants: [{ label: 'M', price: 22000, sku: 'MT-M' }, { label: 'L', price: 26000, sku: 'MT-L' }] });
    expect(made.variants.map((v) => v.label)).toEqual(['M', 'L']);
    // kasir melihat satu baris per ukuran dengan nama "Matcha (M)"
    expect((await d.listProducts()).map((p) => p.name)).toEqual(expect.arrayContaining(['Matcha (M)', 'Matcha (L)']));
    // ganti nama induk -> nama anak ikut; tambah S; hapus L
    const m = made.variants.find((v) => v.label === 'M')!;
    const upd = await d.saveCatalogProduct({ id: made.id, name: 'Matcha Latte', categoryId: cat, price: 0, variants: [{ label: 'S', price: 18000 }, { id: m.id, label: 'M', price: 23000, sku: 'MT-M' }] });
    expect(upd.variants.map((v) => [v.label, v.price])).toEqual([['S', 18000], ['M', 23000]]);
    const names = (await d.listProducts()).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Matcha Latte (S)', 'Matcha Latte (M)']));
    expect(names).not.toContain('Matcha (L)');
    // SKU bentrok ditolak
    await expect(d.saveCatalogProduct({ name: 'X', categoryId: cat, price: 1, sku: 'MT-M', variants: [] })).rejects.toThrow(/SKU/);
    // nonaktifkan seluruh grup -> hilang dari kasir
    await d.setCatalogActive(made.id, false);
    expect((await d.listProducts()).some((p) => p.name.startsWith('Matcha Latte'))).toBe(false);
    // jadi tunggal lagi
    const single = await d.saveCatalogProduct({ id: made.id, name: 'Matcha Latte', categoryId: cat, price: 21000, variants: [] });
    expect(single.variants).toEqual([]);
    expect(single.price).toBe(21000);
  });
  it('mengubah produk tunggal menjadi berarian tanpa menggandakan', async () => {
    const d = createFakeData();
    const before = await d.listCatalog();
    const p = before.find((x) => x.name === 'Latte')!;
    const r = await d.saveCatalogProduct({ id: p.id, name: 'Latte', categoryId: p.categoryId, price: 0, variants: [{ label: 'S', price: 20000 }, { label: 'L', price: 28000 }] });
    expect(r.variants).toHaveLength(2);
    expect((await d.listCatalog()).filter((x) => x.name === 'Latte')).toHaveLength(1);
  });

  it('kategori dan departemen: tambah, pindah, nama ganda ditolak, hapus melepas isinya', async () => {
    const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') }); d.reset();
    const dept = await d.saveDepartment({ name: ' Bar ' });
    expect(dept.name).toBe('Bar');
    await expect(d.saveDepartment({ name: 'bar' })).rejects.toThrow(/sudah ada/);
    const cat = await d.saveCategory({ name: 'Manual brew', departmentId: dept.id });
    expect(cat.departmentId).toBe(dept.id);
    await expect(d.saveCategory({ name: 'manual brew' })).rejects.toThrow(/sudah ada/);
    await expect(d.saveCategory({ name: 'X', departmentId: 'nope' })).rejects.toThrow(/tidak ditemukan/);
    const moved = await d.saveCategory({ id: cat.id, name: 'Manual brew', departmentId: null });
    expect(moved.departmentId).toBeNull();
    await d.saveCategory({ id: cat.id, name: 'Manual brew', departmentId: dept.id });
    await d.saveProduct({ name: 'V60', categoryId: cat.id, price: 25000 });
    expect((await d.categoryProductCounts())[cat.id]).toBe(1);
    await d.deleteDepartment(dept.id);
    expect((await d.listCategories()).find((c) => c.id === cat.id)!.departmentId).toBeNull();
    await d.deleteCategory(cat.id);
    expect((await d.listCategories()).some((c) => c.id === cat.id)).toBe(false);
    expect((await d.listProducts({ search: 'V60' }))[0]!.categoryId).toBeNull();
    await expect(d.deleteCategory(cat.id)).rejects.toThrow(/tidak ditemukan/);
  });
});
