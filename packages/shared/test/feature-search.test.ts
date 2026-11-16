import { describe, expect, it } from 'vitest';
import { normalizeSearch, searchFeatures, type FeatureEntry } from '../src';

const E = (href: string, label: string, group: string, module = 'Penjualan', section?: string): FeatureEntry => ({ href, label, group, module, ...(section ? { section } : {}) });
const entries = [
  E('/laporan/penjualan', 'Laporan penjualan', 'Laporan'),
  E('/inventori/stok', 'Daftar stok', 'Inventori', 'Penjualan'),
  E('/inventori/opname', 'Stok opname', 'Inventori'),
  E('/keuangan/kas', 'Kas dan bank', 'Kas', 'Keuangan'),
  E('/pelanggan/harga-spesial', 'Harga spesial grup', 'Pelanggan'),
  E('/laporan/penjualan', 'Laporan penjualan (salinan)', 'Lain'),
];

describe('pencarian fitur', () => {
  it('menormalkan aksen, huruf besar, dan tanda baca', () => {
    expect(normalizeSearch('  Pénjualan,  HARGA-spesial ')).toBe('penjualan harga spesial');
  });
  it('kata kunci kosong tidak mengembalikan apa pun', () => {
    expect(searchFeatures(entries, '   ')).toEqual([]);
  });
  it('mencari lewat nama menu, awalan label lebih tinggi, alamat tidak ganda', () => {
    const r = searchFeatures(entries, 'stok');
    expect(r.map((x) => x.href)).toEqual(['/inventori/opname', '/inventori/stok']);
    expect(searchFeatures(entries, 'penjualan').filter((x) => x.href === '/laporan/penjualan')).toHaveLength(1);
  });
  it('semua kata harus ketemu, boleh lintas nama menu, grup, dan modul', () => {
    expect(searchFeatures(entries, 'kas keuangan').map((x) => x.href)).toEqual(['/keuangan/kas']);
    expect(searchFeatures(entries, 'harga grup').map((x) => x.href)).toEqual(['/pelanggan/harga-spesial']);
    expect(searchFeatures(entries, 'zzz')).toEqual([]);
  });
  it('awalan kata juga cocok dan hasil dibatasi', () => {
    expect(searchFeatures(entries, 'opn').map((x) => x.href)).toEqual(['/inventori/opname']);
    expect(searchFeatures(entries, 'a', 2)).toHaveLength(2);
  });
});
