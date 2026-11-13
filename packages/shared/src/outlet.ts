import type { OrderType, TaxMode } from './order-calc';
import { receiptTemplateProblem } from './receipt-template';

export interface OutletInfo { code: string; name: string; address: string; phone: string; timezone: string }
export interface OutletOptions {
  serviceChargePct: number; serviceChargeTaxable: boolean; serviceChargeOrderTypes: OrderType[];
  roundingCashStep: number; roundingNoncashStep: number; requireOpenShift: boolean; allowNegativeStock: boolean;
  receiptFooter: string;
  /** batas total kas keluar per hari (Rp); null/undefined = tanpa batas. Dijaga server. */
  cashOutDailyLimit?: number | null;
  /** wajib foto bukti untuk kas masuk/keluar (dijaga server; kasir belum punya pengambilan foto, jadi belum bisa dinyalakan dari layar) */
  requireCashPhoto?: boolean;
  /** modal awal bawaan saat buka shift (Rp); null/undefined = tidak ada. Butuh migrasi 0026. */
  defaultOpeningCash?: number | null;
  /** teks kepala struk (maks 200 karakter, 4 baris); kosong = tidak ada. Butuh migrasi 0027. */
  receiptHeader?: string;
  /** tampilkan nama kasir / pelanggan di struk; tidak diisi = tampil. Butuh migrasi 0027. */
  receiptShowCashier?: boolean;
  receiptShowCustomer?: boolean;
  /** templat struk lengkap (tema, tampil/sembunyi, batas cetak). Butuh migrasi 0031. */
  receiptTemplate?: Partial<import('./receipt-template').ReceiptTemplate>;
}
export const ROUNDING_STEPS = [0, 50, 100, 500, 1000] as const;
export const ORDER_TYPES: { id: OrderType; label: string }[] = [
  { id: 'dine_in', label: 'Makan di tempat' }, { id: 'takeaway', label: 'Bawa pulang' }, { id: 'delivery', label: 'Antar' }, { id: 'service', label: 'Jasa' },
];

/** Pesan galat pertama untuk pengaturan outlet, atau null bila sah. Dipakai form dan lapisan data. */
export function outletOptionsProblem(o: OutletOptions): string | null {
  if (!Number.isFinite(o.serviceChargePct) || o.serviceChargePct < 0 || o.serviceChargePct > 100) return 'Biaya layanan harus antara 0 dan 100 persen.';
  if (o.serviceChargePct > 0 && o.serviceChargeOrderTypes.length === 0) return 'Pilih minimal satu jenis pesanan yang dikenai biaya layanan.';
  for (const step of [o.roundingCashStep, o.roundingNoncashStep]) if (!Number.isInteger(step) || step < 0 || step > 1000) return 'Pembulatan harus bilangan bulat 0 sampai 1.000 rupiah.';
  if (o.receiptFooter.length > 300) return 'Catatan kaki struk maksimal 300 karakter.';
  if ((o.receiptHeader ?? '').length > 200) return 'Teks kepala struk maksimal 200 karakter.';
  if ((o.receiptHeader ?? '').split('\n').length > 4) return 'Teks kepala struk maksimal 4 baris.';
  if (o.receiptTemplate) { const tp = receiptTemplateProblem(o.receiptTemplate); if (tp) return tp; }
  for (const [v, label] of [[o.cashOutDailyLimit, 'Batas kas keluar harian'], [o.defaultOpeningCash, 'Modal awal bawaan']] as const) {
    if (v == null) continue;
    if (!Number.isInteger(v) || v < 0 || v > 1_000_000_000) return `${label} harus bilangan bulat rupiah antara 0 dan 1.000.000.000, atau dikosongkan.`;
  }
  return null;
}
export function outletInfoProblem(i: Pick<OutletInfo, 'name' | 'address' | 'phone'>): string | null {
  if (!i.name.trim()) return 'Nama outlet wajib diisi.';
  if (i.name.trim().length > 80) return 'Nama outlet maksimal 80 karakter.';
  if (i.phone.trim() && !/^[0-9+()\-\s]{6,20}$/.test(i.phone.trim())) return 'Nomor telepon hanya boleh berisi angka, spasi, +, - dan tanda kurung.';
  return null;
}


