import { describe, expect, it } from 'vitest';
import {
  buildStockTemplateCsv,
  buildStockTemplateXlsx,
  parseStockImportSpreadsheet,
} from '../src/stock-import';
import type { StockItem } from '../src/stock';
import { strToU8 } from 'fflate';

describe('A125: Stock Import & Multi-Location Helpers', () => {
  const dummyItems: StockItem[] = [
    {
      productId: 'ing-kopi',
      name: 'Biji Kopi Arabika',
      kind: 'ingredient',
      unit: 'gram',
      qty: 5000,
      avgCost: 320,
      value: 1600000,
      status: 'ok',
    },
    {
      productId: 'p-air',
      name: 'Air Mineral Botol',
      kind: 'goods',
      unit: 'botol',
      qty: 24,
      avgCost: 3000,
      value: 72000,
      status: 'ok',
    },
  ];

  it('menghasilkan templat CSV untuk impor stok', () => {
    const csv = buildStockTemplateCsv(dummyItems);
    expect(csv).toContain('ID Produk/Bahan');
    expect(csv).toContain('Biji Kopi Arabika');
    expect(csv).toContain('Air Mineral Botol');
  });

  it('menghasilkan templat Excel (.xlsx) valid untuk impor stok', () => {
    const bytes = buildStockTemplateXlsx(dummyItems);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);
  });

  it('membaca berkas spreadsheet CSV stok awal dengan tepat', () => {
    const csvContent = [
      'ID Produk/Bahan,Nama Barang/Bahan,Jenis,Satuan,Stok Saat Ini,Biaya Rata-rata,Stok Awal Baru,Harga Beli Satuan,Catatan / Alasan',
      'ing-kopi,Biji Kopi Arabika,Bahan baku,gram,5000,320,10000,350,Pengisian stok gudang',
      'p-air,Air Mineral Botol,Barang,botol,24,3000,50,,Restok harian',
    ].join('\n');

    const bytes = strToU8(csvContent);
    const result = parseStockImportSpreadsheet('stok.csv', bytes, dummyItems);

    expect(result.errors).toEqual([]);
    expect(result.items.length).toBe(2);

    expect(result.items[0]).toEqual({
      productId: 'ing-kopi',
      productName: 'Biji Kopi Arabika',
      unit: 'gram',
      currentQty: 5000,
      newQty: 10000,
      unitCost: 350,
      reason: 'Pengisian stok gudang',
    });

    expect(result.items[1]).toEqual({
      productId: 'p-air',
      productName: 'Air Mineral Botol',
      unit: 'botol',
      currentQty: 24,
      newQty: 50,
      unitCost: undefined,
      reason: 'Restok harian',
    });
  });

  it('menolak baris dengan nama/ID yang tidak dikenal atau jumlah tidak valid', () => {
    const csvContent = [
      'ID Produk/Bahan,Nama Barang/Bahan,Stok Awal Baru',
      'item-ngawur,Barang Gaib,50',
      'ing-kopi,Biji Kopi Arabika,-10',
    ].join('\n');

    const bytes = strToU8(csvContent);
    const result = parseStockImportSpreadsheet('stok-error.csv', bytes, dummyItems);

    expect(result.items.length).toBe(0);
    expect(result.errors.length).toBe(2);
    expect(result.errors[0]?.message).toContain('tidak ditemukan');
    expect(result.errors[1]?.message).toContain('harus berupa angka positif');
  });
});
