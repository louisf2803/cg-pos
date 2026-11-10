import type { PaymentMethod } from './types';

export const PAYMENT_REF_MAX = 120;
export const COMPLIMENTARY_REASON_MIN = 3;

/** Teks isian keterangan pembayaran menurut jenis metode; null = tidak ada isian. */
export function paymentRefField(kind: PaymentMethod['kind']): { label: string; required: boolean; hint: string } | null {
  if (kind === 'complimentary') return { label: 'Alasan gratis', required: true, hint: 'Mis. tamu undangan, kompensasi keluhan, uji rasa' };
  if (kind === 'noncash') return { label: 'Nomor referensi', required: false, hint: 'Nomor struk mesin kartu atau bukti transfer' };
  return null;
}

/** Pesan galat untuk keterangan pembayaran, atau null bila boleh. Komplimen wajib beralasan (juga dijaga trigger database). */
export function paymentRefProblem(kind: PaymentMethod['kind'], ref: string | undefined): string | null {
  const t = (ref ?? '').trim();
  if (t.length > PAYMENT_REF_MAX) return `Keterangan paling banyak ${PAYMENT_REF_MAX} huruf.`;
  if (kind === 'complimentary' && t.length < COMPLIMENTARY_REASON_MIN) return 'Isi alasan gratis (minimal 3 huruf).';
  return null;
}
