import { describe, expect, it } from 'vitest';
import { checkStockLimit, stockLimitMessage } from '../src/stock-limit';

const base = { allowNegative: false, trackStock: true, stock: 3, inCart: 0 };
describe('batas jual stok habis', () => {
  it('izin stok minus = tidak membatasi', () => {
    expect(checkStockLimit({ ...base, allowNegative: true, stock: 0 }).ok).toBe(true);
  });
  it('produk tanpa pelacakan stok tidak dibatasi', () => {
    expect(checkStockLimit({ ...base, trackStock: false, stock: 0 }).ok).toBe(true);
  });
  it('stok belum diketahui tidak membatasi (offline)', () => {
    expect(checkStockLimit({ ...base, stock: undefined }).ok).toBe(true);
  });
  it('boleh sampai stok terpakai habis, lalu ditolak', () => {
    expect(checkStockLimit({ ...base, inCart: 2 })).toEqual({ ok: true, available: 1 });
    expect(checkStockLimit({ ...base, inCart: 3 })).toEqual({ ok: false, available: 0 });
  });
  it('stok 0 atau negatif ditolak', () => {
    expect(checkStockLimit({ ...base, stock: 0 }).ok).toBe(false);
    expect(checkStockLimit({ ...base, stock: -4 }).ok).toBe(false);
  });
  it('menambah banyak sekaligus dicek terhadap sisa', () => {
    expect(checkStockLimit({ ...base, inCart: 1, adding: 2 }).ok).toBe(true);
    expect(checkStockLimit({ ...base, inCart: 1, adding: 3 }).ok).toBe(false);
  });
  it('pesan sesuai sisa', () => {
    expect(stockLimitMessage('Latte', 0)).toBe('Latte stoknya habis.');
    expect(stockLimitMessage('Latte', 2)).toBe('Sisa stok Latte hanya 2.');
  });
});
