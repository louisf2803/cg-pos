/** Keuangan: daftar akun, jurnal, buku besar, dan laporan. Rumus laporan sama dengan fungsi server `report_*` (dibaca dari jurnal terposting dan yang di-void). */
import { localDateKey } from './order-number';
import type { Customer, Order } from './types';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type AccountCategory =
  | 'cash_bank' | 'receivable' | 'inventory' | 'other_current_asset' | 'fixed_asset' | 'accumulated_depreciation'
  | 'payable' | 'short_term_liability' | 'long_term_liability' | 'equity'
  | 'revenue' | 'cogs' | 'expense' | 'other_income' | 'other_expense';

/** Kelompok akun, urut seperti di neraca dan laba rugi. `digit` = angka pertama kode akun. */
export const ACCOUNT_CATEGORIES: { value: AccountCategory; label: string; digit: number }[] = [
  { value: 'cash_bank', label: 'Kas dan bank', digit: 1 }, { value: 'receivable', label: 'Piutang', digit: 1 }, { value: 'inventory', label: 'Persediaan', digit: 1 },
  { value: 'other_current_asset', label: 'Aset lancar lain', digit: 1 }, { value: 'fixed_asset', label: 'Aset tetap', digit: 1 }, { value: 'accumulated_depreciation', label: 'Akumulasi penyusutan', digit: 1 },
  { value: 'payable', label: 'Utang usaha', digit: 2 }, { value: 'short_term_liability', label: 'Kewajiban jangka pendek', digit: 2 }, { value: 'long_term_liability', label: 'Kewajiban jangka panjang', digit: 2 },
  { value: 'equity', label: 'Ekuitas', digit: 3 }, { value: 'revenue', label: 'Pendapatan', digit: 4 }, { value: 'cogs', label: 'Harga pokok penjualan', digit: 5 },
  { value: 'expense', label: 'Beban operasional', digit: 6 }, { value: 'other_income', label: 'Pendapatan lain', digit: 7 }, { value: 'other_expense', label: 'Beban lain', digit: 8 },
];
export const CATEGORY_LABEL = Object.fromEntries(ACCOUNT_CATEGORIES.map((c) => [c.value, c.label])) as Record<AccountCategory, string>;
const DEBIT_NORMAL: AccountCategory[] = ['cash_bank', 'receivable', 'inventory', 'other_current_asset', 'fixed_asset', 'cogs', 'expense', 'other_expense'];
export const isDebitNormal = (c: AccountCategory) => DEBIT_NORMAL.includes(c);
const PL_CATEGORIES: AccountCategory[] = ['revenue', 'cogs', 'expense', 'other_income', 'other_expense'];
const ASSET: AccountCategory[] = ['cash_bank', 'receivable', 'inventory', 'other_current_asset', 'fixed_asset', 'accumulated_depreciation'];
const LIABILITY: AccountCategory[] = ['payable', 'short_term_liability', 'long_term_liability'];

export interface Account {
  id: string; code: string; name: string; kind: 'header' | 'detail'; category: AccountCategory;
  /** akun sistem dipakai fungsi posting: tidak bisa dinonaktifkan dan kategorinya terkunci */
  systemKey?: string; isActive: boolean;
}
export interface AccountInput { id?: string; code: string; name: string; kind: 'header' | 'detail'; category: AccountCategory; isActive?: boolean }

export function accountProblem(i: AccountInput): string | null {
  if (!/^[1-8]-\d{4}$/.test(i.code.trim())) return 'Kode akun berformat angka-4 digit, misalnya 6-1300.';
  if (!i.name.trim()) return 'Nama akun wajib diisi.';
  if (i.name.trim().length > 100) return 'Nama akun terlalu panjang (maksimal 100 huruf).';
  const cat = ACCOUNT_CATEGORIES.find((c) => c.value === i.category);
  if (!cat) return 'Pilih kelompok akun.';
  if (Number(i.code.trim()[0]) !== cat.digit) return `Kelompok ${cat.label} memakai kode berawalan ${cat.digit}.`;
  return null;
}

