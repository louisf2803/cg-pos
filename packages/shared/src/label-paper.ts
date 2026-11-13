// Kertas dan isi label barcode (A149; migrasi 0138). Dikendalikan dari backoffice; aplikasi kasir hanya membaca dan mencetak.
import { DataError } from './types';

export interface LabelContent {
  /** ukuran huruf dalam mm */
  fontMm: number;
  /** jumlah huruf maksimal pada nama produk */
  maxChars: number;
  showBarcode: boolean;
  barcodeHeightMm: number;
  showCode: boolean; showName: boolean; showUnit: boolean; showMerchant: boolean;
  showPrice: boolean; priceMm: number;
}
export interface LabelPaper {
  id: string; name: string;
  paperW: number; paperH: number; columns: number;
  labelW: number; labelH: number;
  rowGap: number; colGap: number; marginLeft: number; marginTop: number;
  content: LabelContent;
  /** kertas bawaan: baca-saja, tidak tersimpan di server */
  builtin?: boolean;
}
export type LabelPaperInput = Omit<LabelPaper, 'builtin'>;

export const DEFAULT_LABEL_CONTENT: LabelContent = {
  fontMm: 2.4, maxChars: 15, showBarcode: true, barcodeHeightMm: 8, showCode: true, showName: true, showUnit: false, showMerchant: false, showPrice: true, priceMm: 2.3,
};
/** Kertas bawaan (baca-saja): lembar 165 x 210 mm, 3 kolom, label 50 x 18 mm. */
export const BUILTIN_LABEL_PAPER: LabelPaper = {
  id: 'bawaan', name: 'Bawaan (3 kolom)', paperW: 165, paperH: 210, columns: 3, labelW: 50, labelH: 18, rowGap: 2, colGap: 5, marginLeft: 3, marginTop: 7,
  content: DEFAULT_LABEL_CONTENT, builtin: true,
};

const within = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;

