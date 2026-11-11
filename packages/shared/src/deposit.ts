/**
 * Helper murni untuk paket deposit dan ringkasan laporan deposit (Penjualan & Refund).
 */

export interface DepositPackage {
  id: string;
  name: string;
  /** Saldo deposit yang diterima pelanggan saat membeli paket (bilangan bulat rupiah). */
  creditAmount: number;
  /** Harga jual paket kepada pelanggan (bisa lebih kecil dari creditAmount jika ada bonus). */
  salePrice: number;
  isActive: boolean;
  /** Jumlah kali paket pernah terjual; paket yang pernah terjual tidak boleh dihapus permanen. */
  soldCount: number;
  note?: string;
}

export interface DepositSaleRecord {
  id: string;
  occurredAt: string;
  customerName: string;
  packageName: string;
  salePrice: number;
  creditAmount: number;
  methodName: string;
  orderNumber: string;
}

export interface DepositRefundRecord {
  id: string;
  occurredAt: string;
  customerName: string;
  amount: number;
  reason: string;
  processedBy: string;
}

/** Hitung nilai bonus deposit yang diberikan ke pelanggan (0 bila tidak ada bonus). */
export function depositBonusAmount(pkg: Pick<DepositPackage, 'creditAmount' | 'salePrice'>): number {
  return Math.max(0, Math.round(pkg.creditAmount - pkg.salePrice));
}

/** Hitung persentase bonus dibanding harga jual (dibulatkan ke 1 desimal). */
export function depositBonusPct(pkg: Pick<DepositPackage, 'creditAmount' | 'salePrice'>): number {
  if (pkg.salePrice <= 0) return 0;
  const bonus = depositBonusAmount(pkg);
  if (bonus <= 0) return 0;
  return Math.round((bonus / pkg.salePrice) * 1000) / 10;
}

/** Periksa apakah paket boleh dihapus permanen (hanya bila belum pernah terjual). */
export function canDeleteDepositPackage(pkg: Pick<DepositPackage, 'soldCount'>): boolean {
  return pkg.soldCount <= 0;
}

/** Validasi input paket deposit. Mengembalikan pesan galat Bahasa Indonesia atau null. */
export function depositPackageProblem(
  input: Pick<DepositPackage, 'name' | 'creditAmount' | 'salePrice'>,
): string | null {
  const trimmed = input.name.trim();
  if (!trimmed) return 'Nama paket deposit wajib diisi.';
  if (trimmed.length > 80) return 'Nama paket deposit maksimal 80 karakter.';
  if (!Number.isInteger(input.creditAmount) || input.creditAmount < 1000) {
    return 'Nominal saldo yang didapat minimal Rp 1.000 (bilangan bulat).';
  }
  if (!Number.isInteger(input.salePrice) || input.salePrice < 1000) {
    return 'Harga jual paket minimal Rp 1.000 (bilangan bulat).';
  }
  if (input.salePrice > input.creditAmount) {
    return 'Harga jual paket tidak boleh lebih mahal dari nominal saldo yang didapat pelanggan.';
  }
  return null;
}

export function summarizeDepositSales(records: readonly DepositSaleRecord[]): {
  count: number;
  totalSalePrice: number;
  totalCreditGiven: number;
  totalBonus: number;
} {
  let totalSalePrice = 0;
  let totalCreditGiven = 0;
  for (const r of records) {
    totalSalePrice += r.salePrice;
    totalCreditGiven += r.creditAmount;
  }
  return {
    count: records.length,
    totalSalePrice,
    totalCreditGiven,
    totalBonus: Math.max(0, totalCreditGiven - totalSalePrice),
  };
}

export function summarizeDepositRefunds(records: readonly DepositRefundRecord[]): {
  count: number;
  totalRefundAmount: number;
} {
  let totalRefundAmount = 0;
  for (const r of records) {
    totalRefundAmount += r.amount;
  }
  return {
    count: records.length,
    totalRefundAmount,
  };
}

