import { describe, expect, it } from 'vitest';
import {
  BUILTIN_LABEL_PAPER, DEFAULT_LABEL_CONTENT, clipLabelText, createFakeLabelPapers, labelGridStyle, labelPageCount, labelPaperError, labelPaperProblem, labelPrintCss,
  labelRowsPerPage, labelsPerPage, labelsWidth, mergeLabelContent, type LabelPaperInput,
} from '../src/label-paper';

const { builtin: _b, ...paper } = BUILTIN_LABEL_PAPER;
const input = (over: Partial<LabelPaperInput> = {}): LabelPaperInput => ({ ...paper, id: 'k1', name: 'Kertas uji', ...over });

describe('hitungan kertas label', () => {
  it('kertas bawaan: 3 kolom 50x18 pada 165x210 muat; 3 x 50 + 2 x 5 + 3 = 163 mm', () => {
    expect(labelsWidth(BUILTIN_LABEL_PAPER)).toBe(163);
    expect(labelRowsPerPage(BUILTIN_LABEL_PAPER)).toBe(10);
    expect(labelsPerPage(BUILTIN_LABEL_PAPER)).toBe(30);
    expect(labelPageCount(BUILTIN_LABEL_PAPER, 31)).toBe(2);
    expect(labelPageCount(BUILTIN_LABEL_PAPER, 0)).toBe(0);
  });
  it('gaya cetak dan grid mengikuti kertas', () => {
    expect(labelPrintCss(BUILTIN_LABEL_PAPER)).toBe('@page { size: 165mm 210mm; margin: 0; }');
    expect(labelGridStyle(BUILTIN_LABEL_PAPER)).toMatchObject({ gridTemplateColumns: 'repeat(3, 50mm)', gridAutoRows: '18mm', columnGap: '5mm', rowGap: '2mm', paddingLeft: '3mm', paddingTop: '7mm' });
  });
  it('memotong nama panjang', () => {
    expect(clipLabelText('Kopi susu', 15)).toBe('Kopi susu');
    expect(clipLabelText('Kopi susu gula aren botol besar', 15)).toBe('Kopi susu gula…');
  });
});

describe('validasi', () => {
  it('kertas yang benar lolos', () => expect(labelPaperProblem(input())).toBeNull());
  it('menolak yang tidak muat, nama kosong, dan nilai ganjil', () => {
    expect(labelPaperProblem(input({ labelW: 60 }))).toMatch(/lebar kertas/);
    expect(labelPaperProblem(input({ labelH: 210 }))).toMatch(/tinggi kertas/);
    expect(labelPaperProblem(input({ name: ' ' }))).toMatch(/Nama/);
    expect(labelPaperProblem(input({ columns: 0 }))).toMatch(/kolom/);
    expect(labelPaperProblem(input({ rowGap: -1 }))).toMatch(/Jarak/);
    expect(labelPaperProblem(input({ content: { ...DEFAULT_LABEL_CONTENT, barcodeHeightMm: 30 } }))).toMatch(/barcode/);
    expect(labelPaperProblem(input({ content: { ...DEFAULT_LABEL_CONTENT, maxChars: 2 } }))).toMatch(/karakter/);
  });
  it('isi label dilengkapi dari data yang kurang', () => {
    expect(mergeLabelContent({ fontMm: 3, showPrice: false })).toMatchObject({ fontMm: 3, showPrice: false, showBarcode: true, maxChars: 15 });
    expect(mergeLabelContent(null)).toEqual(DEFAULT_LABEL_CONTENT);
  });
  it('terjemahan galat server', () => {
    expect(labelPaperError({ message: 'labels do not fit width' }).message).toMatch(/lebar kertas/);
    expect(labelPaperError({ message: 'not allowed' }).code).toBe('forbidden');
  });
});

describe('penyimpanan demo', () => {
  it('simpan, ubah dengan id sama, nama kembar ditolak, hapus', async () => {
    const s = createFakeLabelPapers();
    await s.saveLabelPaper(input());
    await s.saveLabelPaper(input({ labelW: 45 }));
    expect((await s.listLabelPapers())[0]!.labelW).toBe(45);
    await expect(s.saveLabelPaper(input({ id: 'k2', name: 'KERTAS UJI' }))).rejects.toThrow(/sudah dipakai/);
    await expect(s.saveLabelPaper(input({ id: 'k3', name: 'Lain', labelW: 80 }))).rejects.toThrow(/lebar kertas/);
    await s.deleteLabelPaper('k1');
    expect(await s.listLabelPapers()).toEqual([]);
  });
});