/** Pajak (PB1) yang bisa dinyalakan atau dimatikan per outlet. Mati = pesanan tidak dikenai pajak. */
export interface TaxSettings {
  enabled: boolean; name: string;
  /** persen, 0 sampai 100 */
  rate: number;
  /** true = harga menu sudah termasuk pajak; false = pajak ditambahkan di atas harga menu */
  inclusive: boolean;
  /** cakupan perhitungan: per_order (bawaan) atau per_product */
  taxMode?: TaxMode;
  /** jenis order yang dikenakan pajak; jika kosong/tidak diisi = semua jenis order */
  orderTypes?: OrderType[];
  /** tarif khusus per jenis order (opsional, jika berbeda dari rate) */
  orderTypeRates?: Partial<Record<OrderType, number>>;
}
export const DEFAULT_TAX: TaxSettings = {
  enabled: false,
  name: 'PB1',
  rate: 10,
  inclusive: false,
  taxMode: 'per_order',
  orderTypes: ['dine_in', 'takeaway', 'delivery', 'service'],
};
export function taxSettingsProblem(t: TaxSettings): string | null {
  if (!t.name.trim()) return 'Nama pajak wajib diisi.';
  if (t.name.trim().length > 40) return 'Nama pajak maksimal 40 karakter.';
  if (!Number.isFinite(t.rate) || t.rate < 0 || t.rate > 100) return 'Tarif pajak harus antara 0 dan 100 persen.';
  if (t.enabled && t.rate === 0 && (!t.orderTypeRates || Object.values(t.orderTypeRates).every((r) => !r || r === 0))) {
    return 'Tarif 0 persen tidak ada gunanya; matikan pajak atau isi tarifnya.';
  }
  if (t.taxMode && t.taxMode !== 'per_order' && t.taxMode !== 'per_product') {
    return 'Mode pajak tidak valid.';
  }
  if (t.orderTypeRates) {
    for (const [k, v] of Object.entries(t.orderTypeRates)) {
      if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 100)) {
        return `Tarif jenis order ${k} harus antara 0 dan 100 persen.`;
      }
    }
  }
  return null;
}
type GrossItem = { qty: number; unitPrice: number; extras?: { price: number }[] };
/** Jumlah harga menu (termasuk ekstra) seluruh baris, sebelum potongan order. */
export const orderGross = (items: GrossItem[]) => items.reduce((a, i) => a + Math.round(i.qty * i.unitPrice) + Math.round(i.qty * (i.extras ?? []).reduce((x, e) => x + e.price, 0)), 0);

/** Pesanan dengan harga sudah termasuk pajak: harga menu seluruh baris lebih besar daripada subtotal bersih yang tersimpan. */
export function isInclusiveOrder(o: { items: GrossItem[]; subtotal: number; taxTotal: number }): boolean {
  return o.taxTotal > 0 && orderGross(o.items) > o.subtotal;
}

/**
 * Angka untuk ditampilkan di tagihan/struk. Harga eksklusif: subtotal, potongan, pajak apa adanya (pajak ditambahkan).
 * Harga inklusif: subtotal = jumlah harga menu, potongan = versi harga menu, dan pajak hanya keterangan "sudah termasuk".
 * Beri `items` (pesanan tersimpan) atau `gross` (hasil hitung di keranjang: CalcResult.grossTotal).
 */
export function taxDisplay(o: { subtotal: number; discountTotal: number; taxTotal: number } & ({ items: GrossItem[] } | { gross: number })) {
  const gross = 'items' in o ? orderGross(o.items) : o.gross;
  const inclusive = o.taxTotal > 0 && gross > o.subtotal;
  if (!inclusive) return { inclusive, subtotal: o.subtotal, discount: o.discountTotal, tax: o.taxTotal };
  return { inclusive, subtotal: gross, discount: Math.max(0, gross - (o.subtotal - o.discountTotal + o.taxTotal)), tax: o.taxTotal };
}
