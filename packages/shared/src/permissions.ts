import type { Employee } from './types';

/**
 * Hak akses per peran di kasir. Tiga hasil:
 *  - allow: peran ini boleh langsung (sudah masuk dengan PIN-nya sendiri, tanpa PIN tambahan)
 *  - approve: harus disetujui manajer/pemilik dengan PIN-nya (bila outlet punya satu)
 *  - deny: tidak tersedia untuk peran ini
 * Ini aturan tampilan dan alur di aplikasi kasir; penjaga sebenarnya tetap di database (RLS dan fungsi server).
 */
export type Role = Employee['role'];
export type Permission = 'sell' | 'move_table' | 'close_shift' | 'void_order' | 'refund' | 'merge_tables' | 'discard_pending' | 'device_settings' | 'see_expected_cash' | 'manual_discount' | 'complimentary' | 'price_override';
export type Access = 'allow' | 'approve' | 'deny';

export const PERMISSIONS: { id: Permission; label: string }[] = [
  { id: 'sell', label: 'Membuat pesanan dan menerima pembayaran' },
  { id: 'move_table', label: 'Memindahkan pesanan ke meja lain' },
  { id: 'close_shift', label: 'Membuka dan menutup kasir' },
  { id: 'price_override', label: 'Mengubah harga satuan produk di kasir' },
  { id: 'manual_discount', label: 'Memberi diskon manual pada pesanan' },
  { id: 'complimentary', label: 'Membayar pesanan dengan gratis (komplimen)' },
  { id: 'merge_tables', label: 'Menggabungkan pesanan antar meja' },
  { id: 'void_order', label: 'Membatalkan pesanan yang belum dibayar' },
  { id: 'refund', label: 'Refund pesanan yang sudah lunas' },
  { id: 'discard_pending', label: 'Menghapus transaksi tertunda dari perangkat' },
  { id: 'see_expected_cash', label: 'Melihat uang yang seharusnya ada di laci sebelum menghitung' },
  { id: 'device_settings', label: 'Mengubah pengaturan perangkat kasir (kunci layar)' },
];

const ALL_ALLOW = Object.fromEntries(PERMISSIONS.map((p) => [p.id, 'allow'])) as Record<Permission, Access>;

export const ROLE_ACCESS: Record<Role, Record<Permission, Access>> = {
  owner: ALL_ALLOW,
  manager: ALL_ALLOW,
  cashier: { ...ALL_ALLOW, price_override: 'approve', manual_discount: 'approve', complimentary: 'approve', merge_tables: 'approve', void_order: 'approve', refund: 'approve', discard_pending: 'approve', device_settings: 'deny', see_expected_cash: 'deny' },
};

export const accessFor = (role: Role, permission: Permission): Access => ROLE_ACCESS[role][permission];

export const ROLE_LABEL: Record<Role, string> = { owner: 'Pemilik', manager: 'Manajer', cashier: 'Kasir' };

/**
 * Pemetaan peran karyawan ke label Bahasa Indonesia:
 * 'owner' / 'Owner' -> 'Pemilik'
 * 'manager' / 'Manager' -> 'Manajer'
 * 'cashier' / 'Cashier' -> 'Kasir'
 * Nilai kosong / tak dikenal kembali ke 'Kasir' (atau nilai aslinya jika sudah Indonesia).
 */
export function formatRole(role?: string | null): string {
  if (!role) return 'Kasir';
  const r = role.toLowerCase().trim();
  if (r === 'owner' || r === 'pemilik') return 'Pemilik';
  if (r === 'manager' || r === 'manajer') return 'Manajer';
  if (r === 'cashier' || r === 'kasir') return 'Kasir';
  return role;
}


/** Pilihan jeda kunci layar otomatis (menit); 0 = mati. */
export const IDLE_LOCK_CHOICES = [0, 1, 2, 5, 10, 15, 30] as const;
export const DEFAULT_IDLE_LOCK_MINUTES = 5;
export const idleLockLabel = (m: number) => (m === 0 ? 'Mati' : `${m} menit`);
/** Nilai tak dikenal (data rusak) kembali ke bawaan. */
export const normalizeIdleLock = (v: unknown): number => (typeof v === 'number' && (IDLE_LOCK_CHOICES as readonly number[]).includes(v) ? v : DEFAULT_IDLE_LOCK_MINUTES);
