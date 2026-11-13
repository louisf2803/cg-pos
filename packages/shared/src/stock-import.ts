import { buildXlsxBytes, readSpreadsheetRows, type SpreadsheetCell } from './xlsx';
import { parseDelimitedCsv } from './opname-csv';
import type { StockItem } from './stock';

export interface StockImportRow {
  productId: string;
  productName: string;
  unit: string;
  currentQty: number;
  newQty: number;
  unitCost?: number;
  reason?: string;
}

export interface ParseStockImportResult {
  items: StockImportRow[];
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
  totalRows: number;
  validRows: number;
}

/**
 * Menghasilkan templat Excel (.xlsx) untuk impor stok awal / penyesuaian stok.
 */
export function buildStockTemplateXlsx(items: readonly StockItem[]): Uint8Array {
  const headers = [
    'ID Produk/Bahan',
    'Nama Barang/Bahan',
    'Jenis',
    'Satuan',
    'Stok Saat Ini',
    'Biaya Rata-rata',
    'Stok Awal Baru',
    'Harga Beli Satuan',
    'Catatan / Alasan',
  ];

  const rows: SpreadsheetCell[][] = [
    headers,
    ...items.map((i) => [
      i.productId,
      i.name,
      i.kind === 'ingredient' ? 'Bahan baku' : 'Barang',
      i.unit,
      i.qty,
      i.avgCost,
      '', // Kosong untuk diisi user
      '', // Kosong untuk diisi harga beli jika stok masuk
      'Stok awal impor Excel',
    ]),
  ];

  return buildXlsxBytes([{ name: 'Stok', rows }]);
}

/**
 * Menghasilkan templat CSV untuk impor stok awal / penyesuaian stok.
 */
export function buildStockTemplateCsv(items: readonly StockItem[]): string {
  const headers = [
    'ID Produk/Bahan',
    'Nama Barang/Bahan',
    'Jenis',
    'Satuan',
    'Stok Saat Ini',
    'Biaya Rata-rata',
    'Stok Awal Baru',
    'Harga Beli Satuan',
    'Catatan / Alasan',
  ];

  const escapeCell = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.map(escapeCell).join(','),
    ...items.map((i) =>
      [
        i.productId,
        i.name,
        i.kind === 'ingredient' ? 'Bahan baku' : 'Barang',
        i.unit,
        i.qty,
        i.avgCost,
        '',
        '',
        'Stok awal impor Excel',
      ]
        .map(escapeCell)
        .join(','),
    ),
  ];

  return lines.join('\n');
}

/**
 * Membaca dan memvalidasi berkas spreadsheet (.xlsx atau .csv) untuk impor stok awal.
 */
