/** Kode otorisasi: kode sekali pakai dari manajer/pemilik sebagai pengganti PIN di depan kasir. Aturan dijaga juga oleh database (migrasi 0020). */
export type AuthCodePermission = 'void_order' | 'complimentary' | 'refund' | 'manual_discount';
export type AuthCodeStatus = 'active' | 'used' | 'revoked' | 'expired';

export const AUTH_CODE_LENGTH = 8;
export const AUTH_CODE_TTL_OPTIONS = [5, 15, 30, 60] as const;
/** Tindakan yang bisa memakai kode di kasir saat ini. Database mengenal lebih banyak, tetapi layar kasir belum menerimanya. */
export const AUTH_CODE_ACTIONS: { id: AuthCodePermission; label: string }[] = [
  { id: 'void_order', label: 'Membatalkan pesanan' },
  { id: 'complimentary', label: 'Membayar gratis (komplimen)' },
];
export const AUTH_CODE_STATUS_LABEL: Record<AuthCodeStatus, string> = { active: 'Aktif', used: 'Sudah dipakai', revoked: 'Dibatalkan', expired: 'Kedaluwarsa' };

export interface IssuedAuthCode { id: string; code: string; expiresAt: string }
export interface AuthCodeRow {
  id: string; permission: AuthCodePermission; status: AuthCodeStatus; note?: string; issuedBy: string; issuerEmail?: string;
  issuedAt: string; expiresAt: string; usedAt?: string; usedOrderNumber?: string; revokedAt?: string;
}

/** Buang spasi dan tanda hubung supaya "1234 5678" dan "1234-5678" sama dengan "12345678". */
export const normalizeAuthCode = (s: string) => s.replace(/[\s-]/g, '');
/** Tampilan 4 + 4 angka agar mudah dibacakan lewat telepon. */
export const formatAuthCode = (code: string) => (code.length === AUTH_CODE_LENGTH ? `${code.slice(0, 4)} ${code.slice(4)}` : code);
/** Pesan galat untuk isian kode, atau null bila bentuknya benar. */
export function authCodeProblem(raw: string): string | null {
  const c = normalizeAuthCode(raw);
  if (!c) return 'Isi kode otorisasi.';
  if (!/^\d+$/.test(c)) return 'Kode hanya berisi angka.';
  if (c.length !== AUTH_CODE_LENGTH) return `Kode terdiri dari ${AUTH_CODE_LENGTH} angka.`;
  return null;
}
