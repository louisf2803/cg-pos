import type { CatalogProduct, Category } from './types';
import { buildXlsxBytes, parseXlsxRows, readSpreadsheetRows, type SpreadsheetCell } from './xlsx';

export interface ProductCsvRow {
  lineNumber: number;
  sku: string;
  name: string;
  category: string;
  price: number;
  isActive: boolean;
  status: 'new' | 'update' | 'error';
  errorReason?: string;
  existingId?: string;
  categoryId?: string;
}

export interface ParseProductCsvResult {
  rows: ProductCsvRow[];
  totalRows: number;
  newCount: number;
  updateCount: number;
  errorCount: number;
  truncated: boolean;
  headerError?: string;
}

/**
 * Pengurai CSV standar (RFC 4180) sisi klien tanpa pustaka luar.
 * Menangani sel berkoma, tanda kutip ganda bersarang, baris baru (\r\n / \n),
 * dan karakter BOM UTF-8 (\uFEFF).
 */
export function parseCsvText(text: string): string[][] {
  const clean = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  let i = 0;

  while (i < clean.length) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < clean.length && clean[i + 1] === '"') {
          currentCell += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentCell);
        currentCell = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < clean.length && clean[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
        continue;
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  // Buang baris kosong terakhir bila ada
  while (rows.length > 0) {
    const last = rows[rows.length - 1]!;
    if (last.length === 1 && last[0]!.trim() === '') {
      rows.pop();
    } else {
      break;
    }
  }

  return rows;
}

const PRODUCT_HEADER_CELLS: readonly string[] = ['SKU', 'Nama', 'Kategori', 'Harga jual', 'Aktif'];

const PRODUCT_SAMPLE_ROWS: readonly (readonly [string, string, string, number, string])[] = [
  ['KP-001', 'Kopi Tubruk', 'Kopi', 15000, 'ya'],
  ['NK-001', 'Es Teh Manis', 'Non Kopi', 8000, 'ya'],
  ['MK-001', 'Roti Bakar Cokelat', 'Makanan', 18000, 'ya'],
];

const emptyProductResult = (headerError?: string): ParseProductCsvResult => ({
  rows: [],
  totalRows: 0,
  newCount: 0,
  updateCount: 0,
  errorCount: 0,
  truncated: false,
  ...(headerError ? { headerError } : {}),
});

/**
 * Validasi dan pemetaan baris tabel produk ke bentuk yang siap diterapkan ke katalog.
 * - Kolom wajib di header: SKU, Nama, Kategori, Harga jual, Aktif.
 * - Validasi: nama wajib diisi, harga bilangan bulat >= 0, SKU unik di berkas, kategori harus terdaftar.
 * - Batas maksimal: 2000 baris.
 */
