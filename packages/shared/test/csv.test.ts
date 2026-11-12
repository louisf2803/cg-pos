import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  exportProductsToCsv,
  exportProductsToXlsx,
  generateProductTemplateCsv,
  generateProductTemplateXlsx,
  parseCsvText,
  parseProductCsv,
  parseProductSpreadsheet,
  parseProductXlsx,
} from '../src/csv';
import { buildXlsxBytes } from '../src/xlsx';
import type { CatalogProduct, Category } from '../src/types';

describe('parseCsvText', () => {
  it('mengurai baris dan kolom dasar', () => {
    const csv = 'SKU,Nama,Kategori\nKP-001,Kopi Tubruk,Kopi\nMK-001,Roti Bakar,Makanan';
    const rows = parseCsvText(csv);
    expect(rows).toEqual([
      ['SKU', 'Nama', 'Kategori'],
      ['KP-001', 'Kopi Tubruk', 'Kopi'],
      ['MK-001', 'Roti Bakar', 'Makanan'],
    ]);
  });

  it('menangani koma dan tanda kutip ganda di dalam sel (RFC 4180)', () => {
    const csv = 'SKU,Nama,Kategori\nKP-002,"Kopi, Susu, dan Gula","Kopi & ""Spesial"""';
    const rows = parseCsvText(csv);
    expect(rows[1]).toEqual(['KP-002', 'Kopi, Susu, dan Gula', 'Kopi & "Spesial"']);
  });

  it('menangani baris baru di dalam sel berkutip dan CRLF', () => {
    const csv = 'Nama,Catatan\r\n"Kopi\r\nEspresso","Enak\nSekali"\r\n';
    const rows = parseCsvText(csv);
    expect(rows).toEqual([
      ['Nama', 'Catatan'],
      ['Kopi\r\nEspresso', 'Enak\nSekali'],
    ]);
  });

  it('menghapus BOM UTF-8 pada awal berkas', () => {
    const csv = '\uFEFFSKU,Nama\nKP-1,Kopi';
    const rows = parseCsvText(csv);
    expect(rows[0]![0]).toBe('SKU');
  });
});

