import { formatRp } from './money';

/** Aturan poin loyalti. Poin didapat dan ditukar dihitung server saat pesanan lunas; ini rumus yang sama untuk tampilan. */
export interface LoyaltyRules { isActive: boolean; earnAmount: number; earnPoints: number; redeemValuePerPoint: number }
export const DEFAULT_LOYALTY: LoyaltyRules = { isActive: false, earnAmount: 10000, earnPoints: 1, redeemValuePerPoint: 100 };
export type LoyaltyKind = 'earn' | 'redeem' | 'adjust' | 'birthday' | 'refund_reverse';
export interface LoyaltyEntry { id: string; customerId: string; orderId?: string; points: number; kind: LoyaltyKind; note?: string; createdAt: string }

export const LOYALTY_KIND_LABEL: Record<LoyaltyKind, string> = {
  earn: 'Poin didapat', redeem: 'Tukar poin', adjust: 'Koreksi manual', birthday: 'Bonus ulang tahun', refund_reverse: 'Penyesuaian refund',
};

export function loyaltyRulesProblem(r: LoyaltyRules): string | null {
  if (!Number.isInteger(r.earnAmount) || r.earnAmount < 1) return 'Kelipatan belanja harus rupiah bulat, minimal Rp 1.';
  if (!Number.isInteger(r.earnPoints) || r.earnPoints < 1 || r.earnPoints > 1000) return 'Poin yang didapat harus bilangan bulat antara 1 dan 1.000.';
  if (!Number.isInteger(r.redeemValuePerPoint) || r.redeemValuePerPoint < 1) return 'Nilai 1 poin harus rupiah bulat, minimal Rp 1.';
  return null;
}

/** Poin yang didapat dari total bayar (kelipatan penuh saja). */
export function earnedPoints(total: number, r: LoyaltyRules): number {
  if (!r.isActive || r.earnAmount <= 0 || r.earnPoints <= 0 || total <= 0) return 0;
  return Math.floor(total / r.earnAmount) * r.earnPoints;
}
export const redeemAmount = (points: number, r: LoyaltyRules) => points * r.redeemValuePerPoint;
/** Poin maksimal yang bisa ditukar: dibatasi saldo dan sisa tagihan (tidak boleh potongan melebihi belanja). */
export function maxRedeemPoints(balance: number, remaining: number, r: LoyaltyRules): number {
  if (!r.isActive || r.redeemValuePerPoint <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(balance), Math.floor(remaining / r.redeemValuePerPoint)));
}
export function redeemProblem(points: number, balance: number, remaining: number, r: LoyaltyRules): string | null {
  if (!r.isActive) return 'Loyalti belum diaktifkan.';
  if (!Number.isInteger(points) || points < 1) return 'Isi jumlah poin yang ditukar.';
  if (points > balance) return `Saldo poin hanya ${balance}.`;
  if (redeemAmount(points, r) > remaining) return `Potongan tidak boleh melebihi sisa tagihan (maksimal ${maxRedeemPoints(balance, remaining, r)} poin = ${formatRp(redeemAmount(maxRedeemPoints(balance, remaining, r), r))}).`;
  return null;
}
export interface LoyaltyProductReward {
  id: string;
  productId: string;
  productName?: string;
  pointsCost: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export function loyaltyRewardProblem(reward: { productId: string; pointsCost: number }): string | null {
  if (!reward.productId?.trim()) return 'Pilih produk hadiah terlebih dahulu.';
  if (!Number.isInteger(reward.pointsCost) || reward.pointsCost < 1) return 'Poin yang dibutuhkan harus bilangan bulat minimal 1.';
  return null;
}

/** Perubahan poin akibat refund: poin didapat dikurangi, poin tukar dikembalikan, sebanding bagian yang di-refund. */
export function refundPointsDelta(earned: number, redeemed: number, refundTotal: number, paidTotal: number): number {
  if (paidTotal <= 0) return 0;
  return Math.floor((redeemed * refundTotal) / paidTotal) - Math.floor((earned * refundTotal) / paidTotal);
}
