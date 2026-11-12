// Tagihan rutin dan alur persetujuan (migrasi 0041). Rancangan Claude atas arahan Louis (12 Nov 2026; Majoo tidak bisa dilihat).
// Fungsi murni: validasi dan penghitung jatuh tempo yang sama dengan pos.recurring_bill_pay.

export type BillFrequency = 'weekly' | 'monthly' | 'yearly';

export interface RecurringBill {
  id: string;
  name: string;
  /** Rupiah bulat. */
  amount: number;
  frequency: BillFrequency;
  /** Jatuh tempo berikutnya, yyyy-mm-dd. */
  nextDue: string;
  expenseAccountId: string;
  supplierId?: string;
  outletId?: string;
  isActive: boolean;
  notes?: string;
}

export interface RecurringBillInput {
  id?: string;
  name: string;
  amount: number;
  frequency: BillFrequency;
  nextDue: string;
  expenseAccountId: string;
  supplierId?: string | null;
  outletId?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

export interface RecurringBillRun { billId: string; dueDate: string; paidOn: string; amount: number }

export type ApprovalKind = 'purchase' | 'finance';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApprovalRequest {
  id: string;
  kind: ApprovalKind;
  title: string;
  amount: number;
  refType?: string;
  refId?: string;
  note?: string;
  status: ApprovalStatus;
  requestedBy?: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
  createdAt: string;
}

export interface ApprovalInput { id?: string; kind: ApprovalKind; title: string; amount: number; refType?: string | null; refId?: string | null; note?: string | null }

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function recurringBillProblem(input: RecurringBillInput): string | null {
  const name = input.name.trim();
  if (!name) return 'Nama tagihan wajib diisi.';
  if (name.length > 120) return 'Nama tagihan maksimal 120 huruf.';
  if (!Number.isInteger(input.amount) || input.amount <= 0) return 'Jumlah harus bilangan bulat rupiah lebih dari 0.';
  if (!['weekly', 'monthly', 'yearly'].includes(input.frequency)) return 'Frekuensi harus mingguan, bulanan, atau tahunan.';
  if (!isoDate.test(input.nextDue) || Number.isNaN(Date.parse(input.nextDue))) return 'Tanggal jatuh tempo tidak valid.';
  if (!input.expenseAccountId) return 'Pilih akun biaya.';
  if (input.notes && input.notes.length > 300) return 'Catatan maksimal 300 huruf.';
  return null;
}

export function approvalProblem(input: ApprovalInput): string | null {
  if (input.kind !== 'purchase' && input.kind !== 'finance') return 'Jenis persetujuan tidak dikenal.';
  const title = input.title.trim();
  if (!title) return 'Judul wajib diisi.';
  if (title.length > 120) return 'Judul maksimal 120 huruf.';
  if (!Number.isInteger(input.amount) || input.amount < 0) return 'Jumlah harus bilangan bulat rupiah, 0 atau lebih.';
  if (input.note && input.note.length > 300) return 'Catatan maksimal 300 huruf.';
  return null;
}

function parts(d: string): [number, number, number] { const [y, m, day] = d.split('-').map(Number) as [number, number, number]; return [y, m, day]; }
const fmt = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Jatuh tempo sesudah `due` (sama dengan server: hari terakhir bulan dipakai bila harinya tidak ada). */
export function nextDueAfter(due: string, frequency: BillFrequency): string {
  const [y, m, d] = parts(due);
  if (frequency === 'weekly') {
    const t = new Date(Date.UTC(y, m - 1, d + 7));
    return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  if (frequency === 'monthly') {
    const idx = y * 12 + (m - 1) + 1;
    const ny = Math.floor(idx / 12); const nm = (idx % 12) + 1;
    return fmt(ny, nm, Math.min(d, daysInMonth(ny, nm)));
  }
  return fmt(y + 1, m, Math.min(d, daysInMonth(y + 1, m)));
}

/** Terlambat bila jatuh tempo sebelum hari ini (yyyy-mm-dd). */
export function billIsOverdue(bill: Pick<RecurringBill, 'nextDue' | 'isActive'>, today: string): boolean {
  return bill.isActive && bill.nextDue < today;
}

/** Hari sampai jatuh tempo (negatif = terlambat). */
export function daysUntilDue(nextDue: string, today: string): number {
  const a = Date.UTC(...(parts(nextDue).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number]));
  const b = Date.UTC(...(parts(today).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number]));
  return Math.round((a - b) / 86_400_000);
}
