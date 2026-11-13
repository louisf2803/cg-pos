// Faktur penjualan (B2B) dengan termin, uang muka, dan pembayaran bertahap (A129; migrasi 0129).
// Berisi tipe, logika murni, dan penyimpanan data palsu untuk mode demo. Server: fungsi pos.sales_invoice_create / pos.sales_invoice_pay.
import { DataError } from './types';

export type SalesInvoiceStatus = 'open' | 'partially_paid' | 'paid';

export const SALES_INVOICE_STATUS_LABEL: Record<SalesInvoiceStatus, string> = {
  open: 'Belum dibayar',
  partially_paid: 'Dibayar sebagian',
  paid: 'Lunas',
};

export interface SalesInvoiceLineInput { productId?: string; name: string; qty: number; unitPrice: number }
export interface SalesInvoiceLine extends SalesInvoiceLineInput { id: string; lineTotal: number }

export interface SalesInvoiceInput {
  /** dibuat klien (idempoten) */
  id: string;
  customerId?: string;
  /** YYYY-MM-DD; kosong = hari ini (Asia/Jakarta) */
  date?: string;
  termDays: number;
  discount: number;
  taxAmount: number;
  /** uang muka yang diterima saat faktur dibuat; > 0 wajib punya accountId */
  downPayment: number;
  accountId?: string;
  note?: string;
  lines: SalesInvoiceLineInput[];
}

export interface SalesInvoicePayInput { id: string; invoiceId: string; accountId: string; date?: string; amount: number; note?: string }

export interface SalesInvoicePayment {
  id: string; paidOn: string; accountId: string; amount: number; isDownPayment: boolean; note?: string;
}

export interface SalesInvoice {
  id: string; number: string; customerId?: string; customerName: string;
  invoiceDate: string; termDays: number; dueDate: string;
  subtotal: number; discount: number; taxAmount: number; total: number;
  downPayment: number; paidTotal: number; outstanding: number;
  status: SalesInvoiceStatus; note?: string;
  lines: SalesInvoiceLine[]; payments: SalesInvoicePayment[];
}

const DAY_MS = 86_400_000;

/** Tambah hari ke tanggal YYYY-MM-DD tanpa terpengaruh zona waktu. */
export function salesDueDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function salesInvoiceTotals(lines: SalesInvoiceLineInput[], discount: number, taxAmount: number): { subtotal: number; total: number } {
  const subtotal = lines.reduce((s, l) => s + Math.round(l.qty * l.unitPrice), 0);
  return { subtotal, total: subtotal - discount + taxAmount };
}

export function salesInvoiceStatus(total: number, paid: number): SalesInvoiceStatus {
  if (paid >= total) return 'paid';
  return paid > 0 ? 'partially_paid' : 'open';
}

/** Lewat jatuh tempo bila belum lunas dan tanggal jatuh tempo sebelum hari ini. */
export function salesInvoiceOverdue(inv: Pick<SalesInvoice, 'status' | 'dueDate'>, today: string): boolean {
  return inv.status !== 'paid' && inv.dueDate < today;
}

export function salesInvoiceProblem(i: SalesInvoiceInput): string | null {
  const whole = (n: number) => Number.isInteger(n) && n >= 0;
  if (i.lines.length === 0) return 'Faktur butuh minimal satu baris barang atau jasa.';
  for (const l of i.lines) {
    if (!l.name.trim() || l.name.trim().length > 120) return 'Nama tiap baris wajib diisi (maksimal 120 huruf).';
    if (!(l.qty > 0) || !Number.isFinite(l.qty)) return 'Jumlah tiap baris harus lebih dari nol.';
    if (!whole(l.unitPrice)) return 'Harga satuan harus bilangan bulat rupiah, tidak negatif.';
  }
  if (!Number.isInteger(i.termDays) || i.termDays < 0 || i.termDays > 3650) return 'Termin pembayaran 0 sampai 3650 hari.';
  if (!whole(i.discount) || !whole(i.taxAmount) || !whole(i.downPayment)) return 'Diskon, pajak, dan uang muka harus bilangan bulat rupiah, tidak negatif.';
  const { subtotal, total } = salesInvoiceTotals(i.lines, i.discount, i.taxAmount);
  if (i.discount > subtotal) return 'Diskon tidak boleh melebihi subtotal.';
  if (i.downPayment > total) return 'Uang muka tidak boleh melebihi total faktur.';
  if (i.downPayment > 0 && !i.accountId) return 'Pilih akun kas atau bank yang menerima uang muka.';
  if (i.date && !/^\d{4}-\d{2}-\d{2}$/.test(i.date)) return 'Tanggal faktur tidak valid.';
  return null;
}

export function salesPayProblem(outstanding: number, amount: number): string | null {
  if (!Number.isInteger(amount) || amount <= 0) return 'Jumlah bayar harus bilangan bulat lebih dari nol.';
  if (amount > outstanding) return 'Jumlah bayar melebihi sisa tagihan.';
  return null;
}