export function parseProductRows(
  rawRows: readonly (readonly string[])[],
  categories: Category[],
  catalog: CatalogProduct[] = [],
  emptyMessage = 'Berkas kosong.'
): ParseProductCsvResult {
  if (rawRows.length === 0) {
    return emptyProductResult(emptyMessage);
  }

  const headerRow = rawRows[0]!;
  const colMap: { sku?: number; name?: number; category?: number; price?: number; active?: number } = {};

  headerRow.forEach((col, idx) => {
    const normalized = col.trim().toLowerCase().replace(/[\s_()\-]/g, '');
    if (normalized === 'sku') {
      colMap.sku = idx;
    } else if (normalized === 'nama' || normalized === 'namaproduk' || normalized === 'name') {
      colMap.name = idx;
    } else if (normalized === 'kategori' || normalized === 'category') {
      colMap.category = idx;
    } else if (normalized.startsWith('hargajual') || normalized === 'harga' || normalized === 'price') {
      colMap.price = idx;
    } else if (normalized.startsWith('aktif') || normalized === 'active' || normalized === 'status') {
      colMap.active = idx;
    }
  });

  if (colMap.name === undefined || colMap.category === undefined || colMap.price === undefined) {
    return {
      rows: [],
      totalRows: 0,
      newCount: 0,
      updateCount: 0,
      errorCount: 0,
      truncated: false,
      headerError: 'Format header tidak sesuai. Kolom wajib: SKU, Nama, Kategori, Harga jual, Aktif.',
    };
  }

  let dataRows = rawRows.slice(1);
  // Saring baris yang seluruh kolomnya kosong
  dataRows = dataRows.filter((r) => r.some((cell) => cell.trim().length > 0));

  const totalRows = dataRows.length;
  const truncated = totalRows > 2000;
  if (truncated) {
    dataRows = dataRows.slice(0, 2000);
  }

  const seenSkus = new Map<string, number>();
  const rows: ProductCsvRow[] = [];
  let newCount = 0;
  let updateCount = 0;
  let errorCount = 0;

  dataRows.forEach((r, idx) => {
    const lineNum = idx + 2;
    const sku = (colMap.sku !== undefined ? r[colMap.sku] ?? '' : '').trim();
    const name = (colMap.name !== undefined ? r[colMap.name] ?? '' : '').trim();
    const categoryName = (colMap.category !== undefined ? r[colMap.category] ?? '' : '').trim();
    const priceRaw = (colMap.price !== undefined ? r[colMap.price] ?? '' : '').trim();
    const activeRaw = (colMap.active !== undefined ? r[colMap.active] ?? '' : '').trim();

    let status: 'new' | 'update' | 'error' = 'new';
    let errorReason: string | undefined;
    let existingId: string | undefined;
    let categoryId: string | undefined;

    // 1. Nama produk wajib diisi
    if (!name) {
      status = 'error';
      errorReason = 'Nama produk wajib diisi';
    }

    // 2. Harga jual bilangan bulat >= 0
    let parsedPrice = 0;
    if (!errorReason) {
      const cleanPrice = priceRaw.replace(/^Rp\.?\s*/i, '').replace(/\s+/g, '');
      let numericString = cleanPrice;
      if (/^\d{1,3}(\.\d{3})+$/.test(cleanPrice)) {
        numericString = cleanPrice.replace(/\./g, '');
      }
      if (!/^\d+$/.test(numericString)) {
        status = 'error';
        errorReason = 'Harga harus berupa bilangan bulat >= 0';
      } else {
        parsedPrice = parseInt(numericString, 10);
        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
          status = 'error';
          errorReason = 'Harga harus berupa bilangan bulat >= 0';
        }
      }
    }

    // 3. SKU unik di dalam berkas
    if (!errorReason && sku) {
      const lowerSku = sku.toLowerCase();
      if (seenSkus.has(lowerSku)) {
        status = 'error';
        errorReason = `SKU duplikat di dalam berkas (baris ${seenSkus.get(lowerSku)})`;
      } else {
        seenSkus.set(lowerSku, lineNum);
      }
    }

    // 4. Kategori wajib ada di daftar kategori outlet (tidak dibuat otomatis)
    if (!errorReason) {
      if (!categoryName) {
        status = 'error';
        errorReason = 'Kategori tidak ditemukan';
      } else {
        const matched = categories.find((c) => c.name.trim().toLowerCase() === categoryName.toLowerCase());
        if (!matched) {
          status = 'error';
          errorReason = `Kategori “${categoryName}” tidak ditemukan`;
        } else {
          categoryId = matched.id;
        }
      }
    }

    // 5. Status aktif
    let isActive = true;
    if (activeRaw) {
      const lowerActive = activeRaw.toLowerCase();
      if (['tidak', 'no', 'false', '0', 'nonaktif'].includes(lowerActive)) {
        isActive = false;
      }
    }

    // 6. Tentukan Baru vs Perbarui
    if (status !== 'error') {
      if (sku) {
        const cleanSku = sku.toLowerCase();
        const existing = catalog.find(
          (p) =>
            (p.sku && p.sku.trim().toLowerCase() === cleanSku) ||
            p.variants.some((v) => v.sku && v.sku.trim().toLowerCase() === cleanSku)
        );
        if (existing) {
          status = 'update';
          const matchedVariant = existing.variants.find((v) => v.sku && v.sku.trim().toLowerCase() === cleanSku);
          existingId = matchedVariant ? matchedVariant.id : existing.id;
          updateCount++;
        } else {
          status = 'new';
          newCount++;
        }
      } else {
        status = 'new';
        newCount++;
      }
    } else {
      errorCount++;
    }

    rows.push({
      lineNumber: lineNum,
      sku,
      name,
      category: categoryName,
      price: parsedPrice,
      isActive,
      status,
      errorReason,
      existingId,
      categoryId,
    });
  });

  return {
    rows,
    totalRows,
    newCount,
    updateCount,
    errorCount,
    truncated,
  };
}

