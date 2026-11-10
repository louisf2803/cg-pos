/** Pembelian stok: pemasok, pemesanan (PO), faktur pembelian, penerimaan, dan pembayaran. Rumus sama dengan fungsi server `purchase_*`. */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

export interface Supplier {
  id: string; code?: string; name: string; phone?: string; email?: string; address?: string; termDays: number; isActive: boolean;
}
export interface SupplierInput {
  id?: string; code?: string; name: string; phone?: string; email?: string; address?: string; termDays: number; isActive?: boolean;
}
export const MAX_TERM_DAYS = 3650;

export function supplierProblem(i: SupplierInput): string | null {
  if (!i.name.trim()) return 'Nama pemasok wajib diisi.';
  if (i.name.trim().length > 100) return 'Nama pemasok terlalu panjang (maksimal 100 huruf).';
  if (!Number.isInteger(i.termDays) || i.termDays < 0 || i.termDays > MAX_TERM_DAYS) return 'Termin bayar harus bilangan bulat 0 sampai 3650 hari.';
  if (i.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email.trim())) return 'Format email belum benar.';
  if ((i.phone ?? '').trim().length > 30) return 'Nomor telepon terlalu panjang.';
  if ((i.address ?? '').trim().length > 200) return 'Alamat terlalu panjang (maksimal 200 huruf).';
  return null;
}

/** Satu satuan beli untuk sebuah barang. `conversion` = berapa satuan dasar dalam satu satuan ini. */
export interface PurchaseUnit { unitId: string; name: string; conversion: number; isBase: boolean; buyPrice: number }
/** Barang yang bisa dibeli: yang stoknya dilacak. */
export interface PurchaseItem { productId: string; name: string; kind: 'goods' | 'ingredient'; baseUnit: string; avgCost: number; units: PurchaseUnit[] }
export interface PayAccount { id: string; code: string; name: string }

export interface PurchaseLineInput {
  productId: string; unitId: string; qty: number; unitPrice: number; discount?: number;
  /** hanya faktur: jumlah yang sudah diterima saat faktur dibuat (bawaan: semua) */
  receivedQty?: number;
}
export interface PurchaseLine {
  id: string; productId: string; name: string; unitId: string; unit: string; qty: number; receivedQty: number; unitPrice: number; discount: number; lineTotal: number;
}

export const MAX_PURCHASE_LINES = 500;

export const purchaseLineTotal = (qty: number, unitPrice: number, discount = 0) => round2(qty * unitPrice - discount);
export const purchaseSubtotal = (lines: { qty: number; unitPrice: number; discount?: number }[]) =>
  round2(lines.reduce((n, l) => n + purchaseLineTotal(l.qty, l.unitPrice, l.discount ?? 0), 0));
export const purchaseTotal = (lines: { qty: number; unitPrice: number; discount?: number }[], discount: number, tax: number, other: number) =>
  round2(purchaseSubtotal(lines) - discount + tax + other);

/**
 * Biaya per satuan dasar saat barang diterima: nilai baris per satuan beli, ditambah bagian diskon dan biaya lain faktur
 * (pajak masukan tidak ikut), dibagi konversi satuan.
 */
export function purchaseUnitCost(line: { qty: number; unitPrice: number; discount?: number }, conversion: number, invoice: { subtotal: number; discount: number; otherCost: number }): number {
  const factor = invoice.subtotal > 0 ? (invoice.subtotal - invoice.discount + invoice.otherCost) / invoice.subtotal : 1;
  return round4(((purchaseLineTotal(line.qty, line.unitPrice, line.discount ?? 0) / line.qty) * factor) / conversion);
}

type Money = { discount: number; tax: number; otherCost: number };

function linesProblem(lines: PurchaseLineInput[], m: Money): string | null {
  if (lines.length === 0) return 'Isi minimal satu barang.';
  if (lines.length > MAX_PURCHASE_LINES) return `Satu dokumen paling banyak ${MAX_PURCHASE_LINES} baris.`;
  for (const l of lines) {
    if (!Number.isFinite(l.qty) || l.qty <= 0) return 'Jumlah barang harus lebih dari nol.';
    if (round4(l.qty) !== l.qty) return 'Jumlah paling banyak 4 angka di belakang koma.';
    if (l.qty > 1_000_000_000) return 'Jumlah terlalu besar.';
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) return 'Harga beli tidak boleh negatif.';
    if (l.unitPrice > 1_000_000_000_000) return 'Harga beli terlalu besar.';
    const d = l.discount ?? 0;
    if (!Number.isFinite(d) || d < 0 || d > l.qty * l.unitPrice) return 'Diskon baris tidak boleh negatif atau melebihi nilai baris.';
    if (l.receivedQty !== undefined && (!Number.isFinite(l.receivedQty) || l.receivedQty < 0 || l.receivedQty > l.qty || round4(l.receivedQty) !== l.receivedQty)) return 'Jumlah diterima tidak boleh melebihi jumlah pesanan.';
  }
  for (const v of [m.discount, m.tax, m.otherCost]) if (!Number.isFinite(v) || v < 0) return 'Diskon, pajak, dan biaya lain tidak boleh negatif.';
  if (m.discount > purchaseSubtotal(lines)) return 'Diskon melebihi nilai pembelian.';
  return null;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';
