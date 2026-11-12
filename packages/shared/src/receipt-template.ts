/**
 * Templat struk pelanggan per outlet: ukuran huruf (tema), bagian mana yang tampil, dan batas cetak ulang.
 * Murni (tanpa DOM/jaringan): dipakai pembuat struk, layar kasir, dan editor di dashboard.
 * Tersimpan sebagai jsonb di pengaturan outlet; nilai kosong/tidak dikenal memakai bawaan sehingga struk lama tetap sama.
 */
export type PrintTheme = 'normal' | 'medium' | 'large';
export const PRINT_THEMES: { id: PrintTheme; label: string }[] = [
  { id: 'normal', label: 'Normal' }, { id: 'medium', label: 'Sedang' }, { id: 'large', label: 'Besar' },
];

export interface SocialMediaLinks {
  instagram?: string;
  facebook?: string;
  website?: string;
}

export type QrCodeType = 'order_no' | 'payment_link' | 'custom';

export const QR_CODE_TYPES: { id: QrCodeType; label: string; desc: string }[] = [
  { id: 'order_no', label: 'Nomor Pesanan', desc: 'Memuat nomor transaksi unik untuk verifikasi cepat kasir' },
  { id: 'payment_link', label: 'Tautan Pembayaran', desc: 'Tautan portal pembayaran atau pelunasan tagihan online' },
  { id: 'custom', label: 'URL Kustom', desc: 'Tautan promo, tautan media sosial, atau survei kepuasan pelanggan' },
];

export interface ReceiptTemplate {
  theme: PrintTheme;
  showOutletName: boolean; showAddress: boolean; showPhone: boolean;
  showOrderNo: boolean; showOrderType: boolean; showTable: boolean; showGuests: boolean;
  showTime: boolean; showCashier: boolean; showCustomer: boolean;
  showUnitPrice: boolean; showExtras: boolean; showNotes: boolean;
  /** baris "dicetak <waktu>" di kaki struk */
  showPrintTime: boolean;
  /** batas cetak ulang struk per transaksi; 0 = tanpa batas */
  maxPrints: number;
  /** lebar kertas bawaan saat kasir pertama kali membuka dialog cetak di perangkat yang belum pernah menyetel pilihan sendiri; kasir tetap bisa mengganti manual (tersimpan per perangkat). */
  defaultPaperWidth: '58' | '80';
  /** Logo toko di bagian atas struk */
  showLogo?: boolean;
  logoUrl?: string;
  /** Akun media sosial outlet di bagian bawah struk */
  showSocialMedia?: boolean;
  socialMedia?: SocialMediaLinks;
  /** Kode QR di struk untuk nomor pesanan, tautan bayar, atau URL promosi kustom */
  showQrCode?: boolean;
  qrCodeType?: QrCodeType;
  qrCodeCustomUrl?: string;
  /** Barcode nomor pesanan untuk pemindaian scanner kasir */
  showBarcode?: boolean;
}

export const MAX_PRINTS_LIMIT = 10;
export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplate = {
  theme: 'normal',
  showOutletName: true, showAddress: true, showPhone: true,
  showOrderNo: true, showOrderType: true, showTable: true, showGuests: true,
  showTime: true, showCashier: true, showCustomer: true,
  showUnitPrice: true, showExtras: true, showNotes: true,
  showPrintTime: false, maxPrints: 0, defaultPaperWidth: '80',
  showLogo: false, logoUrl: '',
  showSocialMedia: false, socialMedia: { instagram: '', facebook: '', website: '' },
  showQrCode: false, qrCodeType: 'order_no', qrCodeCustomUrl: '',
  showBarcode: false,
};

const BOOL_KEYS = [
  'showOutletName', 'showAddress', 'showPhone', 'showOrderNo', 'showOrderType', 'showTable', 'showGuests',
  'showTime', 'showCashier', 'showCustomer', 'showUnitPrice', 'showExtras', 'showNotes', 'showPrintTime',
  'showLogo', 'showSocialMedia', 'showQrCode', 'showBarcode',
] as const;

/** Ambil hanya kunci yang sah dari data mentah (database/pengguna); kunci lain dibuang. Hasilnya sebagian (Partial). */
export function sanitizeReceiptTemplate(raw: unknown): Partial<ReceiptTemplate> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<ReceiptTemplate> = {};
  for (const k of BOOL_KEYS) if (typeof r[k] === 'boolean') out[k] = r[k] as boolean;
  if (r.theme === 'normal' || r.theme === 'medium' || r.theme === 'large') out.theme = r.theme;
  if (typeof r.maxPrints === 'number' && Number.isInteger(r.maxPrints) && r.maxPrints >= 0 && r.maxPrints <= MAX_PRINTS_LIMIT) out.maxPrints = r.maxPrints;
  if (r.defaultPaperWidth === '58' || r.defaultPaperWidth === '80') out.defaultPaperWidth = r.defaultPaperWidth;

  if (typeof r.logoUrl === 'string') {
    out.logoUrl = r.logoUrl.trim().slice(0, 100_000); // mengizinkan URL web atau data:image base64
  }
  if (r.socialMedia && typeof r.socialMedia === 'object' && !Array.isArray(r.socialMedia)) {
    const sm = r.socialMedia as Record<string, unknown>;
    const cleanSm: SocialMediaLinks = {};
    if (typeof sm.instagram === 'string') cleanSm.instagram = sm.instagram.trim().slice(0, 80);
    if (typeof sm.facebook === 'string') cleanSm.facebook = sm.facebook.trim().slice(0, 100);
    if (typeof sm.website === 'string') cleanSm.website = sm.website.trim().slice(0, 150);
    out.socialMedia = cleanSm;
  }
  if (r.qrCodeType === 'order_no' || r.qrCodeType === 'payment_link' || r.qrCodeType === 'custom') {
    out.qrCodeType = r.qrCodeType;
  }
  if (typeof r.qrCodeCustomUrl === 'string') {
    out.qrCodeCustomUrl = r.qrCodeCustomUrl.trim().slice(0, 250);
  }

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
  if (t.defaultPaperWidth !== undefined && t.defaultPaperWidth !== '58' && t.defaultPaperWidth !== '80') return 'Lebar kertas bawaan harus 58 mm atau 80 mm.';
  for (const k of BOOL_KEYS) if (t[k] !== undefined && typeof t[k] !== 'boolean') return 'Pilihan tampil/sembunyi tidak sah.';
  if (t.showQrCode && t.qrCodeType === 'custom') {
    if (!t.qrCodeCustomUrl || !t.qrCodeCustomUrl.trim()) {
      return 'Tautan kustom kode QR wajib diisi bila memilih jenis URL kustom.';
    }
  }
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
