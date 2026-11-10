/**
 * Helper murni untuk pengelolaan buku besar banyak akun (A33).
 */

import type { Account, Ledger, LedgerRow } from './finance';
import { sourceLabel } from './finance';
import { toCsv } from './report';

export interface MultiLedgerSummary {
  totalOpening: number;
  totalDebit: number;
  totalCredit: number;
  totalClosing: number;
  accountCount: number;
  movementCount: number;
}

/**
 * Hitung ringkasan akumulatif dari daftar buku besar banyak akun.
 */
export function computeMultiLedgerSummary(
  ledgers: readonly Ledger[]
): MultiLedgerSummary {
  let totalOpening = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  let totalClosing = 0;
  let movementCount = 0;

  for (const l of ledgers) {
    totalOpening += l.opening;
    totalDebit += l.debit;
    totalCredit += l.credit;
    totalClosing += l.closing;
    movementCount += l.rows.length;
  }

  return {
    totalOpening,
    totalDebit,
    totalCredit,
    totalClosing,
    accountCount: ledgers.length,
    movementCount,
  };
}

/**
 * Urutkan daftar buku besar berdasarkan kode akun lalu nama.
 */
export function sortLedgersByAccount(ledgers: readonly Ledger[]): Ledger[] {
  return [...ledgers].sort((a, b) => {
    const codeA = a.account.code.trim();
    const codeB = b.account.code.trim();
    const cmp = codeA.localeCompare(codeB, undefined, { numeric: true });
    if (cmp !== 0) return cmp;
    return a.account.name.localeCompare(b.account.name);
  });
}

/**
 * Filter daftar akun berdasarkan teks pencarian (kode, nama, atau kategori).
 */
export function filterAccountsForLedger(
  accounts: readonly Account[],
  query: string
): Account[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...accounts];

  return accounts.filter((a) => {
    return (
      a.code.toLowerCase().includes(needle) ||
      a.name.toLowerCase().includes(needle) ||
      (a.category && a.category.toLowerCase().includes(needle))
    );
  });
}

/**
 * Format string CSV dengan UTF-8 Byte Order Mark (BOM) agar kompatibel sempurna dengan Microsoft Excel.
 */
export function toCsvWithBom(rows: (string | number)[][]): string {
  const csv = toCsv(rows);
  return '\uFEFF' + csv;
}

/**
 * Bangun baris-baris data tabular CSV untuk ekspor buku besar multi-akun.
 */
export function buildMultiLedgerCsvRows(
  ledgers: readonly Ledger[],
  rangeLabel?: string
): (string | number)[][] {
  const sorted = sortLedgersByAccount(ledgers);
  const summary = computeMultiLedgerSummary(sorted);

  const rows: (string | number)[][] = [
    ['BUKU BESAR (GENERAL LEDGER)'],
    rangeLabel ? [`Periode: ${rangeLabel}`] : [],
    [`Jumlah Akun: ${sorted.length}`, `Total Transaksi: ${summary.movementCount}`],
    [],
    [
      'Kode Akun',
      'Nama Akun',
      'Tanggal',
      'Nomor Jurnal',
      'Sumber',
      'Keterangan',
      'Debit',
      'Kredit',
      'Saldo Berjalan',
    ],
  ];

  for (const l of sorted) {
    const acc = l.account;

    // Baris Saldo Awal Akun
    rows.push([
      acc.code,
      acc.name,
      '-',
      '-',
      'SALDO AWAL',
      'Saldo awal periode',
      0,
      0,
      l.opening,
    ]);

    // Baris Gerakan Transaksi
    for (const r of l.rows) {
      const desc = r.memo ? `${r.description} · ${r.memo}` : r.description;
      rows.push([
        acc.code,
        acc.name,
        r.date,
        r.number,
        sourceLabel(r.sourceType),
        desc,
        r.debit,
        r.credit,
        r.balance,
      ]);
    }

    // Baris Subtotal per Akun
    rows.push([
      acc.code,
      `SUBTOTAL ${acc.name}`,
      '',
      '',
      '',
      `Saldo Akhir: ${l.closing}`,
      l.debit,
      l.credit,
      l.closing,
    ]);

    // Pemisah antar akun
    rows.push([]);
  }

  // Baris Total Keseluruhan
  rows.push([
    'TOTAL KESELURUHAN',
    `(${sorted.length} akun)`,
    '',
    '',
    '',
    `Total Saldo Akhir: ${summary.totalClosing}`,
    summary.totalDebit,
    summary.totalCredit,
    summary.totalClosing,
  ]);

  return rows;
}
