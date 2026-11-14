/** Satuan ganda: satu barang boleh dibeli atau diresepkan dalam satuan lain. Aturan simpan dijaga database (migrasi 0023). */

export interface ProductUnitRow {
  unitId: string; name: string; /** berapa satuan dasar dalam satu satuan ini; satuan dasar selalu 1 */ conversion: number;
  isBase: boolean; buyPrice: number; minPurchase: number;
  /** harga jual di kasir (rupiah); 0 = tidak dijual. Satuan dasar memakai harga produk. */ sellPrice?: number;
  /** sudah dipakai resep, pesanan stok, faktur, atau penjualan: konversinya dikunci dan satuannya tidak bisa diarsipkan */
  inUse: boolean;
}
export interface ProductUnitInput { productId: string; unitName: string; conversion: number; buyPrice?: number; minPurchase?: number; sellPrice?: number }

export const UNIT_NAME_MAX = 30;
const decimals = (n: number, d: number) => Math.abs(n - Math.round(n * 10 ** d) / 10 ** d) < 1e-9;

/** Pesan galat dalam bahasa Indonesia, atau null bila isian layak. */
export function productUnitProblem(i: Pick<ProductUnitInput, 'unitName' | 'conversion' | 'buyPrice' | 'minPurchase' | 'sellPrice'>, baseName?: string): string | null {
  const name = i.unitName.trim();
  if (!name) return 'Isi nama satuan.';
  if (name.length > UNIT_NAME_MAX) return `Nama satuan paling banyak ${UNIT_NAME_MAX} huruf.`;
  if (baseName && name.toLowerCase() === baseName.trim().toLowerCase()) return 'Itu sudah satuan dasar barang ini.';
  if (!Number.isFinite(i.conversion) || i.conversion <= 0) return 'Isi satuan (isinya) harus lebih dari 0.';
  if (i.conversion > 1_000_000) return 'Isi satuan terlalu besar (paling banyak 1.000.000).';
  if (!decimals(i.conversion, 6)) return 'Isi satuan paling banyak 6 angka di belakang koma.';
  const buy = i.buyPrice ?? 0;
  if (!Number.isFinite(buy) || buy < 0) return 'Harga beli tidak boleh minus.';
  if (!decimals(buy, 4)) return 'Harga beli paling banyak 4 angka di belakang koma.';
  const sell = i.sellPrice ?? 0;
  if (!Number.isFinite(sell) || sell < 0 || sell !== Math.round(sell)) return 'Harga jual harus bilangan bulat rupiah, nol atau lebih.';
  const min = i.minPurchase ?? 1;
  if (!Number.isFinite(min) || min <= 0) return 'Minimum beli harus lebih dari 0.';
  if (!decimals(min, 4)) return 'Minimum beli paling banyak 4 angka di belakang koma.';
  return null;
}

/** Kalimat penjelas, mis. "1 kg = 1.000 gram". */
export function describeProductUnit(u: Pick<ProductUnitRow, 'name' | 'conversion'>, baseName: string): string {
  return `1 ${u.name} = ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 }).format(u.conversion)} ${baseName}`;
}
/** Harga beli satuan dasar yang setara, untuk membandingkan harga antar satuan. */
export function buyPricePerBase(u: Pick<ProductUnitRow, 'buyPrice' | 'conversion'>): number {
  return u.conversion > 0 ? Math.round((u.buyPrice / u.conversion) * 10000) / 10000 : 0;
}
