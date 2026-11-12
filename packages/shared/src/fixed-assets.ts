// Aset tetap (migrasi 0040): tipe, validasi, dan jadwal penyusutan garis lurus. Hitungan di sini mencerminkan fungsi server
// pos.fixed_asset_depreciate: mulai bulan SETELAH bulan perolehan, (harga - sisa) / umur dibulatkan 2 desimal, bulan terakhir menghabiskan sisa.
// Rancangan fitur ini dibuat Claude atas arahan Louis (12 Nov 2026): halaman asetnya tidak bisa dilihat di Majoo.

export type FixedAssetStatus = 'active' | 'disposed';

export interface FixedAsset {
  id: string;
  name: string;
  /** yyyy-mm-dd */
  acquiredOn: string;
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  outletId?: string;
  status: FixedAssetStatus;
  /** Total penyusutan yang sudah dicatat. */
  accumulatedDepreciation: number;
  /** cost - accumulatedDepreciation */
  bookValue: number;
  monthsDepreciated: number;
}

export interface FixedAssetInput {
  id?: string;
  name: string;
  acquiredOn: string;
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  outletId?: string | null;
  /** Akun kas/bank yang dikurangi; kosong = hanya mencatat aset (saldo awal), tanpa jurnal perolehan. */
  payAccountId?: string | null;
}

export interface FixedAssetDisposalInput {
  assetId: string;
  /** yyyy-mm-dd, tidak sebelum perolehan dan tidak di masa depan. */
  date: string;
  /** Hasil penjualan (0 bila dibuang). */
  proceeds: number;
  cashAccountId?: string | null;
  gainLossAccountId?: string | null;
}

export interface AssetDepreciationEntry { assetId: string; /** yyyy-mm-01 */ period: string; amount: number }
export interface DepreciationRunResult { period: string; assets: number; total: number }

export const ASSET_NAME_MAX = 120;
export const ASSET_MAX_LIFE_MONTHS = 600;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function fixedAssetProblem(input: FixedAssetInput): string | null {
  const name = input.name.trim();
  if (!name) return 'Nama aset wajib diisi.';
  if (name.length > ASSET_NAME_MAX) return `Nama aset maksimal ${ASSET_NAME_MAX} huruf.`;
  if (!isoDate.test(input.acquiredOn) || Number.isNaN(Date.parse(input.acquiredOn))) return 'Tanggal perolehan tidak valid.';
  if (!Number.isInteger(input.cost) || input.cost <= 0) return 'Harga perolehan harus bilangan bulat rupiah lebih dari 0.';
  if (!Number.isInteger(input.salvageValue) || input.salvageValue < 0) return 'Nilai sisa harus bilangan bulat rupiah, 0 atau lebih.';
  if (input.salvageValue >= input.cost) return 'Nilai sisa harus lebih kecil dari harga perolehan.';
  if (!Number.isInteger(input.usefulLifeMonths) || input.usefulLifeMonths < 1 || input.usefulLifeMonths > ASSET_MAX_LIFE_MONTHS) return `Umur manfaat harus 1 sampai ${ASSET_MAX_LIFE_MONTHS} bulan.`;
  return null;
}

export function disposalProblem(asset: Pick<FixedAsset, 'acquiredOn' | 'status' | 'cost' | 'accumulatedDepreciation'>, input: FixedAssetDisposalInput, today: string): string | null {
  if (asset.status !== 'active') return 'Aset ini sudah dilepas.';
  if (!isoDate.test(input.date)) return 'Tanggal pelepasan tidak valid.';
  if (input.date < asset.acquiredOn) return 'Tanggal pelepasan tidak boleh sebelum tanggal perolehan.';
  if (input.date > today) return 'Tanggal pelepasan tidak boleh di masa depan.';
  if (!Number.isInteger(input.proceeds) || input.proceeds < 0) return 'Hasil penjualan harus bilangan bulat rupiah, 0 atau lebih.';
  if (input.proceeds > 0 && !input.cashAccountId) return 'Pilih akun kas/bank penerima hasil penjualan.';
  if (disposalGainLoss(asset, input.proceeds) !== 0 && !input.gainLossAccountId) return 'Pilih akun laba/rugi pelepasan aset.';
  return null;
}

/** Laba (+) atau rugi (-) saat dilepas: hasil + akumulasi penyusutan - harga perolehan. */
export function disposalGainLoss(asset: Pick<FixedAsset, 'cost' | 'accumulatedDepreciation'>, proceeds: number): number {
  return round2(proceeds + asset.accumulatedDepreciation - asset.cost);
}

/** Penyusutan per bulan (belum termasuk penyesuaian bulan terakhir). */
export function monthlyDepreciation(cost: number, salvage: number, lifeMonths: number): number {
  return round2((cost - salvage) / lifeMonths);
}

/** Bulan pertama disusutkan: bulan setelah bulan perolehan (yyyy-mm-01). */
export function firstDepreciationPeriod(acquiredOn: string): string {
  const [y, m] = acquiredOn.split('-').map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

function addMonths(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}-01`;
}

/** Jadwal lengkap penyusutan seumur aset; jumlahnya selalu = harga - nilai sisa. */
export function depreciationSchedule(asset: Pick<FixedAsset, 'acquiredOn' | 'cost' | 'salvageValue' | 'usefulLifeMonths'>): { period: string; amount: number }[] {
  const start = firstDepreciationPeriod(asset.acquiredOn);
  const base = monthlyDepreciation(asset.cost, asset.salvageValue, asset.usefulLifeMonths);
  const out: { period: string; amount: number }[] = [];
  let sum = 0;
  for (let i = 0; i < asset.usefulLifeMonths; i++) {
    const amount = i === asset.usefulLifeMonths - 1 ? round2(asset.cost - asset.salvageValue - sum) : base;
    out.push({ period: addMonths(start, i), amount });
    sum = round2(sum + amount);
  }
  return out;
}

/** Bulan-bulan jatuh tempo (sampai bulan ini) yang belum dicatat penyusutannya. */
export function pendingPeriods(asset: Pick<FixedAsset, 'acquiredOn' | 'cost' | 'salvageValue' | 'usefulLifeMonths' | 'status'>, done: string[], thisMonth: string): string[] {
  if (asset.status !== 'active') return [];
  const have = new Set(done);
  return depreciationSchedule(asset).filter((s) => s.period <= thisMonth && !have.has(s.period)).map((s) => s.period);
}

/** Ringkasan untuk laporan aset tetap. */
export function summarizeAssets(assets: FixedAsset[]): { count: number; active: number; cost: number; accumulated: number; bookValue: number } {
  const active = assets.filter((a) => a.status === 'active');
  return {
    count: assets.length,
    active: active.length,
    cost: active.reduce((s, a) => s + a.cost, 0),
    accumulated: round2(active.reduce((s, a) => s + a.accumulatedDepreciation, 0)),
    bookValue: round2(active.reduce((s, a) => s + a.bookValue, 0)),
  };
}