export type JournalStatus = 'posted' | 'voided';
export type JournalSource = 'sale' | 'refund' | 'purchase_invoice' | 'purchase_payment' | 'cash_movement' | 'shift_close' | 'reconciliation' | 'settlement' | 'manual' | 'opening' | 'transfer' | 'reversal' | string;
export const SOURCE_LABEL: Record<string, string> = {
  sale: 'Penjualan', refund: 'Refund', purchase_invoice: 'Pembelian', purchase_payment: 'Bayar pembelian', cash_movement: 'Kas masuk/keluar', shift_close: 'Selisih kas shift',
  reconciliation: 'Rekonsiliasi', settlement: 'Settlement', manual: 'Jurnal manual', opening: 'Saldo awal', reversal: 'Pembalik', transfer: 'Pindah saldo',
};
export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;

export interface JournalSummary { id: string; number: string; date: string; description: string; sourceType: JournalSource; status: JournalStatus; total: number; reversesId?: string }
export interface JournalLine { accountId: string; code: string; name: string; debit: number; credit: number; memo?: string }
export interface Journal extends JournalSummary { lines: JournalLine[] }
export interface JournalInput {
  /** dibuat perangkat; kirim ulang dengan id sama tidak menggandakan. 'transfer' memakai nomor dokumen PS-. */
  id: string; date: string; description: string; kind: 'manual' | 'opening' | 'transfer';
  lines: { accountId: string; debit: number; credit: number; memo?: string }[];
}
export const MAX_JOURNAL_LINES = 200;

export function journalProblem(i: JournalInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) return 'Isi tanggal jurnal.';
  if (!i.description.trim()) return 'Isi keterangan jurnal.';
  if (i.description.trim().length > 200) return 'Keterangan terlalu panjang (maksimal 200 huruf).';
  const lines = i.lines.filter((l) => l.accountId);
  if (lines.length < 2) return 'Jurnal minimal punya dua baris akun.';
  if (lines.length > MAX_JOURNAL_LINES) return `Satu jurnal paling banyak ${MAX_JOURNAL_LINES} baris.`;
  let d = 0, c = 0;
  for (const l of lines) {
    if (!Number.isFinite(l.debit) || !Number.isFinite(l.credit) || l.debit < 0 || l.credit < 0) return 'Jumlah debit dan kredit tidak boleh negatif.';
    if ((l.debit > 0) === (l.credit > 0)) return 'Tiap baris diisi di debit atau di kredit, salah satu saja.';
    if (round2(l.debit) !== l.debit || round2(l.credit) !== l.credit) return 'Jumlah paling banyak 2 angka di belakang koma.';
    if (l.debit > 1e12 || l.credit > 1e12) return 'Jumlah terlalu besar.';
    d += l.debit; c += l.credit;
  }
  if (round2(d) !== round2(c)) return `Jurnal belum seimbang: debit ${round2(d)} dan kredit ${round2(c)}.`;
  return null;
}

/** Satu baris jurnal beserta induknya, bentuk datar untuk semua laporan. */
export interface FinLine {
  entryId: string; number: string; date: string; description: string; sourceType: JournalSource; status: JournalStatus;
  accountId: string; code: string; name: string; category: AccountCategory; debit: number; credit: number; memo?: string;
}

export interface TrialRow { accountId: string; code: string; name: string; category: AccountCategory; opening: number; debit: number; credit: number; closing: number }
export interface StatementRow { section: string; code?: string; name: string; amount: number }

const signedNet = (cat: AccountCategory, net: number) => (isDebitNormal(cat) ? net : -net);

export function trialBalanceOf(lines: FinLine[], from: string, to: string): TrialRow[] {
  const by = new Map<string, TrialRow & { net: number }>();
  for (const l of lines) {
    if (l.date > to) continue;
    const r = by.get(l.accountId) ?? { accountId: l.accountId, code: l.code, name: l.name, category: l.category, opening: 0, debit: 0, credit: 0, closing: 0, net: 0 };
    if (l.date < from) r.net += l.debit - l.credit; else { r.debit += l.debit; r.credit += l.credit; }
    by.set(l.accountId, r);
  }
  return [...by.values()].map((r) => {
    const open = signedNet(r.category, r.net);
    const close = signedNet(r.category, r.net + r.debit - r.credit);
    return { accountId: r.accountId, code: r.code, name: r.name, category: r.category, opening: round2(open), debit: round2(r.debit), credit: round2(r.credit), closing: round2(close) };
  }).sort((a, b) => a.code.localeCompare(b.code));
}

