// Laporan transaksi QRIS/gateway (A133; migrasi 0133). Hanya membaca; tidak memanggil penyedia pembayaran.
export type QrisTab = 'success' | 'failed' | 'processing' | 'pending';
export const QRIS_TAB_LABEL: Record<QrisTab, string> = { success: 'Berhasil', failed: 'Gagal', processing: 'Diproses', pending: 'Tertunda' };
export const QRIS_TABS: QrisTab[] = ['success', 'failed', 'processing', 'pending'];

export interface GatewayTransaction {
  id: string; outletName: string; reference: string; amount: number; fee: number; status: string;
  createdAt: string; paidAt?: string;
  /** tanggal settlement (YYYY-MM-DD) bila sudah masuk daftar settlement */
  settlementDate?: string; settlementStatus?: 'processing' | 'pending' | 'settled';
}

/** Pengelompokan tab: paid = berhasil; failed/expired/cancelled = gagal; created = diproses; pending/refunded = tertunda. */
export function qrisTab(status: string): QrisTab {
  if (status === 'paid') return 'success';
  if (status === 'failed' || status === 'expired' || status === 'cancelled') return 'failed';
  if (status === 'created') return 'processing';
  return 'pending';
}

export function qrisTotals(rows: GatewayTransaction[]): { count: number; amount: number; fee: number; net: number } {
  const amount = rows.reduce((s, r) => s + r.amount, 0);
  const fee = rows.reduce((s, r) => s + r.fee, 0);
  return { count: rows.length, amount, fee, net: amount - fee };
}

export function qrisCounts(rows: GatewayTransaction[]): Record<QrisTab, number> {
  const c: Record<QrisTab, number> = { success: 0, failed: 0, processing: 0, pending: 0 };
  for (const r of rows) c[qrisTab(r.status)] += 1;
  return c;
}