interface FakeDeps {
  customerName: (id: string) => Promise<string | undefined>;
  today: () => string;
  newId: () => string;
}

/** Penyimpanan palsu untuk mode demo; perilakunya sama dengan fungsi server (nomor, status, uang muka sebagai pembayaran pertama). */
export function createFakeSalesInvoices(deps: FakeDeps) {
  const invoices: SalesInvoice[] = [];
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    async listSalesInvoices(): Promise<SalesInvoice[]> {
      return clone([...invoices].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.number.localeCompare(a.number)));
    },
    async createSalesInvoice(input: SalesInvoiceInput): Promise<SalesInvoice> {
      const existing = invoices.find((x) => x.id === input.id);
      if (existing) return clone(existing);
      const problem = salesInvoiceProblem(input);
      if (problem) throw new DataError('invalid', problem);
      const customerName = input.customerId ? await deps.customerName(input.customerId) : undefined;
      if (input.customerId && !customerName) throw new DataError('not_found', 'Pelanggan tidak ditemukan.');
      const date = input.date ?? deps.today();
      const { subtotal, total } = salesInvoiceTotals(input.lines, input.discount, input.taxAmount);
      const inv: SalesInvoice = {
        id: input.id, number: `FJ-${String(invoices.length + 1).padStart(6, '0')}`,
        ...(input.customerId ? { customerId: input.customerId } : {}), customerName: customerName ?? '(tanpa pelanggan)',
        invoiceDate: date, termDays: input.termDays, dueDate: salesDueDate(date, input.termDays),
        subtotal, discount: input.discount, taxAmount: input.taxAmount, total,
        downPayment: input.downPayment, paidTotal: input.downPayment, outstanding: total - input.downPayment,
        status: salesInvoiceStatus(total, input.downPayment),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        lines: input.lines.map((l) => ({ ...l, name: l.name.trim(), id: deps.newId(), lineTotal: Math.round(l.qty * l.unitPrice) })),
        payments: input.downPayment > 0
          ? [{ id: deps.newId(), paidOn: date, accountId: input.accountId ?? '', amount: input.downPayment, isDownPayment: true, note: 'Uang muka' }]
          : [],
      };
      invoices.push(inv);
      return clone(inv);
    },
    async paySalesInvoice(input: SalesInvoicePayInput): Promise<SalesInvoice> {
      const inv = invoices.find((x) => x.id === input.invoiceId);
      if (!inv) throw new DataError('not_found', 'Faktur tidak ditemukan.');
      if (inv.payments.some((p) => p.id === input.id)) return clone(inv);
      const problem = salesPayProblem(inv.outstanding, input.amount);
      if (problem) throw new DataError('invalid', problem);
      inv.payments.push({
        id: input.id, paidOn: input.date ?? deps.today(), accountId: input.accountId, amount: input.amount, isDownPayment: false,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      });
      inv.paidTotal += input.amount;
      inv.outstanding = inv.total - inv.paidTotal;
      inv.status = salesInvoiceStatus(inv.total, inv.paidTotal);
      return clone(inv);
    },
  };
}

const SERVER_MESSAGES: Record<string, string> = {
  'not allowed': 'Hanya pemilik, admin, atau manajer yang boleh mengelola faktur penjualan.',
  'invoice has no lines': 'Faktur butuh minimal satu baris barang atau jasa.',
  'customer not found': 'Pelanggan tidak ditemukan.',
  'product not found': 'Ada produk yang tidak ditemukan.',
  'invalid line': 'Ada baris faktur yang tidak valid (nama, jumlah, atau harga).',
  'invalid term': 'Termin pembayaran 0 sampai 3650 hari.',
  'amounts must not be negative': 'Diskon, pajak, dan uang muka tidak boleh negatif.',
  'discount is larger than the invoice': 'Diskon tidak boleh melebihi subtotal.',
  'down payment exceeds invoice total': 'Uang muka tidak boleh melebihi total faktur.',
  'down payment account required': 'Pilih akun kas atau bank yang menerima uang muka.',
  'invoice not found': 'Faktur tidak ditemukan.',
  'invalid amount': 'Jumlah bayar harus bilangan bulat lebih dari nol.',
  'amount exceeds outstanding': 'Jumlah bayar melebihi sisa tagihan.',
  'account not found or not postable': 'Akun kas atau bank tidak ditemukan.',
};

/** Terjemahkan pesan galat fungsi server menjadi DataError berbahasa Indonesia. */
export function salesInvoiceError(error: { message?: string }): DataError {
  const known = SERVER_MESSAGES[error.message ?? ''];
  if (known) return new DataError(error.message === 'not allowed' ? 'forbidden' : 'invalid', known);
  return new DataError('invalid', error.message || 'Gagal memproses faktur penjualan.');
}
