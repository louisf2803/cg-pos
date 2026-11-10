import { newId } from './id';
import type { Account, Journal, JournalInput } from './finance';

export type CashEntryKind = 'in' | 'out';

export interface CashEntryInput {
  id?: string;
  kind: CashEntryKind;
  date: string; // YYYY-MM-DD
  amount: number;
  cashAccountId: string;
  counterpartAccountId: string;
  note?: string;
}

export interface CashEntryView {
  id: string;
  number: string;
  date: string;
  description: string;
  amount: number;
  cashAccountId: string;
  cashAccountName: string;
  counterpartAccountId: string;
  counterpartAccountName: string;
  status: 'posted' | 'voided';
}

/**
 * Validasi isian formulir penerimaan atau pengeluaran kas.
 */
export function validateCashEntry(input: CashEntryInput, lockedThrough?: string): string | null {
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return 'Tanggal transaksi wajib diisi dengan format yang benar.';
  }
  if (lockedThrough && input.date <= lockedThrough) {
    return `Tanggal transaksi berada di periode buku yang sudah dikunci (hingga ${lockedThrough}).`;
  }
  if (!input.cashAccountId) {
    return 'Pilih akun kas atau bank.';
  }
  if (!input.counterpartAccountId) {
    return input.kind === 'in'
      ? 'Pilih akun sumber penerimaan (pendapatan lain/sumber dana).'
      : 'Pilih akun kategori biaya (beban operasional/beban lain).';
  }
  if (input.cashAccountId === input.counterpartAccountId) {
    return 'Akun kas/bank dan akun lawan tidak boleh sama.';
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return 'Jumlah nominal harus lebih dari 0.';
  }
  if (Math.round(input.amount * 100) / 100 !== input.amount) {
    return 'Jumlah paling banyak 2 angka di belakang koma.';
  }
  return null;
}

/**
 * Membentuk baris jurnal berpasangan seimbang (double-entry) untuk penerimaan atau pengeluaran kas.
 * - Pengeluaran: Debit akun beban/lawan, Kredit kas/bank
 * - Penerimaan: Debit kas/bank, Kredit akun pendapatan/lawan
 */
export function buildCashEntryJournal(input: CashEntryInput, lockedThrough?: string): JournalInput {
  const problem = validateCashEntry(input, lockedThrough);
  if (problem) {
    throw new Error(problem);
  }

  const id = input.id || newId();
  const desc = input.note?.trim() || (input.kind === 'in' ? 'Penerimaan kas' : 'Pengeluaran kas');

  const lines =
    input.kind === 'in'
      ? [
          { accountId: input.cashAccountId, debit: input.amount, credit: 0, memo: input.note?.trim() },
          { accountId: input.counterpartAccountId, debit: 0, credit: input.amount, memo: input.note?.trim() },
        ]
      : [
          { accountId: input.counterpartAccountId, debit: input.amount, credit: 0, memo: input.note?.trim() },
          { accountId: input.cashAccountId, debit: 0, credit: input.amount, memo: input.note?.trim() },
        ];

  return {
    id,
    date: input.date,
    description: desc,
    kind: 'manual',
    lines,
  };
}

/**
 * Mengelompokkan jurnal ke dalam Penerimaan (kas masuk) dan Pengeluaran (kas keluar).
 * Mengabaikan jurnal yang sudah dibatalkan (voided).
 */
export function categorizeCashEntries(
  journals: Journal[],
  accounts: Account[]
): {
  inEntries: CashEntryView[];
  outEntries: CashEntryView[];
  totalIn: number;
  totalOut: number;
} {
  const accMap = new Map<string, Account>();
  for (const a of accounts) {
    accMap.set(a.id, a);
  }

  const inEntries: CashEntryView[] = [];
  const outEntries: CashEntryView[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (const j of journals) {
    if (j.status === 'voided') continue;
    if (!j.lines || j.lines.length < 2) continue;

    // Cari baris akun kas/bank
    const cashDebitLine = j.lines.find((l) => {
      const a = accMap.get(l.accountId);
      return a?.category === 'cash_bank' && l.debit > 0;
    });

    const cashCreditLine = j.lines.find((l) => {
      const a = accMap.get(l.accountId);
      return a?.category === 'cash_bank' && l.credit > 0;
    });

    // 1. Kas Masuk (Penerimaan): kas/bank didebit
    if (cashDebitLine) {
      const otherLine = j.lines.find((l) => l.accountId !== cashDebitLine.accountId && l.credit > 0);
      const cashAcc = accMap.get(cashDebitLine.accountId);
      const otherAcc = otherLine ? accMap.get(otherLine.accountId) : undefined;

      const entry: CashEntryView = {
        id: j.id,
        number: j.number,
        date: j.date,
        description: j.description,
        amount: cashDebitLine.debit,
        cashAccountId: cashDebitLine.accountId,
        cashAccountName: cashAcc?.name || 'Kas/Bank',
        counterpartAccountId: otherLine?.accountId || '',
        counterpartAccountName: otherAcc?.name || 'Pendapatan/Sumber Lain',
        status: j.status,
      };

      inEntries.push(entry);
      totalIn += cashDebitLine.debit;
    }

    // 2. Kas Keluar (Pengeluaran): kas/bank dikredit
    if (cashCreditLine) {
      const otherLine = j.lines.find((l) => l.accountId !== cashCreditLine.accountId && l.debit > 0);
      const cashAcc = accMap.get(cashCreditLine.accountId);
      const otherAcc = otherLine ? accMap.get(otherLine.accountId) : undefined;

      const entry: CashEntryView = {
        id: j.id,
        number: j.number,
        date: j.date,
        description: j.description,
        amount: cashCreditLine.credit,
        cashAccountId: cashCreditLine.accountId,
        cashAccountName: cashAcc?.name || 'Kas/Bank',
        counterpartAccountId: otherLine?.accountId || '',
        counterpartAccountName: otherAcc?.name || 'Beban/Biaya',
        status: j.status,
      };

      outEntries.push(entry);
      totalOut += cashCreditLine.credit;
    }
  }

  // Urutkan tanggal terbaru ke terlama
  inEntries.sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  outEntries.sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));

  return { inEntries, outEntries, totalIn, totalOut };
}
