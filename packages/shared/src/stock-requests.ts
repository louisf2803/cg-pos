// Permintaan barang antar lokasi (migrasi 0042). Rancangan Claude atas arahan Louis (12 Nov 2026; Majoo tidak bisa dilihat).
// Alur: diminta -> disetujui/ditolak -> dipenuhi (membuat transfer stok) atau dibatalkan.

export type StockRequestStatus = 'requested' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled';

export const STOCK_REQUEST_STATUS_LABEL: Record<StockRequestStatus, string> = {
  requested: 'Menunggu persetujuan', approved: 'Disetujui', rejected: 'Ditolak', fulfilled: 'Sudah dipenuhi', cancelled: 'Dibatalkan',
};

export interface StockRequestLine { productId: string; name: string; qty: number }

export interface StockRequest {
  id: string;
  number: string;
  status: StockRequestStatus;
  requesterId: string;
  requesterName: string;
  sourceId: string;
  sourceName: string;
  note?: string;
  decisionNote?: string;
  /** Terisi setelah dipenuhi. */
  transferId?: string;
  createdAt: string;
  lines: StockRequestLine[];
}

export interface StockRequestInput { id?: string; requesterId: string; sourceId: string; note?: string; lines: { productId: string; qty: number }[] }

export const STOCK_REQUEST_MAX_LINES = 200;
const dec4 = (n: number) => Math.abs(n - Math.round(n * 1e4) / 1e4) < 1e-9;

export function stockRequestProblem(i: Pick<StockRequestInput, 'requesterId' | 'sourceId' | 'lines' | 'note'>): string | null {
  if (!i.requesterId || !i.sourceId) return 'Pilih lokasi peminta dan lokasi sumber.';
  if (i.requesterId === i.sourceId) return 'Lokasi peminta dan sumber tidak boleh sama.';
  if (i.lines.length === 0) return 'Tambahkan minimal satu barang.';
  if (i.lines.length > STOCK_REQUEST_MAX_LINES) return `Paling banyak ${STOCK_REQUEST_MAX_LINES} barang per permintaan.`;
  if (i.note && i.note.length > 300) return 'Catatan maksimal 300 huruf.';
  const seen = new Set<string>();
  for (const l of i.lines) {
    if (!l.productId) return 'Ada baris tanpa barang.';
    if (seen.has(l.productId)) return 'Ada barang yang muncul dua kali.';
    seen.add(l.productId);
    if (!Number.isFinite(l.qty) || l.qty <= 0) return 'Jumlah tiap barang harus lebih dari 0.';
    if (l.qty > 1_000_000_000) return 'Jumlah terlalu besar.';
    if (!dec4(l.qty)) return 'Jumlah paling banyak 4 angka di belakang koma.';
  }
  return null;
}

/** Tindakan yang masih mungkin pada status ini. */
export function stockRequestActions(status: StockRequestStatus): { decide: boolean; fulfill: boolean; cancel: boolean } {
  return { decide: status === 'requested', fulfill: status === 'approved', cancel: status === 'requested' || status === 'approved' };
}