export function labelPaperProblem(p: LabelPaperInput): string | null {
  if (!p.name.trim() || p.name.trim().length > 50) return 'Nama kertas wajib diisi (maksimal 50 karakter).';
  if (!within(p.paperW, 10, 1000) || !within(p.paperH, 10, 2000)) return 'Panjang dan lebar kertas tidak masuk akal (10 sampai 1000 mm).';
  if (!Number.isInteger(p.columns) || !within(p.columns, 1, 12)) return 'Jumlah kolom 1 sampai 12.';
  if (!within(p.labelW, 5, 500) || !within(p.labelH, 5, 500)) return 'Ukuran label 5 sampai 500 mm.';
  if (!within(p.rowGap, 0, 100) || !within(p.colGap, 0, 100) || !within(p.marginLeft, 0, 200) || !within(p.marginTop, 0, 200)) return 'Jarak dan margin tidak boleh negatif dan terlalu besar.';
  if (labelsWidth(p) > p.paperW) return `Label tidak muat di lebar kertas: butuh ${round1(labelsWidth(p))} mm, kertas ${p.paperW} mm.`;
  if (p.labelH + p.marginTop > p.paperH) return 'Label tidak muat di tinggi kertas.';
  const c = p.content;
  if (!within(c.fontMm, 1, 10) || !within(c.priceMm, 1, 10)) return 'Ukuran huruf 1 sampai 10 mm.';
  if (!Number.isInteger(c.maxChars) || !within(c.maxChars, 5, 60)) return 'Maksimal karakter 5 sampai 60.';
  if (c.showBarcode && (!within(c.barcodeHeightMm, 3, 100) || c.barcodeHeightMm >= p.labelH)) return 'Tinggi barcode harus lebih kecil dari tinggi label.';
  return null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
/** Lebar semua kolom + jarak + margin kiri. */
export const labelsWidth = (p: Pick<LabelPaper, 'columns' | 'labelW' | 'colGap' | 'marginLeft'>) => p.columns * p.labelW + (p.columns - 1) * p.colGap + p.marginLeft;
/** Baris label per lembar. */
export const labelRowsPerPage = (p: Pick<LabelPaper, 'paperH' | 'labelH' | 'rowGap' | 'marginTop'>) => Math.max(0, Math.floor((p.paperH - p.marginTop + p.rowGap) / (p.labelH + p.rowGap)));
export const labelsPerPage = (p: LabelPaper) => labelRowsPerPage(p) * p.columns;
export const labelPageCount = (p: LabelPaper, labels: number) => (labels <= 0 || labelsPerPage(p) === 0 ? 0 : Math.ceil(labels / labelsPerPage(p)));

/** Potong nama bila lebih panjang dari batas (tambah titik tiga). */
export function clipLabelText(s: string, max: number): string { return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`; }

/** Gaya CSS cetak: ukuran lembar, jarak, dan margin mengikuti kertas. */
export function labelPrintCss(p: LabelPaper): string {
  return `@page { size: ${p.paperW}mm ${p.paperH}mm; margin: 0; }`;
}
/** Gaya kotak kanvas (grid kolom) untuk pratinjau dan cetak. */
export function labelGridStyle(p: LabelPaper): Record<string, string> {
  return {
    display: 'grid', gridTemplateColumns: `repeat(${p.columns}, ${p.labelW}mm)`, gridAutoRows: `${p.labelH}mm`, columnGap: `${p.colGap}mm`, rowGap: `${p.rowGap}mm`,
    paddingLeft: `${p.marginLeft}mm`, paddingTop: `${p.marginTop}mm`, width: `${p.paperW}mm`, boxSizing: 'border-box',
  };
}

/** Isi pengaturan dari data server yang mungkin belum lengkap. */
export function mergeLabelContent(raw: unknown): LabelContent {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<LabelContent>;
  const d = DEFAULT_LABEL_CONTENT;
  const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);
  return {
    fontMm: num(r.fontMm, d.fontMm), maxChars: num(r.maxChars, d.maxChars), showBarcode: bool(r.showBarcode, d.showBarcode), barcodeHeightMm: num(r.barcodeHeightMm, d.barcodeHeightMm),
    showCode: bool(r.showCode, d.showCode), showName: bool(r.showName, d.showName), showUnit: bool(r.showUnit, d.showUnit), showMerchant: bool(r.showMerchant, d.showMerchant),
    showPrice: bool(r.showPrice, d.showPrice), priceMm: num(r.priceMm, d.priceMm),
  };
}

const SERVER_MESSAGES: Record<string, string> = {
  'not allowed': 'Hanya pemilik, admin, atau manajer yang boleh mengubah pengaturan label.',
  'name required': 'Nama kertas wajib diisi.',
  'size required': 'Ukuran kertas dan label wajib diisi.',
  'invalid content': 'Isi label tidak valid.',
  'labels do not fit width': 'Label tidak muat di lebar kertas.',
  'label does not fit height': 'Label tidak muat di tinggi kertas.',
  'name already used': 'Nama kertas sudah dipakai.',
};
export function labelPaperError(error: { message?: string }): DataError {
  const known = SERVER_MESSAGES[error.message ?? ''];
  return new DataError(error.message === 'not allowed' ? 'forbidden' : 'invalid', known ?? (error.message || 'Gagal menyimpan kertas label.'));
}

/** Penyimpanan palsu untuk mode demo. */
export function createFakeLabelPapers() {
  const store = new Map<string, LabelPaper>();
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    async listLabelPapers(): Promise<LabelPaper[]> { return clone([...store.values()].sort((a, b) => a.name.localeCompare(b.name))); },
    async saveLabelPaper(input: LabelPaperInput): Promise<void> {
      const problem = labelPaperProblem(input);
      if (problem) throw new DataError('invalid', problem);
      if ([...store.values()].some((p) => p.id !== input.id && p.name.trim().toLowerCase() === input.name.trim().toLowerCase())) throw new DataError('invalid', SERVER_MESSAGES['name already used']!);
      store.set(input.id, clone({ ...input, name: input.name.trim() }));
    },
    async deleteLabelPaper(id: string): Promise<void> { store.delete(id); },
  };
}
