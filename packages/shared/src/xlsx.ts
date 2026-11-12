import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type SpreadsheetCell = string | number | boolean | null | undefined;
export interface XlsxSheetInput {
  name: string;
  rows: readonly (readonly SpreadsheetCell[])[];
}

const MAX_XLSX_BYTES = 15 * 1024 * 1024;
const MAX_XML_ENTRY_BYTES = 32 * 1024 * 1024;

/** Konversi huruf kolom Excel (A, B, ..., AA, AB) menjadi indeks berbasis 0. */
export function colLettersToIndex(letters: string): number {
  let col = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i);
    if (code < 65 || code > 90) return -1;
    col = col * 26 + (code - 64);
  }
  return col - 1;
}

/** Konversi indeks kolom berbasis 0 menjadi huruf kolom Excel (A, B, ..., AA). */
export function indexToColLetters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function escapeXml(text: string): string {
  // XML 1.0 melarang karakter kontrol selain \t (0x09), \n (0x0A), \r (0x0D)
  const clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
  return clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function getAttr(attrs: string, name: string): string | undefined {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\s)${esc}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
  const m = re.exec(attrs);
  if (!m) return undefined;
  return decodeXmlEntities(m[1] ?? m[2] ?? '');
}

function extractInlineText(innerXml: string): string {
  const parts: string[] = [];
  const re = /<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(innerXml)) !== null) {
    parts.push(decodeXmlEntities(m[1] ?? ''));
  }
  return parts.join('');
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml)) !== null) {
    out.push(extractInlineText(m[1] ?? ''));
  }
  return out;
}

function findEntryCaseInsensitive(entries: Record<string, Uint8Array>, targetPath: string): Uint8Array | undefined {
  if (entries[targetPath]) return entries[targetPath];
  const lower = targetPath.toLowerCase();
  for (const key of Object.keys(entries)) {
    if (key.toLowerCase() === lower) return entries[key];
  }
  return undefined;
}

function resolveSheetPath(entries: Record<string, Uint8Array>, sheetIndex: number): string {
  const wbBytes = findEntryCaseInsensitive(entries, 'xl/workbook.xml');
  const relsBytes = findEntryCaseInsensitive(entries, 'xl/_rels/workbook.xml.rels');
  if (wbBytes && relsBytes) {
    const wbXml = strFromU8(wbBytes);
    const relsXml = strFromU8(relsBytes);
    const sheetTags: string[] = [];
    const sheetRe = /<(?:\w+:)?sheet\b([^>]*?)\/?>/g;
    let sm: RegExpExecArray | null;
    while ((sm = sheetRe.exec(wbXml)) !== null) {
      sheetTags.push(sm[1] ?? '');
    }
    const targetTag = sheetTags[sheetIndex];
    if (sheetIndex >= sheetTags.length) {
      throw new Error(`Sheet ke-${sheetIndex + 1} tidak ditemukan di berkas Excel.`);
    }
    const rId = targetTag ? (getAttr(targetTag, 'r:id') ?? getAttr(targetTag, 'id')) : undefined;
    if (rId) {
      const relRe = /<(?:\w+:)?Relationship\b([^>]*?)\/?>/g;
      let rm: RegExpExecArray | null;
      while ((rm = relRe.exec(relsXml)) !== null) {
        const attrs = rm[1] ?? '';
        if (getAttr(attrs, 'Id') === rId) {
          const target = getAttr(attrs, 'Target');
          if (target) {
            const clean = target.replace(/^\/+/, '');
            return clean.toLowerCase().startsWith('xl/') ? clean : `xl/${clean}`;
          }
        }
      }
    }
  }
  return `xl/worksheets/sheet${sheetIndex + 1}.xml`;
}

function parseWorksheetXml(xml: string, sharedStrings: readonly string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g;
  const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
  const valRe = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/;
  const isRe = /<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/;

  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml)) !== null) {
    const rowBody = rm[1] ?? '';
    const cells: string[] = [];
    let cursor = 0;

    cellRe.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowBody)) !== null) {
      const attrs = cm[1] ?? '';
      const inner = cm[2] ?? '';
      const refAttr = getAttr(attrs, 'r');
      let col = cursor;
      if (refAttr) {
        const colMatch = /^([A-Za-z]+)\d+$/.exec(refAttr.trim());
        if (colMatch) {
          const parsedCol = colLettersToIndex(colMatch[1]!);
          if (parsedCol >= 0) col = parsedCol;
        }
      }
      cursor = col + 1;
      if (!inner) continue;

      const cellType = getAttr(attrs, 't');
      let val = '';
      if (cellType === 'inlineStr') {
        const isMatch = isRe.exec(inner);
        val = isMatch ? extractInlineText(isMatch[1] ?? '') : extractInlineText(inner);
      } else {
        const vm = valRe.exec(inner);
        if (!vm) continue;
        const rawV = decodeXmlEntities(vm[1] ?? '');
        if (cellType === 's') {
          const idx = Number(rawV);
          val = Number.isInteger(idx) && idx >= 0 && idx < sharedStrings.length ? (sharedStrings[idx] ?? '') : '';
        } else if (cellType === 'b') {
          val = rawV === '1' ? 'TRUE' : rawV === '0' ? 'FALSE' : rawV;
        } else {
          val = rawV;
        }
      }

      if (val !== '') {
        while (cells.length <= col) cells.push('');
        cells[col] = val;
      }
    }

    if (cells.some((c) => c.trim() !== '')) {
      rows.push(cells);
    }
  }
  return rows;
}

