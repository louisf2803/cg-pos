import { toCsv } from './report';
import { MAX_OPNAME_LINES, opnameDifference, type StockItem, type StockOpname } from './stock';

export type OpnameCsvRowStatus = 'valid' | 'blank' | 'error';

export interface OpnameCsvRow {
  lineNumber: number;
  productId: string;
  name: string;
  unit: string;
  systemQty: number;
  countedQty: number | null;
  difference: number | null;
  status: OpnameCsvRowStatus;
  errorReason?: string;
}

export interface ParseOpnameCsvResult {
  rows: OpnameCsvRow[];
  totalRows: number;
  validCount: number;
  blankCount: number;
  errorCount: number;
  truncated: boolean;
  headerError?: string;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Memilih pemisah CSV dari baris pertama (titik koma khas Excel Indonesia atau koma standar). */
export function detectCsvDelimiter(text: string): ';' | ',' {
  const clean = text.startsWith('\uFEFF') ? text.slice(1) : text;
  let inQuotes = false;
  let commas = 0;
  let semis = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ';') {
      semis++;
    } else if (ch === ',') {
      commas++;
    } else if (ch === '\n' || ch === '\r') {
      if (semis > 0 || commas > 0) break;
    }
  }
  return semis > 0 && semis >= commas ? ';' : ',';
}

/** Pengurai CSV RFC 4180 yang otomatis mendeteksi pemisah koma atau titik koma serta BOM UTF-8. */
export function parseDelimitedCsv(text: string): string[][] {
  const clean = text.startsWith('\uFEFF') ? text.slice(1) : text;
  if (!clean.trim()) return [];
  const delim = detectCsvDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  while (rows.length > 0) {
    const last = rows[rows.length - 1]!;
    if (last.every((c) => c.trim() === '')) {
      rows.pop();
    } else {
      break;
    }
  }

  return rows;
}

/** Membuat berkas templat CSV ber-BOM (untuk Excel) berisi daftar stok outlet dan hitung draf saat ini. */
export function buildOpnameCsvTemplate(
  stockItems: readonly StockItem[],
  currentCounts?: ReadonlyMap<string, number>,
  systemQtyOverrides?: ReadonlyMap<string, number>,
): string {
  const sorted = [...stockItems].sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const rows: (string | number)[][] = [
    ['ID Produk', 'Nama Item', 'Jenis', 'Kategori', 'Satuan', 'Stok Sistem', 'Hitung Fisik'],
  ];
  for (const item of sorted) {
    const sysQty = systemQtyOverrides?.get(item.productId) ?? item.qty;
    const draftQty = currentCounts?.get(item.productId);
    rows.push([
      item.productId,
      item.name,
      item.kind === 'ingredient' ? 'Bahan baku' : 'Barang dagang',
      item.categoryName ?? '',
      item.unit,
      sysQty,
      draftQty !== undefined ? draftQty : '',
    ]);
  }
  return toCsv(rows);
}

/** Mengekspor rincian opname (termasuk yang sudah selesai) ke format CSV ber-BOM. */
export function buildOpnameResultCsv(opname: StockOpname): string {
  const rows: (string | number)[][] = [
    ['ID Produk', 'Nama Item', 'Satuan', 'Stok Sistem', 'Hitung Fisik', 'Selisih', 'Nilai Selisih'],
  ];
  for (const line of opname.lines) {
    rows.push([
      line.productId,
      line.name,
      line.unit,
      line.systemQty,
      line.countedQty,
      line.difference,
      line.value,
    ]);
  }
  return toCsv(rows);
}

const normHeader = (s: string) => s.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

function findCol(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseQtyCell(raw: string): { blank: true } | { blank: false; value: number } | { blank: false; error: string } {
  const trimmed = raw.trim().replace(/^'/, '');
  if (trimmed === '') return { blank: true };
  if (trimmed.startsWith('-')) return { blank: false, error: 'Hitung fisik tidak boleh negatif.' };
  if (/\s/.test(trimmed)) return { blank: false, error: 'Angka tidak boleh mengandung spasi.' };
  if (trimmed.includes('.') && trimmed.includes(',')) {
    return { blank: false, error: 'Jangan campur titik dan koma pada angka (pakai 1250 atau 12.5).' };
  }
  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return { blank: false, error: 'Hitung fisik harus berupa angka valid.' };
  }
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) {
    return { blank: false, error: 'Hitung fisik tidak valid.' };
  }
  if (num > 1_000_000_000) {
    return { blank: false, error: 'Jumlah maksimal 1.000.000.000.' };
  }
  if (r4(num) !== num) {
    return { blank: false, error: 'Maksimal 4 angka di belakang koma.' };
  }
  return { blank: false, value: num };
}

