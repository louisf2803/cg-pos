/**
 * Templat struk pelanggan per outlet: ukuran huruf (tema), bagian mana yang tampil, dan batas cetak ulang.
 * Murni (tanpa DOM/jaringan): dipakai pembuat struk, layar kasir, dan editor di dashboard.
 * Tersimpan sebagai jsonb di pengaturan outlet; nilai kosong/tidak dikenal memakai bawaan sehingga struk lama tetap sama.
 */
export type PrintTheme = 'normal' | 'medium' | 'large';
export const PRINT_THEMES: { id: PrintTheme; label: string }[] = [
  { id: 'normal', label: 'Normal' }, { id: 'medium', label: 'Sedang' }, { id: 'large', label: 'Besar' },
];

export interface ReceiptTemplate {
  theme: PrintTheme;
  showOutletName: boolean; showAddress: boolean; showPhone: boolean;
  showOrderNo: boolean; showOrderType: boolean; showTable: boolean; showGuests: boolean;
  showTime: boolean; showCashier: boolean; showCustomer: boolean;
  showUnitPrice: boolean; showExtras: boolean; showNotes: boolean;
  /** rincian di bawah daftar item */
  showServiceCharge: boolean; showTax: boolean; showRounding: boolean;
  /** bagian pembayaran (struk lunas) */
  showPaymentMethod: boolean; showChange: boolean;
  /** baris "dicetak <waktu>" di kaki struk */
  showPrintTime: boolean;
  /** batas cetak ulang struk per transaksi; 0 = tanpa batas */
  maxPrints: number;
  /** lebar kertas bawaan saat kasir pertama kali membuka dialog cetak di perangkat yang belum pernah menyetel pilihan sendiri; kasir tetap bisa mengganti manual (tersimpan per perangkat). */
  defaultPaperWidth: '58' | '76' | '80';
}

export const MAX_PRINTS_LIMIT = 10;
export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplate = {
  theme: 'normal',
  showOutletName: true, showAddress: true, showPhone: true,
  showOrderNo: true, showOrderType: true, showTable: true, showGuests: true,
  showTime: true, showCashier: true, showCustomer: true,
  showUnitPrice: true, showExtras: true, showNotes: true,
  showServiceCharge: true, showTax: true, showRounding: true, showPaymentMethod: true, showChange: true,
  showPrintTime: false, maxPrints: 0, defaultPaperWidth: '80',
};

const BOOL_KEYS = [
  'showOutletName', 'showAddress', 'showPhone', 'showOrderNo', 'showOrderType', 'showTable', 'showGuests',
  'showTime', 'showCashier', 'showCustomer', 'showUnitPrice', 'showExtras', 'showNotes', 'showPrintTime',
  'showServiceCharge', 'showTax', 'showRounding', 'showPaymentMethod', 'showChange',
] as const;

/** Ambil hanya kunci yang sah dari data mentah (database/pengguna); kunci lain dibuang. Hasilnya sebagian (Partial). */
export function sanitizeReceiptTemplate(raw: unknown): Partial<ReceiptTemplate> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<ReceiptTemplate> = {};
  for (const k of BOOL_KEYS) if (typeof r[k] === 'boolean') out[k] = r[k] as boolean;
  if (r.theme === 'normal' || r.theme === 'medium' || r.theme === 'large') out.theme = r.theme;
  if (typeof r.maxPrints === 'number' && Number.isInteger(r.maxPrints) && r.maxPrints >= 0 && r.maxPrints <= MAX_PRINTS_LIMIT) out.maxPrints = r.maxPrints;
  if (r.defaultPaperWidth === '58' || r.defaultPaperWidth === '76' || r.defaultPaperWidth === '80') out.defaultPaperWidth = r.defaultPaperWidth;
  return out;
}

/** Templat utuh: bawaan, lalu pilihan lama kasir/pelanggan (migrasi 0027), lalu templat tersimpan. */
export function resolveReceiptTemplate(ctx: { receiptTemplate?: unknown; receiptShowCashier?: boolean; receiptShowCustomer?: boolean }): ReceiptTemplate {
  return {
    ...DEFAULT_RECEIPT_TEMPLATE,
    showCashier: ctx.receiptShowCashier !== false,
    showCustomer: ctx.receiptShowCustomer !== false,
    ...sanitizeReceiptTemplate(ctx.receiptTemplate),
  };
}

/** Pesan galat bahasa Indonesia untuk masukan editor, atau null bila sah. */
export function receiptTemplateProblem(t: Partial<ReceiptTemplate>): string | null {
  if (t.theme !== undefined && !PRINT_THEMES.some((x) => x.id === t.theme)) return 'Tema struk tidak dikenal.';
  if (t.maxPrints !== undefined && (!Number.isInteger(t.maxPrints) || t.maxPrints < 0 || t.maxPrints > MAX_PRINTS_LIMIT)) return `Batas cetak harus 0 sampai ${MAX_PRINTS_LIMIT} (0 = tanpa batas).`;
  if (t.defaultPaperWidth !== undefined && t.defaultPaperWidth !== '58' && t.defaultPaperWidth !== '76' && t.defaultPaperWidth !== '80') return 'Lebar kertas bawaan harus 58, 76, atau 80 mm.';
  for (const k of BOOL_KEYS) if (t[k] !== undefined && typeof t[k] !== 'boolean') return 'Pilihan tampil/sembunyi tidak sah.';
  return null;
}

/** Lebar kolom efektif: huruf "Besar" dicetak dua kali lebih lebar, jadi kolom per baris separuhnya. */
export function themeCols(cols: number, theme: PrintTheme): number {
  return theme === 'large' ? Math.max(12, Math.floor(cols / 2)) : cols;
}

/** Boleh cetak lagi? `printed` = berapa kali struk transaksi ini sudah dicetak; max 0 = tanpa batas. */
export function canPrintAgain(printed: number, max: number): boolean {
  return max <= 0 || printed < max;
}