export function parseStockImportSpreadsheet(
  fileName: string,
  bytes: Uint8Array,
  stockItems: readonly StockItem[],
): ParseStockImportResult {
  const errors: { row: number; message: string }[] = [];
  const warnings: { row: number; message: string }[] = [];
  const items: StockImportRow[] = [];

  let rawRows: string[][];
  try {
    const parsed = readSpreadsheetRows(fileName, bytes, parseDelimitedCsv, 0);
    rawRows = parsed.rows;
  } catch (err) {
    return {
      items: [],
      errors: [{ row: 0, message: err instanceof Error ? err.message : 'Berkas tidak dapat dibaca.' }],
      warnings: [],
      totalRows: 0,
      validRows: 0,
    };
  }

  if (rawRows.length < 2) {
    return {
      items: [],
      errors: [{ row: 0, message: 'Berkas kosong atau hanya berisi judul kolom.' }],
      warnings: [],
      totalRows: 0,
      validRows: 0,
    };
  }

  // Petakan header kolom
  const headers = rawRows[0]!.map((h) => h.trim().toLowerCase());
  const idCol = headers.findIndex((h) => h.includes('id') || h.includes('kode') || h.includes('sku'));
  const nameCol = headers.findIndex((h) => h.includes('nama') || h.includes('item') || h.includes('barang'));

  // Prioritaskan kolom stok baru / stok awal, jangan keliru dengan stok saat ini / sistem
  let qtyCol = headers.findIndex((h) => h.includes('stok baru') || h.includes('stok awal') || h.includes('hitung fisik') || h.includes('stok fisik'));
  if (qtyCol === -1) {
    qtyCol = headers.findIndex((h) => h === 'qty' || h === 'jumlah' || h === 'stok');
  }
  if (qtyCol === -1) {
    qtyCol = headers.findIndex((h) => (h.includes('qty') || h.includes('jumlah') || h.includes('stok')) && !h.includes('saat ini') && !h.includes('sistem'));
  }

  // Prioritaskan harga beli satuan baru, jangan keliru dengan biaya rata-rata
  let costCol = headers.findIndex((h) => h.includes('harga beli') || h.includes('biaya baru') || h.includes('unit cost'));
  if (costCol === -1) {
    costCol = headers.findIndex((h) => (h.includes('harga') || h.includes('biaya') || h.includes('cost')) && !h.includes('rata') && !h.includes('saat ini'));
  }

  const reasonCol = headers.findIndex((h) => h.includes('catatan') || h.includes('alasan') || h.includes('keterangan') || h.includes('note'));

  if (qtyCol === -1) {
    return {
      items: [],
      errors: [{ row: 1, message: 'Kolom jumlah stok (Stok Awal Baru / Qty) tidak ditemukan.' }],
      warnings: [],
      totalRows: rawRows.length - 1,
      validRows: 0,
    };
  }

  const itemsById = new Map<string, StockItem>();
  const itemsByName = new Map<string, StockItem>();
  for (const item of stockItems) {
    itemsById.set(item.productId.toLowerCase(), item);
    itemsByName.set(item.name.toLowerCase().trim(), item);
  }

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r]!;
    if (!row || row.every((c) => !c || c.trim() === '')) {
      continue; // Lewati baris kosong
    }

    const idVal = idCol !== -1 ? (row[idCol] ?? '').trim() : '';
    const nameVal = nameCol !== -1 ? (row[nameCol] ?? '').trim() : '';
    const qtyVal = (row[qtyCol] ?? '').trim().replace(',', '.');
    const costVal = costCol !== -1 ? (row[costCol] ?? '').trim().replace(/\D/g, '') : '';
    const reasonVal = reasonCol !== -1 ? (row[reasonCol] ?? '').trim() : undefined;

    let matched = idVal ? itemsById.get(idVal.toLowerCase()) : undefined;
    if (!matched && nameVal) {
      matched = itemsByName.get(nameVal.toLowerCase());
    }

    if (!matched) {
      errors.push({
        row: r + 1,
        message: `Barang atau bahan baku tidak ditemukan: "${idVal || nameVal}".`,
      });
      continue;
    }

    if (!qtyVal) {
      // Baris ini tidak mengisi stok baru, lewati tanpa error jika kolom kosong
      continue;
    }

    const parsedQty = Number(qtyVal);
    if (!Number.isFinite(parsedQty) || parsedQty < 0) {
      errors.push({
        row: r + 1,
        message: `Jumlah stok pada baris "${matched.name}" harus berupa angka positif (diisi: "${qtyVal}").`,
      });
      continue;
    }

    let parsedCost: number | undefined;
    if (costVal) {
      const c = Number(costVal);
      if (Number.isFinite(c) && c >= 0) {
        parsedCost = c;
      }
    }

    items.push({
      productId: matched.productId,
      productName: matched.name,
      unit: matched.unit,
      currentQty: matched.qty,
      newQty: parsedQty,
      unitCost: parsedCost,
      reason: reasonVal || 'Impor stok dari spreadsheet',
    });
  }

  return {
    items,
    errors,
    warnings,
    totalRows: rawRows.length - 1,
    validRows: items.length,
  };
}