/** Memvalidasi dan memetakan baris CSV hasil opname fisik ke item stok outlet. */
export function parseOpnameCsv(
  csvText: string,
  stockItems: readonly StockItem[],
  systemQtyOverrides?: ReadonlyMap<string, number>,
): ParseOpnameCsvResult {
  const parsed = parseDelimitedCsv(csvText);
  if (parsed.length === 0) {
    return {
      rows: [],
      totalRows: 0,
      validCount: 0,
      blankCount: 0,
      errorCount: 0,
      truncated: false,
      headerError: 'Berkas CSV kosong atau tidak memiliki baris header.',
    };
  }

  const headers = parsed[0]!.map(normHeader);
  const colId = findCol(headers, ['id produk', 'product id', 'productid', 'id', 'kode produk']);
  const colName = findCol(headers, ['nama item', 'nama produk', 'nama', 'item', 'name']);
  const colQty = findCol(headers, ['hitung fisik', 'stok fisik', 'jumlah fisik', 'fisik', 'counted qty', 'countedqty', 'qty', 'jumlah']);

  if (colQty === -1 || (colId === -1 && colName === -1)) {
    return {
      rows: [],
      totalRows: 0,
      validCount: 0,
      blankCount: 0,
      errorCount: 0,
      truncated: false,
      headerError: 'Header CSV wajib memiliki kolom "Hitung Fisik" serta "ID Produk" atau "Nama Item".',
    };
  }

  const byId = new Map(stockItems.map((item) => [item.productId, item]));
  const byNameLower = new Map<string, StockItem | 'ambiguous'>();
  for (const item of stockItems) {
    const key = item.name.trim().toLowerCase();
    byNameLower.set(key, byNameLower.has(key) ? 'ambiguous' : item);
  }

  const dataRows = parsed.slice(1);
  const truncated = dataRows.length > MAX_OPNAME_LINES;
  const slice = dataRows.slice(0, MAX_OPNAME_LINES);

  const rows: OpnameCsvRow[] = [];
  const seenValidIds = new Set<string>();
  let validCount = 0;
  let blankCount = 0;
  let errorCount = 0;

  for (let i = 0; i < slice.length; i++) {
    const raw = slice[i]!;
    if (raw.every((c) => c.trim() === '')) continue;

    const lineNumber = i + 2;
    const rawId = colId !== -1 ? (raw[colId] ?? '').trim() : '';
    const rawName = colName !== -1 ? (raw[colName] ?? '').trim() : '';
    const rawQty = raw[colQty] ?? '';

    let matched: StockItem | undefined;
    let matchError: string | undefined;

    if (rawId) {
      matched = byId.get(rawId);
      if (!matched) {
        matchError = `ID Produk "${rawId}" tidak terdaftar pada stok outlet.`;
      }
    } else if (rawName) {
      const hit = byNameLower.get(rawName.toLowerCase());
      if (hit === 'ambiguous') {
        matchError = `Nama "${rawName}" dimiliki lebih dari satu item; isi ID Produk.`;
      } else if (!hit) {
        matchError = `Item "${rawName}" tidak ditemukan di stok outlet.`;
      } else {
        matched = hit;
      }
    } else {
      matchError = 'ID Produk maupun Nama Item kosong.';
    }

    const qtyRes = parseQtyCell(rawQty);

    if (matchError) {
      errorCount++;
      rows.push({
        lineNumber,
        productId: rawId,
        name: rawName || rawId || '(Tanpa nama)',
        unit: '',
        systemQty: 0,
        countedQty: null,
        difference: null,
        status: 'error',
        errorReason: matchError,
      });
      continue;
    }

    const item = matched!;
    const sysQty = systemQtyOverrides?.get(item.productId) ?? item.qty;

    if (qtyRes.blank) {
      blankCount++;
      rows.push({
        lineNumber,
        productId: item.productId,
        name: item.name,
        unit: item.unit,
        systemQty: sysQty,
        countedQty: null,
        difference: null,
        status: 'blank',
      });
      continue;
    }

    if ('error' in qtyRes) {
      errorCount++;
      rows.push({
        lineNumber,
        productId: item.productId,
        name: item.name,
        unit: item.unit,
        systemQty: sysQty,
        countedQty: null,
        difference: null,
        status: 'error',
        errorReason: qtyRes.error,
      });
      continue;
    }

    if (seenValidIds.has(item.productId)) {
      errorCount++;
      rows.push({
        lineNumber,
        productId: item.productId,
        name: item.name,
        unit: item.unit,
        systemQty: sysQty,
        countedQty: qtyRes.value,
        difference: null,
        status: 'error',
        errorReason: 'Item dihitung lebih dari satu kali pada berkas CSV.',
      });
      continue;
    }

    seenValidIds.add(item.productId);
    validCount++;
    rows.push({
      lineNumber,
      productId: item.productId,
      name: item.name,
      unit: item.unit,
      systemQty: sysQty,
      countedQty: qtyRes.value,
      difference: opnameDifference(sysQty, qtyRes.value),
      status: 'valid',
    });
  }

  return {
    rows,
    totalRows: rows.length,
    validCount,
    blankCount,
    errorCount,
    truncated,
  };
}