describe('parseProductCsv', () => {
  const categories: Category[] = [
    { id: 'cat-kopi', name: 'Kopi', sort: 1 },
    { id: 'cat-makan', name: 'Makanan', sort: 2 },
  ];

  const catalog: CatalogProduct[] = [
    {
      id: 'p-tubruk',
      name: 'Kopi Tubruk',
      categoryId: 'cat-kopi',
      kind: 'goods',
      trackStock: true,
      isActive: true,
      isFavorite: false,
      price: 15000,
      sku: 'KP-001',
      variants: [],
    },
    {
      id: 'p-es-teh',
      name: 'Es Teh Manis',
      categoryId: 'cat-kopi',
      kind: 'goods',
      trackStock: true,
      isActive: true,
      isFavorite: false,
      price: 8000,
      variants: [
        { id: 'v-s', label: 'S', price: 8000, sku: 'NK-005S', isActive: true },
        { id: 'v-m', label: 'M', price: 10000, sku: 'NK-005M', isActive: true },
      ],
    },
  ];

  it('menandai produk baru dan perbarui dengan benar', () => {
    const csv = [
      'SKU,Nama,Kategori,Harga jual,Aktif',
      'KP-001,Kopi Tubruk Special,Kopi,16000,ya',
      'NK-005S,Es Teh Ukuran S,Kopi,9000,ya',
      'MK-001,Nasi Goreng,Makanan,25000,ya',
    ].join('\n');

    const result = parseProductCsv(csv, categories, catalog);
    expect(result.headerError).toBeUndefined();
    expect(result.totalRows).toBe(3);
    expect(result.updateCount).toBe(2); // KP-001 dan NK-005S sudah ada
    expect(result.newCount).toBe(1); // MK-001 baru
    expect(result.errorCount).toBe(0);

    expect(result.rows[0]!.status).toBe('update');
    expect(result.rows[0]!.existingId).toBe('p-tubruk');
    expect(result.rows[0]!.price).toBe(16000);

    expect(result.rows[1]!.status).toBe('update');
    expect(result.rows[1]!.existingId).toBe('v-s');

    expect(result.rows[2]!.status).toBe('new');
    expect(result.rows[2]!.categoryId).toBe('cat-makan');
  });

  it('memvalidasi nama wajib diisi', () => {
    const csv = 'SKU,Nama,Kategori,Harga jual,Aktif\nKP-99,,Kopi,10000,ya';
    const result = parseProductCsv(csv, categories, catalog);
    expect(result.errorCount).toBe(1);
    expect(result.rows[0]!.status).toBe('error');
    expect(result.rows[0]!.errorReason).toContain('Nama');
  });

  it('memvalidasi harga harus berupa bilangan bulat >= 0', () => {
    const csv = [
      'SKU,Nama,Kategori,Harga jual,Aktif',
      'A1,Kopi 1,Kopi,-5000,ya',
      'A2,Kopi 2,Kopi,bukan_angka,ya',
      'A3,Kopi 3,Kopi,25.000,ya', // titik ribuan didukung
      'A4,Kopi 4,Kopi,Rp 12000,ya',
    ].join('\n');

    const result = parseProductCsv(csv, categories, catalog);
    expect(result.rows[0]!.status).toBe('error');
    expect(result.rows[1]!.status).toBe('error');
    expect(result.rows[2]!.status).toBe('new');
    expect(result.rows[2]!.price).toBe(25000);
    expect(result.rows[3]!.status).toBe('new');
    expect(result.rows[3]!.price).toBe(12000);
  });

  it('memvalidasi SKU unik di dalam berkas', () => {
    const csv = [
      'SKU,Nama,Kategori,Harga jual,Aktif',
      'KP-DUP,Kopi Satu,Kopi,10000,ya',
      'KP-DUP,Kopi Dua,Kopi,12000,ya',
    ].join('\n');

    const result = parseProductCsv(csv, categories, catalog);
    expect(result.rows[0]!.status).toBe('new');
    expect(result.rows[1]!.status).toBe('error');
    expect(result.rows[1]!.errorReason).toContain('SKU duplikat');
  });

  it('memvalidasi kategori yang belum ada ditandai salah', () => {
    const csv = 'SKU,Nama,Kategori,Harga jual,Aktif\nKP-10,Kopi,Snack Asing,10000,ya';
    const result = parseProductCsv(csv, categories, catalog);
    expect(result.rows[0]!.status).toBe('error');
    expect(result.rows[0]!.errorReason).toContain('Kategori “Snack Asing” tidak ditemukan');
  });

  it('menangani status aktif dan nonaktif', () => {
    const csv = [
      'SKU,Nama,Kategori,Harga jual,Aktif',
      'A1,Kopi A,Kopi,10000,tidak',
      'A2,Kopi B,Kopi,10000,nonaktif',
      'A3,Kopi C,Kopi,10000,ya',
    ].join('\n');

    const result = parseProductCsv(csv, categories, catalog);
    expect(result.rows[0]!.isActive).toBe(false);
    expect(result.rows[1]!.isActive).toBe(false);
    expect(result.rows[2]!.isActive).toBe(true);
  });

  it('menolak format header yang salah', () => {
    const csv = 'Kode,Barang,Jenis\n1,2,3';
    const result = parseProductCsv(csv, categories, catalog);
    expect(result.headerError).toBeDefined();
    expect(result.rows.length).toBe(0);
  });

  it('membatasi jumlah baris maksimal 2000 baris', () => {
    const lines = ['SKU,Nama,Kategori,Harga jual,Aktif'];
    for (let i = 0; i < 2050; i++) {
      lines.push(`SKU-${i},Produk ${i},Kopi,10000,ya`);
    }
    const result = parseProductCsv(lines.join('\n'), categories, catalog);
    expect(result.totalRows).toBe(2050);
    expect(result.truncated).toBe(true);
    expect(result.rows.length).toBe(2000);
  });
});

describe('exportProductsToCsv & generateProductTemplateCsv', () => {
  const categories: Category[] = [
    { id: 'cat-kopi', name: 'Kopi, Teh & Minuman', sort: 1 },
  ];

  const catalog: CatalogProduct[] = [
    {
      id: 'p1',
      name: 'Kopi "Tubruk"',
      categoryId: 'cat-kopi',
      kind: 'goods',
      trackStock: true,
      isActive: true,
      isFavorite: false,
      price: 15000,
      sku: 'KP-001',
      variants: [],
    },
    {
      id: 'p2',
      name: 'Es Cincau',
      categoryId: 'cat-kopi',
      kind: 'goods',
      trackStock: true,
      isActive: true,
      isFavorite: false,
      price: 10000,
      variants: [
        { id: 'v1', label: 'Sedang', price: 10000, sku: 'EC-M', isActive: true },
        { id: 'v2', label: 'Besar', price: 12000, sku: 'EC-L', isActive: false },
      ],
    },
  ];

  it('mengekspor CSV dengan BOM, format kolom sesuai, dan sel berkutip', () => {
    const csv = exportProductsToCsv(catalog, categories);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('SKU,Nama,Kategori,Harga jual,Aktif');
    // Kutip ganda pada nama dan koma pada kategori
    expect(csv).toContain('KP-001,"Kopi ""Tubruk""","Kopi, Teh & Minuman",15000,ya');
    // Varian diekspor per baris
    expect(csv).toContain('EC-M,Es Cincau (Sedang),"Kopi, Teh & Minuman",10000,ya');
    expect(csv).toContain('EC-L,Es Cincau (Besar),"Kopi, Teh & Minuman",12000,tidak');
  });

  it('menghasilkan contoh berkas CSV yang valid', () => {
    const template = generateProductTemplateCsv();
    expect(template.startsWith('\uFEFF')).toBe(true);
    expect(template).toContain('SKU,Nama,Kategori,Harga jual,Aktif');
    const parsed = parseCsvText(template);
    expect(parsed.length).toBeGreaterThan(1);
  });
});

