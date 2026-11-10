/** Log aktivitas: siapa mengubah apa dan kapan. Dicatat oleh database (migrasi 0021); di sini hanya bentuk data dan teks tampilan. */

export interface ActivityChange { column: string; from: unknown; to: unknown }
export interface ActivityRow {
  id: string; at: string; action: string; entity: string; entityId?: string; outletId?: string;
  actorUserId?: string; actorEmail?: string;
  /** Nama benda yang diubah (produk, karyawan, ...), bila ada. */
  name?: string;
  changes: ActivityChange[];
}
export interface ActivityQuery { from?: string; to?: string; entity?: string; limit?: number }

export const ENTITY_LABEL: Record<string, string> = {
  product: 'Produk', product_unit: 'Satuan produk', category: 'Kategori', department: 'Departemen', unit: 'Satuan',
  payment_method: 'Metode pembayaran', outlet: 'Outlet', outlet_settings: 'Pengaturan outlet', employee: 'Karyawan', tax: 'Pajak',
  promotion: 'Promo', coupon: 'Kupon', extra_group: 'Produk ekstra', floor: 'Lantai', table: 'Meja', supplier: 'Pemasok',
  account: 'Akun keuangan', loyalty_rules: 'Aturan loyalti', price_schedule: 'Jadwal harga', customer_group: 'Grup pelanggan',
  member: 'Akses pengguna', recipe: 'Resep', stock_transfer: 'Transfer stok', order: 'Pesanan', gateway: 'Pembayaran online', loyalty: 'Loyalti',
};
/** Pilihan penyaring di layar: hanya benda yang dicatat oleh pemicu database. */
export const ACTIVITY_FILTERS: { id: string; label: string }[] = Object.entries(ENTITY_LABEL)
  .filter(([id]) => !['order', 'gateway', 'loyalty'].includes(id)).map(([id, label]) => ({ id, label }));

const VERB: Record<string, string> = { created: 'dibuat', updated: 'diubah', deleted: 'diarsipkan', restored: 'dipulihkan', removed: 'dihapus permanen' };
/** Kejadian sistem (bukan perubahan pengaturan) punya kalimat sendiri. */
const SYSTEM_ACTION: Record<string, string> = {
  'employee.pin_changed': 'PIN karyawan diganti',
  'gateway.amount_mismatch': 'Jumlah pembayaran online tidak cocok dengan pesanan',
  'gateway.late_payment': 'Pembayaran online masuk setelah pesanan ditutup',
  'loyalty.paid_failed': 'Poin loyalti gagal dicatat saat pembayaran',
  'loyalty.refund_failed': 'Poin loyalti gagal dikembalikan saat refund',
  'order.finalize_failed': 'Pesanan gagal diselesaikan di server',
};

export const COLUMN_LABEL: Record<string, string> = {
  name: 'Nama', code: 'Kode', description: 'Deskripsi', price: 'Harga jual', cost: 'Harga pokok', is_active: 'Aktif', sku: 'SKU', barcode: 'Barcode',
  category_id: 'Kategori', department_id: 'Departemen', unit_id: 'Satuan', track_stock: 'Lacak stok', allow_price_override: 'Harga boleh diubah kasir',
  max_price_override_pct: 'Batas ubah harga (%)', role: 'Peran', email: 'Email', phone: 'Telepon', rate: 'Tarif', value: 'Nilai', kind: 'Jenis',
  min_spend: 'Belanja minimum', starts_at: 'Mulai', ends_at: 'Berakhir', usage_limit: 'Batas pemakaian', valid_from: 'Berlaku dari', valid_to: 'Berlaku sampai',
  address: 'Alamat', city: 'Kota', service_charge_rate: 'Biaya layanan (%)', rounding_step: 'Pembulatan', timezone: 'Zona waktu',
  is_default: 'Bawaan', sort_order: 'Urutan', capacity: 'Kapasitas', permissions: 'Hak akses', is_enabled: 'Aktif', points_per_amount: 'Poin per belanja',
  lines: 'Bahan', redeem_value: 'Nilai tukar poin', min_redeem_points: 'Minimum tukar poin', category: 'Kelompok', systemKey: 'Kunci sistem',
};
const labelize = (col: string) => COLUMN_LABEL[col] ?? col.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const columnLabel = labelize;

export interface ActivityLine { headline: string; kind: 'change' | 'system' }
/** Kalimat ringkas, mis. "Produk diubah: Kopi susu" atau "PIN karyawan diganti: Sari". */
export function describeActivity(row: Pick<ActivityRow, 'action' | 'entity' | 'name'>): ActivityLine {
  const sys = SYSTEM_ACTION[row.action];
  const name = row.name ? `: ${row.name}` : '';
  if (sys) return { headline: `${sys}${name}`, kind: 'system' };
  const verb = row.action.split('.')[1] ?? '';
  const noun = ENTITY_LABEL[row.entity] ?? row.entity;
  return VERB[verb] ? { headline: `${noun} ${VERB[verb]}${name}`, kind: 'change' } : { headline: `${row.action}${name}`, kind: 'system' };
}

/** Nilai di log selalu terpotong 200 huruf oleh database; di sini dibuat enak dibaca. */
export function formatActivityValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'kosong';
  if (v === true) return 'ya';
  if (v === false) return 'tidak';
  if (typeof v === 'number') return new Intl.NumberFormat('id-ID').format(v);
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 79)}…` : s;
}

/** Ubah hasil database (`{kolom: [lama, baru]}`) menjadi daftar urut abjad kolom; bentuk salah diabaikan. */
export function parseChanges(raw: unknown): ActivityChange[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, v]) => Array.isArray(v) && v.length === 2)
    .map(([column, v]) => ({ column, from: (v as unknown[])[0], to: (v as unknown[])[1] }))
    .sort((a, b) => a.column.localeCompare(b.column));
}
