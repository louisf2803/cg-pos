import { describe, expect, it } from 'vitest';
import { ACTIVITY_FILTERS, columnLabel, createFakeData, describeActivity, formatActivityValue, parseChanges } from '../src';

describe('log aktivitas: teks tampilan', () => {
  it('menyusun kalimat untuk perubahan dan kejadian sistem', () => {
    expect(describeActivity({ action: 'product.updated', entity: 'product', name: 'Kopi susu' })).toEqual({ headline: 'Produk diubah: Kopi susu', kind: 'change' });
    expect(describeActivity({ action: 'table.deleted', entity: 'table', name: 'Meja 12' }).headline).toBe('Meja diarsipkan: Meja 12');
    expect(describeActivity({ action: 'member.removed', entity: 'member' }).headline).toBe('Akses pengguna dihapus permanen');
    expect(describeActivity({ action: 'employee.pin_changed', entity: 'employee', name: 'Sari' })).toEqual({ headline: 'PIN karyawan diganti: Sari', kind: 'system' });
    expect(describeActivity({ action: 'order.finalize_failed', entity: 'order' }).kind).toBe('system');
    expect(describeActivity({ action: 'aneh.sekali', entity: 'aneh' }).headline).toBe('aneh.sekali');
  });
  it('memformat nilai dan nama kolom', () => {
    expect(formatActivityValue(null)).toBe('kosong');
    expect(formatActivityValue('')).toBe('kosong');
    expect(formatActivityValue(true)).toBe('ya');
    expect(formatActivityValue(false)).toBe('tidak');
    expect(formatActivityValue(24000)).toBe('24.000');
    expect(formatActivityValue('x'.repeat(200)).length).toBe(80);
    expect(columnLabel('price')).toBe('Harga jual');
    expect(columnLabel('kolom_baru')).toBe('Kolom baru');
  });
  it('membaca perubahan dari database, mengabaikan bentuk salah, dan mengurutkan kolom', () => {
    expect(parseChanges({ rate: [10, 11], a_col: ['x', null], buruk: 'zzz', tiga: [1, 2, 3] })).toEqual([
      { column: 'a_col', from: 'x', to: null }, { column: 'rate', from: 10, to: 11 },
    ]);
    expect(parseChanges(null)).toEqual([]);
    expect(parseChanges([['a', 'b']])).toEqual([]);
  });
  it('penyaring hanya memuat benda yang dicatat pemicu', () => {
    expect(ACTIVITY_FILTERS.some((f) => f.id === 'product')).toBe(true);
    expect(ACTIVITY_FILTERS.some((f) => f.id === 'order')).toBe(false);
  });
});

describe('log aktivitas: data palsu', () => {
  it('menyaring menurut benda dan rentang waktu, terbaru dulu, dan membatasi jumlah', async () => {
    const d = createFakeData();
    const all = await d.listActivity();
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect([...all].map((r) => r.at)).toEqual([...all].map((r) => r.at).sort().reverse());
    const prod = await d.listActivity({ entity: 'product' });
    expect(prod.length).toBeGreaterThan(0);
    expect(prod.every((r) => r.entity === 'product')).toBe(true);
    const price = prod.find((r) => r.action === 'product.updated')!;
    expect(price.changes.find((c) => c.column === 'price')).toEqual({ column: 'price', from: 22000, to: 24000 });
    expect((await d.listActivity({ limit: 2 })).length).toBe(2);
    const recent = await d.listActivity({ from: new Date(Date.now() - 3600_000).toISOString() });
    expect(recent.length).toBeLessThan(all.length);
    expect(await d.listActivity({ entity: 'tidak-ada' })).toEqual([]);
  });
});
