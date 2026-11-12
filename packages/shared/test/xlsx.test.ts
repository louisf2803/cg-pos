import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { buildXlsxBytes, colLettersToIndex, indexToColLetters, parseXlsxRows } from '../src';

describe('xlsx (OOXML murni)', () => {
  it('mengonversi indeks dan huruf kolom bolak-balik termasuk kolom AA', () => {
    expect(colLettersToIndex('A')).toBe(0);
    expect(colLettersToIndex('Z')).toBe(25);
    expect(colLettersToIndex('AA')).toBe(26);
    expect(colLettersToIndex('ab')).toBe(27);
    expect(indexToColLetters(0)).toBe('A');
    expect(indexToColLetters(25)).toBe('Z');
    expect(indexToColLetters(26)).toBe('AA');
    expect(indexToColLetters(27)).toBe('AB');
  });

  it('membuat dan membaca ulang .xlsx secara round-trip beserta karakter khusus XML dan desimal', () => {
    const bytes = buildXlsxBytes([
      {
        name: 'Stok/Opname:2026',
        rows: [
          ['ID Produk', 'Nama Item', 'Hitung Fisik', 'Aktif'],
          ['p-1', 'Kopi & "Gula" <50%>', 12.25, true],
          ['p-2', 'Susu =UHT', '', false],
        ],
      },
      {
        name: 'Sheet Kedua',
        rows: [['Header'], ['Isi 2']],
      },
    ]);

    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(parseXlsxRows(bytes, 0)).toEqual([
      ['ID Produk', 'Nama Item', 'Hitung Fisik', 'Aktif'],
      ['p-1', 'Kopi & "Gula" <50%>', '12.25', 'TRUE'],
      ['p-2', 'Susu =UHT', '', 'FALSE'],
    ]);
    expect(parseXlsxRows(bytes, 1)).toEqual([['Header'], ['Isi 2']]);
  });

  it('membaca sharedStrings (termasuk rich text) dan sel jarang bergaya Excel/Calc', () => {
    const xlsx = zipSync({
      'xl/workbook.xml': strToU8(
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Opname" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml"/></Relationships>',
      ),
      'xl/sharedStrings.xml': strToU8(
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>ID Produk</t></si><si><r><t xml:space="preserve">Kopi </t></r><r><t>Susu &amp; Aren</t></r></si></sst>',
      ),
      'xl/worksheets/sheet1.xml': strToU8(
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Hitung Fisik</t></is></c></row>' +
          '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" s="2"/><c r="C2"><v>7.5</v></c></row>' +
          '</sheetData></worksheet>',
      ),
    });

    expect(parseXlsxRows(xlsx)).toEqual([
      ['ID Produk', '', 'Hitung Fisik'],
      ['Kopi Susu & Aren', '', '7.5'],
    ]);
  });

  it('menolak berkas non-ZIP, kosong, atau rusak dengan pesan jelas', () => {
    expect(() => parseXlsxRows(new Uint8Array([]))).toThrow(/kosong|rusak/);
    expect(() => parseXlsxRows(strToU8('ID Produk;Hitung Fisik'))).toThrow(/bukan format Excel/);
    expect(() => parseXlsxRows(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff]))).toThrow(/rusak|tidak dapat dibuka/);
  });
});