/** Membaca baris sel dari berkas Excel `.xlsx` (OOXML) menjadi array string dua dimensi. */
export function parseXlsxRows(bytes: Uint8Array, sheetIndex = 0): string[][] {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4) {
    throw new Error('Berkas Excel kosong atau rusak.');
  }
  if (bytes.length > MAX_XLSX_BYTES) {
    throw new Error('Ukuran berkas Excel melebihi batas maksimal 15 MB.');
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('Berkas bukan format Excel (.xlsx) yang valid.');
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        if (file.originalSize > MAX_XML_ENTRY_BYTES) {
          throw new Error('Isi berkas Excel terlalu besar untuk diproses.');
        }
        const name = file.name.toLowerCase();
        return (
          name === 'xl/workbook.xml' ||
          name === 'xl/_rels/workbook.xml.rels' ||
          name === 'xl/sharedstrings.xml' ||
          name.startsWith('xl/worksheets/')
        );
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Isi berkas Excel')) throw err;
    throw new Error('Berkas Excel (.xlsx) rusak atau tidak dapat dibuka.');
  }

  const sheetPath = resolveSheetPath(entries, sheetIndex);
  const sheetBytes = findEntryCaseInsensitive(entries, sheetPath);
  if (!sheetBytes) {
    throw new Error('Lembar kerja tidak ditemukan di dalam berkas Excel (.xlsx).');
  }

  const sharedBytes = findEntryCaseInsensitive(entries, 'xl/sharedStrings.xml');
  const sharedStrings = sharedBytes ? parseSharedStrings(strFromU8(sharedBytes)) : [];
  return parseWorksheetXml(strFromU8(sheetBytes), sharedStrings);
}

/**
 * Membaca berkas spreadsheet `.xlsx` maupun CSV UTF-8 secara otomatis berdasarkan
 * signature byte dan ekstensi nama berkas, sekaligus menolak `.xls` lama atau biner rusak.
 */
export function readSpreadsheetRows(
  fileName: string,
  bytes: Uint8Array,
  parseCsv: (text: string) => string[][],
  sheetIndex = 0,
): { format: 'xlsx' | 'csv'; rows: string[][] } {
  const lower = fileName.toLowerCase();
  const isZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip || lower.endsWith('.xlsx')) {
    return { format: 'xlsx', rows: parseXlsxRows(bytes, sheetIndex) };
  }
  const isOldXls =
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0;
  if (isOldXls || lower.endsWith('.xls')) {
    throw new Error('Format .xls (Excel 97-2003) belum didukung. Simpan ulang berkas sebagai .xlsx atau .csv.');
  }
  if (bytes.length > MAX_XLSX_BYTES) {
    throw new Error('Ukuran berkas melebihi batas maksimal 15 MB.');
  }
  const hasControlByte = bytes.some((b) => b < 0x09 || (b >= 0x0e && b < 0x20));
  if (hasControlByte) {
    throw new Error('Berkas tidak dapat dibaca. Pastikan memakai format .xlsx atau CSV UTF-8.');
  }
  return { format: 'csv', rows: parseCsv(strFromU8(bytes)) };
}

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
}

function buildWorksheetXml(rows: readonly (readonly SpreadsheetCell[])[]): string {
  let maxCols = 0;
  for (const r of rows) {
    if (r.length > maxCols) maxCols = r.length;
  }
  const widths = Array.from({ length: maxCols }, (_, colIdx) => {
    let maxLen = 10;
    for (const r of rows) {
      const s = r[colIdx] == null ? '' : String(r[colIdx]);
      if (s.length + 3 > maxLen) maxLen = Math.min(48, s.length + 3);
    }
    return maxLen;
  });

  const colsXml = widths.length > 0
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';

  const rowXmls = rows.map((row, rowIdx) => {
    const rNum = rowIdx + 1;
    const styleAttr = rowIdx === 0 ? ' s="1"' : '';
    const cellXmls: string[] = [];
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const val = row[colIdx];
      if (val === null || val === undefined || val === '') continue;
      const ref = `${indexToColLetters(colIdx)}${rNum}`;
      if (typeof val === 'number' && Number.isFinite(val)) {
        cellXmls.push(`<c r="${ref}"${styleAttr} t="n"><v>${val}</v></c>`);
      } else if (typeof val === 'boolean') {
        cellXmls.push(`<c r="${ref}"${styleAttr} t="b"><v>${val ? 1 : 0}</v></c>`);
      } else {
        cellXmls.push(`<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(val))}</t></is></c>`);
      }
    }
    return `<row r="${rNum}">${cellXmls.join('')}</row>`;
  });

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    colsXml +
    `<sheetData>${rowXmls.join('')}</sheetData>` +
    '</worksheet>'
  );
}

/** Menghasilkan berkas Excel `.xlsx` standar (OOXML) dari satu atau beberapa sheet. */
export function buildXlsxBytes(sheets: readonly XlsxSheetInput[]): Uint8Array {
  const normalized = (sheets.length > 0 ? sheets : [{ name: 'Sheet1', rows: [] }]).map((s, idx) => ({
    name: sanitizeSheetName(s.name, idx),
    rows: s.rows,
  }));

  const files: Record<string, Uint8Array> = {};

  const overrideTypes = normalized
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join('');
  files['[Content_Types].xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    overrideTypes +
    '</Types>',
  );

  files['_rels/.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>',
  );

  const sheetDefs = normalized
    .map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  files['xl/workbook.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${sheetDefs}</sheets>` +
    '</workbook>',
  );

  const relDefs = normalized
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join('');
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    relDefs +
    `<Relationship Id="rId${normalized.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>',
  );

  files['xl/styles.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>',
  );

  normalized.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(buildWorksheetXml(s.rows));
  });

  return zipSync(files, { level: 6 });
}

