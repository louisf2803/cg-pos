/** Transfer stok antar lokasi (outlet atau gudang). Aturan simpan dijaga database (migrasi 0024); di sini bentuk data dan pemeriksaan isian. */

export interface StockLocation { id: string; name: string; kind: 'outlet' | 'warehouse' }
export type TransferStatus = 'in_transit' | 'received' | 'cancelled';
export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = { in_transit: 'Dalam perjalanan', received: 'Sudah diterima', cancelled: 'Dibatalkan' };
export interface StockTransferLine { productId: string; name: string; qty: number; receivedQty: number }
export interface StockTransfer {
  id: string; number: string; status: TransferStatus; fromId: string; fromName: string; toId: string; toName: string; note?: string; createdAt: string; lines: StockTransferLine[];
}
export interface StockTransferInput { id: string; fromId: string; toId: string; note?: string; lines: { productId: string; qty: number }[] }

export const TRANSFER_MAX_LINES = 200;
const dec4 = (n: number) => Math.abs(n - Math.round(n * 1e4) / 1e4) < 1e-9;

/** Pesan galat berbahasa Indonesia, atau null bila layak dikirim. */
export interface StockTransferCheckOptions {
  allowNegative?: boolean;
  stockByProduct?: ReadonlyMap<string, number>;
}

export function transferProblem(i: Pick<StockTransferInput, 'fromId' | 'toId' | 'lines'>, opts?: StockTransferCheckOptions): string | null {
  if (!i.fromId || !i.toId) return 'Pilih lokasi asal dan tujuan.';
  if (i.fromId === i.toId) return 'Lokasi asal dan tujuan tidak boleh sama.';
  if (i.lines.length === 0) return 'Tambahkan minimal satu barang.';
  if (i.lines.length > TRANSFER_MAX_LINES) return `Paling banyak ${TRANSFER_MAX_LINES} barang per transfer.`;
  const seen = new Set<string>();
  for (const l of i.lines) {
    if (!l.productId) return 'Ada baris tanpa barang.';
    if (seen.has(l.productId)) return 'Ada barang yang muncul dua kali.';
    seen.add(l.productId);
    if (!Number.isFinite(l.qty) || l.qty <= 0) return 'Jumlah tiap barang harus lebih dari 0.';
    if (l.qty > 1_000_000_000) return 'Jumlah terlalu besar.';
    if (!dec4(l.qty)) return 'Jumlah paling banyak 4 angka di belakang koma.';
  }
  if (opts?.allowNegative === false && opts.stockByProduct) {
    for (const l of i.lines) {
      const avail = opts.stockByProduct.get(l.productId);
      if (avail !== undefined && Math.round((avail - l.qty) * 10000) < 0) {
        return avail <= 0
          ? 'Ada barang yang stoknya habis dan outlet melarang stok minus.'
          : `Jumlah transfer melebihi sisa stok asal (${avail}); outlet melarang stok minus.`;
      }
    }
  }
  return null;
}