export function incomeStatementOf(lines: FinLine[], from: string, to: string): StatementRow[] {
  const by = new Map<string, { code: string; name: string; cat: AccountCategory; net: number }>();
  for (const l of lines) {
    if (l.date < from || l.date > to || !PL_CATEGORIES.includes(l.category)) continue;
    const r = by.get(l.accountId) ?? { code: l.code, name: l.name, cat: l.category, net: 0 };
    r.net += l.debit - l.credit; by.set(l.accountId, r);
  }
  const rows = [...by.values()].map((r) => ({ ...r, amt: round2(signedNet(r.cat, r.net)) })).sort((a, b) => a.code.localeCompare(b.code));
  const sum = (cat: AccountCategory) => round2(rows.filter((r) => r.cat === cat).reduce((n, r) => n + r.amt, 0));
  const rev = sum('revenue'), cg = sum('cogs'), ex = sum('expense'), oi = sum('other_income'), oe = sum('other_expense');
  const part = (section: string, cat: AccountCategory) => rows.filter((r) => r.cat === cat).map((r): StatementRow => ({ section, code: r.code, name: r.name, amount: r.amt }));
  return [
    ...part('revenue', 'revenue'), ...part('cogs', 'cogs'), { section: 'gross_profit', name: 'Laba Kotor', amount: round2(rev - cg) },
    ...part('expense', 'expense'), { section: 'operating_profit', name: 'Laba Operasional', amount: round2(rev - cg - ex) },
    ...part('other_income', 'other_income'), ...part('other_expense', 'other_expense'), { section: 'net_profit', name: 'Laba Bersih', amount: round2(rev - cg - ex + oi - oe) },
  ];
}

export function balanceSheetOf(lines: FinLine[], asOf: string): StatementRow[] {
  const by = new Map<string, { code: string; name: string; cat: AccountCategory; net: number }>();
  for (const l of lines) {
    if (l.date > asOf) continue;
    const r = by.get(l.accountId) ?? { code: l.code, name: l.name, cat: l.category, net: 0 };
    r.net += l.debit - l.credit; by.set(l.accountId, r);
  }
  const rows = [...by.values()].sort((a, b) => a.code.localeCompare(b.code));
  const profit = round2(-rows.filter((r) => PL_CATEGORIES.includes(r.cat)).reduce((n, r) => n + r.net, 0));
  return [
    ...rows.filter((r) => ASSET.includes(r.cat)).map((r): StatementRow => ({ section: 'asset', code: r.code, name: r.name, amount: round2(r.net) })),
    ...rows.filter((r) => LIABILITY.includes(r.cat)).map((r): StatementRow => ({ section: 'liability', code: r.code, name: r.name, amount: round2(-r.net) })),
    ...rows.filter((r) => r.cat === 'equity').map((r): StatementRow => ({ section: 'equity', code: r.code, name: r.name, amount: round2(-r.net) })),
    { section: 'equity', code: '3-9999', name: 'Laba Berjalan (kumulatif)', amount: profit },
  ];
}

export interface BalanceSheetTotals { assets: number; liabilities: number; equity: number; balanced: boolean }
export function balanceSheetTotals(rows: StatementRow[]): BalanceSheetTotals {
  const sum = (s: string) => round2(rows.filter((r) => r.section === s).reduce((n, r) => n + r.amount, 0));
  const assets = sum('asset'), liabilities = sum('liability'), equity = sum('equity');
  return { assets, liabilities, equity, balanced: round2(assets - liabilities - equity) === 0 };
}

export interface LedgerRow { entryId: string; number: string; date: string; description: string; sourceType: JournalSource; debit: number; credit: number; balance: number; memo?: string }
export interface Ledger { account: Account; opening: number; debit: number; credit: number; closing: number; rows: LedgerRow[] }

