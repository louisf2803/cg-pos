import { describe, expect, it } from 'vitest';
import {
  buildCashEntryJournal,
  categorizeCashEntries,
  validateCashEntry,
  type CashEntryInput,
} from '../src/cash-entry';
import type { Account, Journal } from '../src/finance';

describe('cash-entry', () => {
  const accounts: Account[] = [
    { id: 'acc-kas', code: '1-1100', name: 'Kas Kasir', kind: 'detail', category: 'cash_bank', isActive: true },
    { id: 'acc-bank', code: '1-1200', name: 'Bank BCA', kind: 'detail', category: 'cash_bank', isActive: true },
    { id: 'acc-listrik', code: '6-1100', name: 'Beban Listrik & Air', kind: 'detail', category: 'expense', isActive: true },
    { id: 'acc-bunga', code: '7-1100', name: 'Pendapatan Bunga', kind: 'detail', category: 'other_income', isActive: true },
  ];

  it('validasi input penerimaan dan pengeluaran', () => {
    // Valid input
    expect(
      validateCashEntry({
        kind: 'out',
        date: '2026-11-10',
        amount: 50000,
        cashAccountId: 'acc-kas',
        counterpartAccountId: 'acc-listrik',
      })
    ).toBeNull();

    // Invalid: jumlah 0
    expect(
      validateCashEntry({
        kind: 'out',
        date: '2026-11-10',
        amount: 0,
        cashAccountId: 'acc-kas',
        counterpartAccountId: 'acc-listrik',
      })
    ).toBe('Jumlah nominal harus lebih dari 0.');

    // Invalid: akun kembar
    expect(
      validateCashEntry({
        kind: 'out',
        date: '2026-11-10',
        amount: 25000,
        cashAccountId: 'acc-kas',
        counterpartAccountId: 'acc-kas',
      })
    ).toBe('Akun kas/bank dan akun lawan tidak boleh sama.');

    // Invalid: format tanggal
    expect(
      validateCashEntry({
        kind: 'in',
        date: 'invalid',
        amount: 10000,
        cashAccountId: 'acc-bank',
        counterpartAccountId: 'acc-bunga',
      })
    ).toBe('Tanggal transaksi wajib diisi dengan format yang benar.');

    // Invalid: periode buku terkunci
    expect(
      validateCashEntry(
        {
          kind: 'out',
          date: '2026-10-31',
          amount: 50000,
          cashAccountId: 'acc-kas',
          counterpartAccountId: 'acc-listrik',
        },
        '2026-10-31'
      )
    ).toContain('berada di periode buku yang sudah dikunci');
  });

  it('buildCashEntryJournal membentuk debit kredit yang tepat', () => {
    // Pengeluaran: Debit beban, Kredit kas
    const outJournal = buildCashEntryJournal({
      kind: 'out',
      date: '2026-11-10',
      amount: 150000,
      cashAccountId: 'acc-kas',
      counterpartAccountId: 'acc-listrik',
      note: 'Bayar tagihan listrik PLN',
    });

    expect(outJournal.kind).toBe('manual');
    expect(outJournal.date).toBe('2026-11-10');
    expect(outJournal.description).toBe('Bayar tagihan listrik PLN');
    expect(outJournal.lines).toHaveLength(2);
    // Line 0: Debit beban
    expect(outJournal.lines[0]).toEqual({
      accountId: 'acc-listrik',
      debit: 150000,
      credit: 0,
      memo: 'Bayar tagihan listrik PLN',
    });
    // Line 1: Kredit kas
    expect(outJournal.lines[1]).toEqual({
      accountId: 'acc-kas',
      debit: 0,
      credit: 150000,
      memo: 'Bayar tagihan listrik PLN',
    });

    // Penerimaan: Debit kas, Kredit pendapatan lain
    const inJournal = buildCashEntryJournal({
      kind: 'in',
      date: '2026-11-10',
      amount: 75000,
      cashAccountId: 'acc-bank',
      counterpartAccountId: 'acc-bunga',
      note: 'Bunga tabungan giro',
    });

    expect(inJournal.lines[0]).toEqual({
      accountId: 'acc-bank',
      debit: 75000,
      credit: 0,
      memo: 'Bunga tabungan giro',
    });
    expect(inJournal.lines[1]).toEqual({
      accountId: 'acc-bunga',
      debit: 0,
      credit: 75000,
      memo: 'Bunga tabungan giro',
    });
  });

  it('categorizeCashEntries memisahkan jurnal ke dalam penerimaan dan pengeluaran', () => {
    const journals: Journal[] = [
      // Pengeluaran: Debit Beban (acc-listrik), Kredit Kas (acc-kas)
      {
        id: 'j-1',
        number: 'JU-001',
        date: '2026-11-10',
        description: 'Beli token listrik',
        sourceType: 'manual',
        status: 'posted',
        total: 100000,
        lines: [
          { accountId: 'acc-listrik', code: '6-1100', name: 'Beban Listrik', debit: 100000, credit: 0 },
          { accountId: 'acc-kas', code: '1-1100', name: 'Kas Kasir', debit: 0, credit: 100000 },
        ],
      },
      // Penerimaan: Debit Bank (acc-bank), Kredit Bunga (acc-bunga)
      {
        id: 'j-2',
        number: 'JU-002',
        date: '2026-11-10',
        description: 'Bunga bank',
        sourceType: 'manual',
        status: 'posted',
        total: 50000,
        lines: [
          { accountId: 'acc-bank', code: '1-1200', name: 'Bank BCA', debit: 50000, credit: 0 },
          { accountId: 'acc-bunga', code: '7-1100', name: 'Pendapatan Bunga', debit: 0, credit: 50000 },
        ],
      },
      // Jurnal voided tidak boleh dimasukkan
      {
        id: 'j-3',
        number: 'JU-003',
        date: '2026-11-10',
        description: 'Jurnal salah dibatalkan',
        sourceType: 'manual',
        status: 'voided',
        total: 20000,
        lines: [
          { accountId: 'acc-listrik', code: '6-1100', name: 'Beban Listrik', debit: 20000, credit: 0 },
          { accountId: 'acc-kas', code: '1-1100', name: 'Kas Kasir', debit: 0, credit: 20000 },
        ],
      },
    ];

    const result = categorizeCashEntries(journals, accounts);
    expect(result.inEntries).toHaveLength(1);
    expect(result.inEntries[0].id).toBe('j-2');
    expect(result.inEntries[0].amount).toBe(50000);
    expect(result.inEntries[0].cashAccountName).toBe('Bank BCA');
    expect(result.inEntries[0].counterpartAccountName).toBe('Pendapatan Bunga');
    expect(result.totalIn).toBe(50000);

    expect(result.outEntries).toHaveLength(1);
    expect(result.outEntries[0].id).toBe('j-1');
    expect(result.outEntries[0].amount).toBe(100000);
    expect(result.outEntries[0].cashAccountName).toBe('Kas Kasir');
    expect(result.outEntries[0].counterpartAccountName).toBe('Beban Listrik & Air');
    expect(result.totalOut).toBe(100000);
  });
});
