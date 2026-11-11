/** Stok: status, validasi, dan rumus biaya rata-rata bergerak (sama dengan trigger `stock_movement_apply` di server). */

export type StockStatus = 'out' | 'negative' | 'low' | 'ok';
export type StockFilter = StockStatus | 'alert';

export interface StockItem {
  productId: string; name: string; kind: 'goods' | 'ingredient'; unit: string;
  qty: number; avgCost: number;
  /** nilai persediaan = qty x biaya rata-rata (0 bila stok minus) */
  value: number;
  minQty?: number; status: StockStatus;
  /** Kategori bahan baku (lihat ingredient-categories.ts), bukan kategori produk jual. Belum ada di semua barang. */
  categoryId?: string; categoryName?: string;
}

export type StockMoveKind =
  | 'sale' | 'sale_void' | 'refund_return' | 'purchase_receipt' | 'purchase_return' | 'transfer_out' | 'transfer_in'
  | 'waste' | 'production_in' | 'production_out' | 'opname_adjust' | 'opening' | 'adjust_in' | 'adjust_out';

export const STOCK_KIND_LABEL: Record<StockMoveKind, string> = {
  sale: 'Terjual', sale_void: 'Penjualan dibatalkan', refund_return: 'Refund dikembalikan ke stok', purchase_receipt: 'Pembelian diterima', purchase_return: 'Retur pembelian',
  transfer_out: 'Transfer keluar', transfer_in: 'Transfer masuk', waste: 'Terbuang', production_in: 'Hasil produksi', production_out: 'Bahan produksi',
  opname_adjust: 'Penyesuaian opname', opening: 'Stok awal', adjust_in: 'Stok masuk', adjust_out: 'Stok keluar',
};

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = { out: 'Habis', negative: 'Minus', low: 'Menipis', ok: 'Aman' };

export interface StockMove {
  id: string; productId: string; kind: StockMoveKind;
  /** bertanda, dalam satuan dasar */
  qtyDelta: number; unitCost: number; totalCost: number; qtyAfter: number; avgCostAfter: number;
  reason?: string; refType?: string; occurredAt: string;
}

/** Jenis yang boleh dicatat manual dari dashboard. */
export type ManualStockKind = 'adjust_in' | 'adjust_out' | 'waste';
export const MANUAL_STOCK_KINDS: ManualStockKind[] = ['adjust_in', 'adjust_out', 'waste'];