export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Draf', ordered: 'Dipesan', partially_received: 'Diterima sebagian', received: 'Diterima', cancelled: 'Dibatalkan',
};
export interface PurchaseOrderInput extends Money {
  id: string; supplierId: string; orderDate?: string; expectedDate?: string; note?: string; status: 'draft' | 'ordered' | 'cancelled'; lines: PurchaseLineInput[];
}
export interface PurchaseOrder {
  id: string; number: string; supplierId: string; supplierName: string; status: PurchaseOrderStatus; orderDate: string; expectedDate?: string;
  discount: number; taxAmount: number; otherCost: number; total: number; note?: string; lines: PurchaseLine[];
}
export interface PurchaseOrderSummary {
  id: string; number: string; supplierId: string; supplierName: string; status: PurchaseOrderStatus; orderDate: string; expectedDate?: string; total: number; lineCount: number;
}
export function purchaseOrderProblem(i: PurchaseOrderInput): string | null {
  if (!i.supplierId) return 'Pilih pemasok.';
  if ((i.note ?? '').trim().length > 200) return 'Catatan terlalu panjang (maksimal 200 huruf).';
  if (i.status === 'cancelled' && i.lines.length === 0) return null;
  return linesProblem(i.lines, i);
}

export type PurchaseInvoiceStatus = 'open' | 'partially_paid' | 'paid' | 'void';
export const INVOICE_STATUS_LABEL: Record<PurchaseInvoiceStatus, string> = { open: 'Belum dibayar', partially_paid: 'Dibayar sebagian', paid: 'Lunas', void: 'Batal' };
export interface PurchaseInvoiceInput extends Money {
  id: string; supplierId?: string | null; orderId?: string | null; supplierInvoiceNo?: string; invoiceDate?: string;
  /** kosong = ikut termin pemasok */
  termDays?: number; note?: string; lines: PurchaseLineInput[];
}
export interface PurchasePayment { id: string; number: string; paidAt: string; accountName: string; amount: number; note?: string }
export interface PurchaseInvoice {
  id: string; number: string; supplierId?: string; supplierName: string; orderId?: string; supplierInvoiceNo?: string; invoiceDate: string; dueDate?: string; termDays: number;
  status: PurchaseInvoiceStatus; subtotal: number; discount: number; taxAmount: number; otherCost: number; total: number; paidTotal: number; outstanding: number;
  note?: string; lines: PurchaseLine[]; payments: PurchasePayment[];
}
export interface PurchaseInvoiceSummary {
  id: string; number: string; supplierId?: string; supplierName: string; supplierInvoiceNo?: string; invoiceDate: string; dueDate?: string; status: PurchaseInvoiceStatus;
  total: number; paidTotal: number; outstanding: number; fullyReceived: boolean;
}
export function purchaseInvoiceProblem(i: PurchaseInvoiceInput): string | null {
  if ((i.note ?? '').trim().length > 200) return 'Catatan terlalu panjang (maksimal 200 huruf).';
  if ((i.supplierInvoiceNo ?? '').trim().length > 60) return 'Nomor faktur pemasok terlalu panjang.';
  if (i.termDays !== undefined && (!Number.isInteger(i.termDays) || i.termDays < 0 || i.termDays > MAX_TERM_DAYS)) return 'Termin bayar harus bilangan bulat 0 sampai 3650 hari.';
  return linesProblem(i.lines, i);
}

export interface PurchaseReceiveInput { id: string; invoiceId: string; note?: string; items: { lineId: string; qty: number }[] }
export function purchaseReceiveProblem(i: PurchaseReceiveInput, lines: { id: string; qty: number; receivedQty: number }[]): string | null {
  const items = i.items.filter((x) => x.qty > 0);
  if (items.length === 0) return 'Isi jumlah yang diterima.';
  for (const it of items) {
    if (!Number.isFinite(it.qty) || round4(it.qty) !== it.qty) return 'Jumlah paling banyak 4 angka di belakang koma.';
    const l = lines.find((x) => x.id === it.lineId);
    if (!l) return 'Baris faktur tidak ditemukan.';
    if (it.qty > round4(l.qty - l.receivedQty)) return 'Jumlah diterima melebihi sisa pesanan.';
  }
  return null;
}

export interface PurchasePayInput { id: string; invoiceId: string; accountId: string; amount: number; paidAt?: string; note?: string }
export function purchasePayProblem(i: PurchasePayInput, outstanding: number): string | null {
  if (!i.accountId) return 'Pilih akun kas atau bank.';
  if (!Number.isFinite(i.amount) || i.amount <= 0) return 'Isi jumlah bayar lebih dari nol.';
  if (round2(i.amount) !== i.amount) return 'Jumlah bayar paling banyak 2 angka di belakang koma.';
  if (i.amount > outstanding) return 'Jumlah bayar melebihi sisa hutang.';
  if ((i.note ?? '').trim().length > 200) return 'Catatan terlalu panjang (maksimal 200 huruf).';
  return null;
}

export const addDays = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** Lewat jatuh tempo: belum lunas dan jatuh tempo sebelum hari ini. */
export const invoiceOverdue = (i: { status: PurchaseInvoiceStatus; dueDate?: string }, today: string) =>
  (i.status === 'open' || i.status === 'partially_paid') && !!i.dueDate && i.dueDate < today;
export const invoiceOutstanding = (total: number, paid: number) => round2(total - paid);
export const invoiceStatusFor = (total: number, paid: number): PurchaseInvoiceStatus => (paid >= total ? 'paid' : paid > 0 ? 'partially_paid' : 'open');
