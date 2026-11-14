import { describe, expect, it } from 'vitest';
import { assembleCatalog, productUnitProblem } from '../src';
import { toProduct } from '../src/supabase-map';

const row = {
  id: 'p1', name: 'Air', category_id: null, kind: 'goods', track_stock: true, is_active: true, is_favorite: false, base_unit_id: 'u-pcs',
  product_units: [
    { id: 'pu1', price: 5000, sku: null, is_base: true, deleted_at: null, unit_id: 'u-pcs', conversion: 1 },
    { id: 'pu2', price: 110000, is_base: false, deleted_at: null, unit_id: 'u-dus', conversion: 24 },
    { id: 'pu3', price: 0, is_base: false, deleted_at: null, unit_id: 'u-krat', conversion: 12 },
    { id: 'pu4', price: 90000, is_base: false, deleted_at: '2026-11-01', unit_id: 'u-lama', conversion: 10 },
  ],
};
const names = new Map([['u-pcs', 'pcs'], ['u-dus', 'dus'], ['u-krat', 'krat'], ['u-lama', 'lama']]);

describe('satuan jual', () => {
  it('hanya satuan lain berharga jual dan belum diarsipkan yang tampil di kasir', () => {
    const p = toProduct(row, names);
    expect(p.sellUnits).toEqual([{ id: 'pu2', name: 'dus', conversion: 24, price: 110000 }]);
    expect(p.baseUnitName).toBe('pcs');
    expect(p.price).toBe(5000);
  });
  it('produk tanpa satuan jual tidak membawa daftar kosong', () => {
    const p = toProduct({ ...row, product_units: [row.product_units[0]] }, names);
    expect(p.sellUnits).toBeUndefined();
  });
  it('katalog meneruskan satuan jual produk tunggal', () => {
    const c = assembleCatalog([toProduct(row, names)]);
    expect(c[0]!.sellUnits).toHaveLength(1);
    expect(c[0]!.baseUnitName).toBe('pcs');
  });
  it('harga jual harus rupiah bulat dan tidak minus', () => {
    const base = { unitName: 'dus', conversion: 24 };
    expect(productUnitProblem({ ...base, sellPrice: 110000 })).toBeNull();
    expect(productUnitProblem({ ...base, sellPrice: -1 })).toMatch(/Harga jual/);
    expect(productUnitProblem({ ...base, sellPrice: 10.5 })).toMatch(/Harga jual/);
  });
});