export interface StockPostInput {
  /** kunci idempotensi: pengiriman ulang dengan id yang sama tidak menggandakan gerakan */
  id: string; productId: string; kind: ManualStockKind;
  /** selalu positif, satuan dasar, paling banyak 4 desimal */
  qty: number;
  /** hanya untuk stok masuk; kosong = pakai biaya rata-rata saat ini */
  unitCost?: number;
  reason?: string;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function stockStatus(qty: number, min?: number): StockStatus {
  if (qty < 0) return 'negative';
  if (qty === 0) return 'out';
  if (min !== undefined && min > 0 && qty <= min) return 'low';
  return 'ok';
}

/** Perlu perhatian: habis, minus, atau di bawah batas minimum. */
export const needsAttention = (s: StockStatus) => s !== 'ok';

export function stockFilterMatches(item: StockItem, f: StockFilter | undefined): boolean {
  if (!f) return true;
  return f === 'alert' ? needsAttention(item.status) : item.status === f;
}

export function stockSearchMatches(item: StockItem, search: string | undefined): boolean {
  const q = (search ?? '').trim().toLowerCase();
  return !q || item.name.toLowerCase().includes(q);
}

export function makeStockItem(base: Omit<StockItem, 'value' | 'status'>): StockItem {
  return { ...base, value: base.qty > 0 ? Math.round(base.qty * base.avgCost) : 0, status: stockStatus(base.qty, base.minQty) };
}

export interface StockPostCheckOptions {
  allowNegative?: boolean;
  currentQty?: number;
}

export function stockPostProblem(i: StockPostInput, opts?: StockPostCheckOptions): string | null {
  if (!MANUAL_STOCK_KINDS.includes(i.kind)) return 'Jenis gerakan stok tidak dikenal.';
  if (!Number.isFinite(i.qty) || i.qty <= 0) return 'Isi jumlah lebih dari 0.';
  if (round4(i.qty) !== i.qty) return 'Jumlah paling banyak 4 angka di belakang koma.';
  if (i.qty > 1_000_000_000) return 'Jumlah terlalu besar.';
  if (i.kind !== 'adjust_in' && opts?.allowNegative === false && opts.currentQty !== undefined && round4(opts.currentQty - i.qty) < 0) {
    return opts.currentQty <= 0
      ? 'Stok habis dan outlet melarang stok minus.'
      : `Stok hanya tersisa ${opts.currentQty}; outlet melarang stok minus.`;
  }
  if (i.unitCost !== undefined) {
    if (i.kind !== 'adjust_in') return 'Harga hanya untuk stok masuk.';
    if (!Number.isFinite(i.unitCost) || i.unitCost < 0 || i.unitCost > 1_000_000_000) return 'Harga per satuan tidak valid.';
  }
  if (i.reason && i.reason.trim().length > 200) return 'Alasan terlalu panjang (maksimal 200 huruf).';
  return null;
}

/** Biaya rata-rata bergerak: masuk menggeser rata-rata (dimulai ulang bila saldo <= 0), keluar memakai rata-rata saat ini. */
export function applyStockMove(bal: { qty: number; avgCost: number }, delta: number, unitCost: number): { qty: number; avgCost: number; unitCost: number; totalCost: number } {
  if (delta > 0) {
    const avg = bal.qty <= 0 ? unitCost : (bal.qty * bal.avgCost + delta * unitCost) / (bal.qty + delta);
    return { qty: round4(bal.qty + delta), avgCost: round4(avg), unitCost, totalCost: round4(delta * unitCost) };
  }
  return { qty: round4(bal.qty + delta), avgCost: bal.avgCost, unitCost: bal.avgCost, totalCost: round4(delta * bal.avgCost) };
}

// ---------- stok opname ----------

export interface StockOpnameLine {
  productId: string; name: string; unit: string;
  /** jumlah menurut sistem saat baris ini pertama dicatat */
  systemQty: number; countedQty: number; difference: number;
  /** nilai selisih: opname final = biaya gerakan yang tercatat; draf = perkiraan (selisih x biaya rata-rata kini) */
  value: number;
}
export interface StockOpname {
  id: string; number: string; status: 'draft' | 'final'; countedAt: string; finalizedAt?: string; note?: string; lines: StockOpnameLine[];
}
export interface StockOpnameSummary {
  id: string; number: string; status: 'draft' | 'final'; countedAt: string; finalizedAt?: string; note?: string; lineCount: number; diffCount: number;
}
export interface StockOpnameInput {
  /** dibuat perangkat; simpan ulang dengan id yang sama memperbarui draf */
  id: string; note?: string; lines: { productId: string; countedQty: number }[];
}

export const MAX_OPNAME_LINES = 3000;
export const opnameDifference = (systemQty: number, countedQty: number) => round4(countedQty - systemQty);

export function opnameProblem(i: StockOpnameInput): string | null {
  if (i.lines.length > MAX_OPNAME_LINES) return `Satu opname paling banyak ${MAX_OPNAME_LINES} item.`;
  if (i.note && i.note.trim().length > 200) return 'Catatan terlalu panjang (maksimal 200 huruf).';
  const seen = new Set<string>();
  for (const l of i.lines) {
    if (seen.has(l.productId)) return 'Ada item yang dihitung dua kali.';
    seen.add(l.productId);
    if (!Number.isFinite(l.countedQty) || l.countedQty < 0) return 'Jumlah hitung fisik tidak boleh negatif.';
    if (round4(l.countedQty) !== l.countedQty) return 'Jumlah hitung paling banyak 4 angka di belakang koma.';
    if (l.countedQty > 1_000_000_000) return 'Jumlah terlalu besar.';
  }
  return null;
}
