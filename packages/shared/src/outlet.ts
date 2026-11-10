import type { OrderType } from './order-calc';

export interface OutletInfo { code: string; name: string; address: string; phone: string; timezone: string }
export interface OutletOptions {
  serviceChargePct: number; serviceChargeTaxable: boolean; serviceChargeOrderTypes: OrderType[];
  roundingCashStep: number; roundingNoncashStep: number; requireOpenShift: boolean; allowNegativeStock: boolean;
  receiptFooter: string;
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
}
export const DEFAULT_TAX: TaxSettings = { enabled: false, name: 'PB1', rate: 10, inclusive: false };
export function taxSettingsProblem(t: TaxSettings): string | null {
  if (!t.name.trim()) return 'Nama pajak wajib diisi.';
  if (t.name.trim().length > 40) return 'Nama pajak maksimal 40 karakter.';
  if (!Number.isFinite(t.rate) || t.rate < 0 || t.rate > 100) return 'Tarif pajak harus antara 0 dan 100 persen.';
  if (t.enabled && t.rate === 0) return 'Tarif 0 persen tidak ada gunanya; matikan pajak atau isi tarifnya.';
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
