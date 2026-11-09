import type { OrderType } from './order-calc';

export interface OutletInfo { code: string; name: string; address: string; phone: string; timezone: string }
export interface OutletOptions {
  serviceChargePct: number; serviceChargeTaxable: boolean; serviceChargeOrderTypes: OrderType[];
  roundingCashStep: number; roundingNoncashStep: number; requireOpenShift: boolean; allowNegativeStock: boolean;
  receiptFooter: string;
}
export const ROUNDING_STEPS = [0, 50, 100, 500, 1000] as const;
export const ORDER_TYPES: { id: OrderType; label: string }[] = [
  { id: 'dine_in', label: 'Makan di tempat' }, { id: 'takeaway', label: 'Bawa pulang' }, { id: 'delivery', label: 'Antar' }, { id: 'service', label: 'Layanan' },
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
