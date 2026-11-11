import { describe, expect, it } from 'vitest';
import {
  buildOpnameCsvTemplate,
  buildOpnameResultCsv,
  detectCsvDelimiter,
  parseDelimitedCsv,
  parseOpnameCsv,
  type StockItem,
  type StockOpname,
} from '../src';

const STOCK: StockItem[] = [
  {
    productId: 'p-kopi',
    name: 'Kopi Susu Gula Aren',
    kind: 'goods',
    unit: 'gelas',
    qty: 20,
    avgCost: 7000,
    value: 140_000,
    status: 'normal',
    categoryId: 'c1',
    categoryName: 'Minuman',
  },
  {
    productId: 'p-susu',
    name: 'Susu UHT Full Cream',
    kind: 'ingredient',
    unit: 'liter',
    qty: 12.5,
    avgCost: 18_000,
    value: 225_000,
    status: 'low',
    categoryId: 'c2',
    categoryName: 'Bahan',
  },
];

describe('opname-csv', () => {
  it('mendeteksi pemisah koma dan titik koma serta membuang BOM', () => {
    expect(detectCsvDelimiter('\uFEFFID Produk;Nama Item;Hitung Fisik\r\np-kopi;Kopi;18')).toBe(';');
    expect(detectCsvDelimiter('Nama Item,Hitung Fisik\nKopi Susu Gula Aren,18')).toBe(',');
    const rows = parseDelimitedCsv('\uFEFF"ID Produk";"Nama Item";"Hitung Fisik"\r\n"p-kopi";"Kopi ""A""";18');
    expect(rows).toEqual([
      ['ID Produk', 'Nama Item', 'Hitung Fisik'],
      ['p-kopi', 'Kopi "A"', '18'],
    ]);
  });

  it('membuat templat CSV ber-BOM yang dapat diimpor ulang secara round-trip', () => {
    const csv = buildOpnameCsvTemplate(STOCK, new Map([['p-kopi', 18]]));
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const parsed = parseOpnameCsv(csv, STOCK);
    expect(parsed.headerError).toBeUndefined();
    expect(parsed.validCount).toBe(1);
    expect(parsed.blankCount).toBe(1);
    expect(parsed.errorCount).toBe(0);
    expect(parsed.rows.find((r) => r.productId === 'p-kopi')?.difference).toBe(-2);
    expect(parsed.rows.find((r) => r.productId === 'p-susu')?.status).toBe('blank');
  });

  it('mendukung desimal koma Indonesia, pencocokan nama tanpa ID, dan menolak data rusak', () => {
    const csv = [
      'Nama Item;Hitung Fisik',
      'kopi susu gula aren;19',
      'Susu UHT Full Cream;"10,25"',
      'Susu UHT Full Cream;11',
      'Barang Gaib;5',
    ].join('\n');
    const res = parseOpnameCsv(csv, STOCK);
    expect(res.validCount).toBe(2);
    expect(res.errorCount).toBe(2);
    expect(res.rows[0]).toMatchObject({ productId: 'p-kopi', countedQty: 19, difference: -1, status: 'valid' });
    expect(res.rows[1]).toMatchObject({ productId: 'p-susu', countedQty: 10.25, difference: -2.25, status: 'valid' });
    expect(res.rows[2]).toMatchObject({ status: 'error' });
    expect(res.rows[3]).toMatchObject({ status: 'error' });
  });

  it('menolak nilai negatif dan lebih dari 4 angka di belakang koma serta header kurang', () => {
    const badHeader = parseOpnameCsv('Nama Item;Stok\nKopi;10', STOCK);
    expect(badHeader.headerError).toBeTruthy();

    const badValues = parseOpnameCsv('ID Produk,Hitung Fisik\np-kopi,-1\np-susu,1.12345', STOCK);
    expect(badValues.validCount).toBe(0);
    expect(badValues.errorCount).toBe(2);
  });

  it('mengekspor hasil opname selesai ke CSV ber-BOM', () => {
    const opname: StockOpname = {
      id: 'op-1',
      number: 'OPN-001',
      status: 'final',
      countedAt: '2026-11-11T04:00:00.000Z',
      finalizedAt: '2026-11-11T04:10:00.000Z',
      lines: [
        { productId: 'p-kopi', name: 'Kopi Susu Gula Aren', unit: 'gelas', systemQty: 20, countedQty: 18, difference: -2, value: -14_000 },
      ],
    };
    const csv = buildOpnameResultCsv(opname);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('ID Produk;Nama Item;Satuan;Stok Sistem;Hitung Fisik;Selisih;Nilai Selisih');
    expect(csv).toContain('p-kopi;Kopi Susu Gula Aren;gelas;20;18;-2;-14000');
  });
});