/** Buku besar satu akun: saldo awal (sebelum `from`) lalu baris dengan saldo berjalan. */
export function ledgerFrom(account: Account, opening: number, lines: FinLine[]): Ledger {
  const sorted = [...lines].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  let bal = opening, d = 0, c = 0;
  const rows = sorted.map((l): LedgerRow => {
    bal = round2(bal + (isDebitNormal(account.category) ? l.debit - l.credit : l.credit - l.debit)); d += l.debit; c += l.credit;
    return { entryId: l.entryId, number: l.number, date: l.date, description: l.description, sourceType: l.sourceType, debit: l.debit, credit: l.credit, balance: bal, ...(l.memo ? { memo: l.memo } : {}) };
  });
  return { account, opening: round2(opening), debit: round2(d), credit: round2(c), closing: bal, rows };
}
export function ledgerOf(lines: FinLine[], account: Account, from: string, to: string): Ledger {
  const mine = lines.filter((l) => l.accountId === account.id);
  const opening = signedNet(account.category, mine.filter((l) => l.date < from).reduce((n, l) => n + l.debit - l.credit, 0));
  return ledgerFrom(account, opening, mine.filter((l) => l.date >= from && l.date <= to));
}

export interface CashFlowGroup { source: JournalSource; label: string; inflow: number; outflow: number; net: number }
export interface CashFlow { opening: number; inflow: number; outflow: number; net: number; closing: number; groups: CashFlowGroup[] }
/** Arus kas metode langsung: gerakan akun kas dan bank, dikelompokkan menurut sumber jurnal. */
export function cashFlowFrom(opening: number, cashLines: FinLine[]): CashFlow {
  const by = new Map<string, CashFlowGroup>();
  let inflow = 0, outflow = 0;
  for (const l of cashLines) {
    const g = by.get(l.sourceType) ?? { source: l.sourceType, label: sourceLabel(l.sourceType), inflow: 0, outflow: 0, net: 0 };
    g.inflow += l.debit; g.outflow += l.credit; inflow += l.debit; outflow += l.credit; by.set(l.sourceType, g);
  }
  const groups = [...by.values()].map((g) => ({ ...g, inflow: round2(g.inflow), outflow: round2(g.outflow), net: round2(g.inflow - g.outflow) })).sort((a, b) => b.net - a.net);
  return { opening: round2(opening), inflow: round2(inflow), outflow: round2(outflow), net: round2(inflow - outflow), closing: round2(opening + inflow - outflow), groups };
}
export function cashFlowOf(lines: FinLine[], from: string, to: string): CashFlow {
  const cash = lines.filter((l) => l.category === 'cash_bank');
  const opening = cash.filter((l) => l.date < from).reduce((n, l) => n + l.debit - l.credit, 0);
  return cashFlowFrom(opening, cash.filter((l) => l.date >= from && l.date <= to));
}

export interface PayableRow { supplierId?: string; supplierName: string; invoiceId: string; number: string; dueDate?: string; outstanding: number; daysOverdue: number }
export interface PayableSupplierTotal { supplierName: string; count: number; outstanding: number; overdue: number }
export function payablesBySupplier(rows: PayableRow[]): PayableSupplierTotal[] {
  const by = new Map<string, PayableSupplierTotal>();
  for (const r of rows) {
    const t = by.get(r.supplierName) ?? { supplierName: r.supplierName, count: 0, outstanding: 0, overdue: 0 };
    t.count += 1; t.outstanding = round2(t.outstanding + r.outstanding); if (r.daysOverdue > 0) t.overdue = round2(t.overdue + r.outstanding);
    by.set(r.supplierName, t);
  }
  return [...by.values()].sort((a, b) => b.outstanding - a.outstanding);
}
/** Kelompok umur hutang: belum jatuh tempo, 1-30, 31-60, lebih dari 60 hari. */
export const AGING_BUCKETS = ['Belum jatuh tempo', '1–30 hari', '31–60 hari', 'Lebih dari 60 hari'] as const;
export function agingBucket(daysOverdue: number): number { return daysOverdue <= 0 ? 0 : daysOverdue <= 30 ? 1 : daysOverdue <= 60 ? 2 : 3; }