/**
 * Validasi dan pemetaan berkas CSV produk ke bentuk yang siap diterapkan ke katalog.
 */
export function parseProductCsv(
  csvText: string,
  categories: Category[],
  catalog: CatalogProduct[] = []
): ParseProductCsvResult {
  return parseProductRows(parseCsvText(csvText), categories, catalog, 'Berkas CSV kosong.');
}

/**
 * Validasi dan pemetaan berkas Excel (.xlsx) produk ke bentuk yang siap diterapkan ke katalog.
 */
export function parseProductXlsx(
  bytes: Uint8Array,
  categories: Category[],
  catalog: CatalogProduct[] = []
): ParseProductCsvResult {
  try {
    return parseProductRows(parseXlsxRows(bytes, 0), categories, catalog, 'Berkas Excel (.xlsx) kosong.');
  } catch (err) {
    return emptyProductResult(err instanceof Error ? err.message : 'Berkas Excel (.xlsx) tidak dapat dibaca.');
  }
}

/**
 * Membaca dan memvalidasi berkas impor produk (.xlsx maupun CSV UTF-8) secara otomatis.
 */
export function parseProductSpreadsheet(
  fileName: string,
  bytes: Uint8Array,
  categories: Category[],
  catalog: CatalogProduct[] = []
): ParseProductCsvResult {
  try {
    const { format, rows } = readSpreadsheetRows(fileName, bytes, parseCsvText, 0);
    return parseProductRows(
      rows,
      categories,
      catalog,
      format === 'xlsx' ? 'Berkas Excel (.xlsx) kosong.' : 'Berkas CSV kosong.'
    );
  } catch (err) {
    return emptyProductResult(err instanceof Error ? err.message : 'Berkas spreadsheet tidak dapat dibaca.');
  }
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function productCatalogRows(
  products: CatalogProduct[],
  categories: Category[]
): (readonly SpreadsheetCell[])[] {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const rows: (readonly SpreadsheetCell[])[] = [];

  for (const p of products) {
    const catName = p.categoryId ? (catMap.get(p.categoryId) ?? '') : '';
    if (p.variants.length === 0) {
      rows.push([p.sku ?? '', p.name, catName, p.price, p.isActive ? 'ya' : 'tidak']);
    } else {
      for (const v of p.variants) {
        rows.push([
          v.sku ?? '',
          `${p.name} (${v.label})`,
          catName,
          v.price,
          p.isActive && v.isActive ? 'ya' : 'tidak',
        ]);
      }
    }
  }

  return rows;
}

/**
 * Ekspor daftar katalog menjadi string CSV UTF-8 dengan BOM.
 * Format kolom: SKU,Nama,Kategori,Harga jual,Aktif
 */
export function exportProductsToCsv(products: CatalogProduct[], categories: Category[]): string {
  const rows = [PRODUCT_HEADER_CELLS, ...productCatalogRows(products, categories)];
  const lines = rows.map((row) => row.map((cell) => csvEscape(cell)).join(','));
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * Ekspor daftar katalog menjadi berkas Excel (.xlsx).
 */
export function exportProductsToXlsx(products: CatalogProduct[], categories: Category[]): Uint8Array {
  return buildXlsxBytes([
    {
      name: 'Katalog Produk',
      rows: [PRODUCT_HEADER_CELLS, ...productCatalogRows(products, categories)],
    },
  ]);
}

/**
 * Contoh berkas CSV untuk unduhan panduan impor.
 */
export function generateProductTemplateCsv(): string {
  const rows = [PRODUCT_HEADER_CELLS, ...PRODUCT_SAMPLE_ROWS];
  return '\uFEFF' + rows.map((row) => row.map((cell) => csvEscape(cell)).join(',')).join('\r\n');
}

/**
 * Contoh berkas Excel (.xlsx) untuk unduhan panduan impor.
 */
export function generateProductTemplateXlsx(): Uint8Array {
  return buildXlsxBytes([
    {
      name: 'Contoh Produk',
      rows: [PRODUCT_HEADER_CELLS, ...PRODUCT_SAMPLE_ROWS],
    },
  ]);
}
