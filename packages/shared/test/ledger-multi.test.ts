import { describe, expect, it } from 'vitest';
import {
  computeMultiLedgerSummary,
  sortLedgersByAccount,
  filterAccountsForLedger,
  toCsvWithBom,
  buildMultiLedgerCsvRows,
} from '../src/ledger-multi';
import type { Account, Ledger } from '../src/finance';

describe('Multi-Account Ledger Helpers (A33)', () => {
  const accountKas: Account = {
    id: 'acc-1',
    code: '1-1001',
    name: 'Kas Toko',
    category: 'cash',
    kind: 'detail',
    normalBalance: 'debit',
    isActive: true,
  };

  const accountBank: Account = {
    id: 'acc-2',
    code: '1-1002',
    name: 'Bank BCA',
    category: 'bank',
    kind: 'detail',
    normalBalance: 'debit',
    isActive: true,
  };

  const accountPiutang: Account = {
    id: 'acc-3',
    code: '1-1003',
    name: 'Piutang Dagang',
    category: 'receivable',
    kind: 'detail',
    normalBalance: 'debit',
    isActive: true,
  };

  const ledgerKas: Ledger = {
    account: accountKas,
    opening: 1000000,
    debit: 500000,
    credit: 200000,
    closing: 1300000,
    rows: [
      {
        entryId: 'e-1',
        number: 'JRN-001',
        date: '2026-11-02',
        description: 'Penjualan tunai',
        sourceType: 'sale',
        debit: 500000,
        credit: 0,
        balance: 1500000,
      },
      {
        entryId: 'e-2',
        number: 'JRN-002',
        date: '2026-11-03',
        description: 'Beli ATK',
        sourceType: 'manual',
        debit: 0,
        credit: 200000,
        balance: 1300000,
        memo: 'Kwitansi 12',
      },
    ],
  };

  const ledgerBank: Ledger = {
    account: accountBank,
    opening: 5000000,
    debit: 1000000,
    credit: 500000,
    closing: 5500000,
    rows: [
      {
        entryId: 'e-3',
        number: 'JRN-003',
        date: '2026-11-04',
        description: 'Transfer masuk dari pelanggan',
        sourceType: 'sale',
        debit: 1000000,
        credit: 0,
        balance: 6000000,
      },
      {
        entryId: 'e-4',
        number: 'JRN-004',
        date: '2026-11-05',
        description: 'Bayar internet',
        sourceType: 'manual',
        debit: 0,
        credit: 500000,
        balance: 5500000,
      },
    ],
  };

  it('computes aggregated multi-ledger summary correctly', () => {
    const summary = computeMultiLedgerSummary([ledgerKas, ledgerBank]);
    expect(summary.totalOpening).toBe(6000000);
    expect(summary.totalDebit).toBe(1500000);
    expect(summary.totalCredit).toBe(700000);
    expect(summary.totalClosing).toBe(6800000);
    expect(summary.accountCount).toBe(2);
    expect(summary.movementCount).toBe(4);
  });

  it('handles empty ledgers array in summary computation', () => {
    const summary = computeMultiLedgerSummary([]);
    expect(summary).toEqual({
      totalOpening: 0,
      totalDebit: 0,
      totalCredit: 0,
      totalClosing: 0,
      accountCount: 0,
      movementCount: 0,
    });
  });

  it('sorts ledgers cleanly by account code ascending', () => {
    const sorted = sortLedgersByAccount([ledgerBank, ledgerKas]);
    expect(sorted.map((l) => l.account.code)).toEqual(['1-1001', '1-1002']);
  });

  it('filters account list by keyword in code or name', () => {
    const accounts = [accountKas, accountBank, accountPiutang];
    expect(filterAccountsForLedger(accounts, 'BCA')).toEqual([accountBank]);
    expect(filterAccountsForLedger(accounts, '1-1003')).toEqual([accountPiutang]);
    expect(filterAccountsForLedger(accounts, 'dagang')).toEqual([accountPiutang]);
    expect(filterAccountsForLedger(accounts, '')).toEqual(accounts);
  });

  it('prepends UTF-8 BOM byte sequence to CSV string', () => {
    const csvWithBom = toCsvWithBom([['Nama', 'Nilai'], ['Produk A', 100]]);
    expect(csvWithBom.charCodeAt(0)).toBe(0xfeff);
    expect(csvWithBom).toContain('Produk A');
  });

  it('constructs multi-account tabular CSV rows with opening balance and subtotals', () => {
    const rows = buildMultiLedgerCsvRows([ledgerKas, ledgerBank], '1 Nov – 10 Nov 2026');

    // Title & range header
    expect(rows[0]).toEqual(['BUKU BESAR (GENERAL LEDGER)']);
    expect(rows[1]).toEqual(['Periode: 1 Nov – 10 Nov 2026']);

    // Check account Kas rows
    const kasOpeningRow = rows.find(
      (r) => r[0] === '1-1001' && r[4] === 'SALDO AWAL'
    );
    expect(kasOpeningRow).toBeDefined();
    expect(kasOpeningRow?.[8]).toBe(1000000);

    // Check movement memo
    const atkRow = rows.find((r) => r[3] === 'JRN-002');
    expect(atkRow?.[5]).toBe('Beli ATK · Kwitansi 12');

    // Check subtotal row
    const subtotalKas = rows.find(
      (r) => r[0] === '1-1001' && String(r[1]).includes('SUBTOTAL')
    );
    expect(subtotalKas).toBeDefined();
    expect(subtotalKas?.[6]).toBe(500000);
    expect(subtotalKas?.[7]).toBe(200000);
    expect(subtotalKas?.[8]).toBe(1300000);

    // Check grand total row at the end
    const lastRow = rows[rows.length - 1];
    expect(lastRow?.[0]).toBe('TOTAL KESELURUHAN');
    expect(lastRow?.[6]).toBe(1500000); // debit total
    expect(lastRow?.[7]).toBe(700000); // credit total
  });
});