describe('Produk Excel (.xlsx) impor & ekspor', () => {
  const categories: Category[] = [
    { id: 'cat-kopi', name: 'Kopi, Teh & Minuman', sort: 1 },
    { id: 'cat-makan', name: 'Makanan', sort: 2 },
  ];

  const catalog: CatalogProduct[] = [
    {
      id: 'p1',
      name: 'Kopi "Tubruk"',
      categoryId: 'cat-kopi',
      kind: 'goods',
      trackStock: true,
      isActive: true,
      isFavorite: false,
      price: 15000,
      sku: 'KP-001',
      variants: [],
    },
    {
      id: 'p2',
      name: 'Es Cincau',
      categoryId: 'cat-kopi',
      kind: 'goods',
      trackStock: true,
      isActive: true,
      isFavorite: false,
      price: 10000,
      variants: [
        { id: 'v1', label: 'Sedang', price: 10000, sku: 'EC-M', isActive: true },
        { id: 'v2', label: 'Besar', price: 12000, sku: 'EC-L', isActive: false },
      ],
    },
  ];

  it('mengekspor katalog ke .xlsx dan membacanya kembali lewat parseProductSpreadsheet', () => {
    const xlsxBytes = exportProductsToXlsx(catalog, categories);
    expect(xlsxBytes[0]).toBe(0x50);
    expect(xlsxBytes[1]).toBe(0x4b);

    const res = parseProductSpreadsheet('katalog-produk.xlsx', xlsxBytes, categories, catalog);
    expect(res.headerError).toBeUndefined();
    expect(res.totalRows).toBe(3);
    expect(res.updateCount).toBe(3);
    expect(res.errorCount).toBe(0);
    expect(res.rows[0]!.name).toBe('Kopi "Tubruk"');
    expect(res.rows[0]!.price).toBe(15000);
    expect(res.rows[0]!.existingId).toBe('p1');
    expect(res.rows[1]!.existingId).toBe('v1');
    expect(res.rows[1]!.isActive).toBe(true);
    expect(res.rows[2]!.existingId).toBe('v2');
    expect(res.rows[2]!.isActive).toBe(false);
  });

  it('mengimpor .xlsx campuran baru, perbarui, dan salah termasuk sel boolean Excel', () => {
    const bytes = buildXlsxBytes([
      {
        name: 'Impor',
        rows: [
          ['SKU', 'Nama', 'Kategori', 'Harga jual', 'Aktif'],
          ['KP-001', 'Kopi Tubruk Baru', 'Kopi, Teh & Minuman', 17500, true],
          ['MK-009', 'Nasi Goreng Kampung', 'Makanan', 24000, false],
          ['ERR-1', 'Salah Kategori', 'Tidak Ada', 10000, 'ya'],
        ],
      },
    ]);

    const res = parseProductXlsx(bytes, categories, catalog);
    expect(res.headerError).toBeUndefined();
    expect(res.totalRows).toBe(3);
    expect(res.updateCount).toBe(1);
    expect(res.newCount).toBe(1);
    expect(res.errorCount).toBe(1);
    expect(res.rows[0]!.isActive).toBe(true);
    expect(res.rows[0]!.price).toBe(17500);
    expect(res.rows[1]!.isActive).toBe(false);
    expect(res.rows[2]!.errorReason).toContain('Tidak Ada');
  });

  it('menghasilkan contoh berkas .xlsx yang valid', () => {
    const tplBytes = generateProductTemplateXlsx();
    expect(tplBytes[0]).toBe(0x50);
    expect(tplBytes[1]).toBe(0x4b);
    const tplCats: Category[] = [
      { id: 'c1', name: 'Kopi', sort: 1 },
      { id: 'c2', name: 'Non Kopi', sort: 2 },
      { id: 'c3', name: 'Makanan', sort: 3 },
    ];
    const parsed = parseProductXlsx(tplBytes, tplCats, []);
    expect(parsed.headerError).toBeUndefined();
    expect(parsed.newCount).toBe(3);
    expect(parsed.errorCount).toBe(0);
  });

  it('mendeteksi CSV via parseProductSpreadsheet dan menolak .xls / biner rusak', () => {
    const csvRes = parseProductSpreadsheet(
      'produk.csv',
      strToU8('SKU,Nama,Kategori,Harga jual,Aktif\nMK-2,Bakmi,Makanan,22000,ya'),
      categories,
      catalog
    );
    expect(csvRes.headerError).toBeUndefined();
    expect(csvRes.newCount).toBe(1);

    const xlsHeader = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x00]);
    const xlsRes = parseProductSpreadsheet('lama.xls', xlsHeader, categories, catalog);
    expect(xlsRes.headerError).toContain('.xls');

    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff]);
    const badRes = parseProductSpreadsheet('rusak.dat', garbage, categories, catalog);
    expect(badRes.headerError).toBeDefined();
  });
});