export interface ReceivableRow {
  customerKey: string;
  customerId?: string;
  customerName: string;
  phone?: string;
  orderId: string;
  orderNumber: string;
  orderType: Order['type'];
  status: 'open' | 'partially_paid';
  dateKey: string;
  total: number;
  paid: number;
  outstanding: number;
  daysAged: number;
}
export interface ReceivableCustomerTotal {
  customerKey: string;
  customerId?: string;
  customerName: string;
  phone?: string;
  count: number;
  total: number;
  paid: number;
  outstanding: number;
  over30Days: number;
}
/** Kelompok umur piutang pelanggan: hari ini, 1-30, 31-60, lebih dari 60 hari sejak pesanan dibuka. */
export const RECEIVABLE_AGING_BUCKETS = ['Hari ini (0 hari)', '1–30 hari', '31–60 hari', 'Lebih dari 60 hari'] as const;

function calendarDaysBetween(fromDateKey: string, toDateKey: string): number {
  const fromMs = Date.parse(`${fromDateKey}T00:00:00Z`);
  const toMs = Date.parse(`${toDateKey}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.round((toMs - fromMs) / 86_400_000);
}

/** Menghitung rincian piutang pelanggan dari pesanan yang belum lunas (`open` / `partially_paid`) per tanggal acuan. */
export function buildReceivables(
  orders: readonly Order[],
  customers: readonly Customer[],
  timezone: string,
  asOf: string,
): ReceivableRow[] {
  const custById = new Map(customers.map((c) => [c.id, c]));
  const rows: ReceivableRow[] = [];
  for (const o of orders) {
    if (o.status !== 'open' && o.status !== 'partially_paid') continue;
    const outstanding = Math.max(0, o.total - o.paidTotal);
    if (outstanding <= 0) continue;
    const dateKey = localDateKey(new Date(o.openedAt), timezone);
    if (dateKey > asOf) continue;
    const cust = o.customerId ? custById.get(o.customerId) : undefined;
    const customerName = cust?.name?.trim() || o.customerName?.trim() || o.label?.trim() || 'Pelanggan umum';
    const customerKey = o.customerId ? `id:${o.customerId}` : `name:${customerName.toLowerCase()}`;
    const daysAged = Math.max(0, calendarDaysBetween(dateKey, asOf));
    rows.push({
      customerKey,
      ...(o.customerId ? { customerId: o.customerId } : {}),
      customerName,
      ...(cust?.phone ? { phone: cust.phone } : {}),
      orderId: o.id,
      orderNumber: o.number,
      orderType: o.type,
      status: o.status,
      dateKey,
      total: o.total,
      paid: o.paidTotal,
      outstanding,
      daysAged,
    });
  }
  return rows.sort((a, b) => b.daysAged - a.daysAged || b.outstanding - a.outstanding || a.orderNumber.localeCompare(b.orderNumber));
}

/** Meringkas saldo piutang per pelanggan (jumlah tagihan, total, terbayar, sisa, >30 hari). */
export function receivablesByCustomer(rows: readonly ReceivableRow[]): ReceivableCustomerTotal[] {
  const by = new Map<string, ReceivableCustomerTotal>();
  for (const r of rows) {
    const cur = by.get(r.customerKey) ?? {
      customerKey: r.customerKey,
      ...(r.customerId ? { customerId: r.customerId } : {}),
      customerName: r.customerName,
      ...(r.phone ? { phone: r.phone } : {}),
      count: 0,
      total: 0,
      paid: 0,
      outstanding: 0,
      over30Days: 0,
    };
    cur.count += 1;
    cur.total += r.total;
    cur.paid += r.paid;
    cur.outstanding += r.outstanding;
    if (r.daysAged > 30) cur.over30Days += r.outstanding;
    by.set(r.customerKey, cur);
  }
  return [...by.values()].sort((a, b) => b.outstanding - a.outstanding || a.customerName.localeCompare(b.customerName, 'id'));
}

/** Rentang tanggal laporan: bulan ini sampai hari ini. */
export const monthStart = (isoDate: string) => `${isoDate.slice(0, 8)}01`;
