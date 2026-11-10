import { describe, expect, it } from 'vitest';
import {
  computeIndirectCashFlow,
  computeNetIncomeFromTrial,
  type IndirectCashFlow,
} from '../src/cashflow-indirect';
import type { TrialRow } from '../src/finance';

describe('Arus Kas Metode Tidak Langsung (Indirect Cash Flow)', () => {
  it('menghitung laba bersih dari baris neraca saldo secara akurat', () => {
    const trial: TrialRow[] = [
      { accountId: '1', code: '4-1000', name: 'Penjualan', category: 'revenue', opening: 0, debit: 0, credit: 10000000, closing: 10000000 },
      { accountId: '2', code: '4-1100', name: 'Pendapatan Jasa', category: 'revenue', opening: 0, debit: 0, credit: 2000000, closing: 2000000 },
      { accountId: '3', code: '5-1000', name: 'HPP', category: 'cogs', opening: 0, debit: 5000000, credit: 0, closing: 5000000 },
      { accountId: '4', code: '6-1000', name: 'Beban Gaji', category: 'expense', opening: 0, debit: 3000000, credit: 0, closing: 3000000 },
      { accountId: '5', code: '7-1000', name: 'Pendapatan Bunga', category: 'other_income', opening: 0, debit: 0, credit: 500000, closing: 500000 },
      { accountId: '6', code: '8-1000', name: 'Beban Adm Bank', category: 'other_expense', opening: 0, debit: 100000, credit: 0, closing: 100000 },
    ];

    // (10.000.000 + 2.000.000 + 500.000) - (5.000.000 + 3.000.000 + 100.000)
    // = 12.500.000 - 8.100.000 = 4.400.000
    const net = computeNetIncomeFromTrial(trial);
    expect(net).toBe(4400000);
  });

  it('rekonsiliasi sempurna ketika kas bertambah murni dari laba bersih', () => {
    const trial: TrialRow[] = [
      { accountId: 'kas', code: '1-1100', name: 'Kas Utama', category: 'cash_bank', opening: 5000000, debit: 3000000, credit: 0, closing: 8000000 },
      { accountId: 'rev', code: '4-1000', name: 'Penjualan Tunai', category: 'revenue', opening: 0, debit: 0, credit: 3000000, closing: 3000000 },
    ];

    const cf = computeIndirectCashFlow(trial);
    expect(cf.netIncome).toBe(3000000);
    expect(cf.operating.subtotal).toBe(3000000);
    expect(cf.investing.subtotal).toBe(0);
    expect(cf.financing.subtotal).toBe(0);
    expect(cf.totalCashFlow).toBe(3000000);
    expect(cf.cashSummary.opening).toBe(5000000);
    expect(cf.cashSummary.closing).toBe(8000000);
    expect(cf.cashSummary.netChange).toBe(3000000);
    expect(cf.reconciled).toBe(true);
    expect(cf.discrepancy).toBe(0);
  });

  it('rekonsiliasi terbukti dengan penyesuaian modal kerja (piutang, persediaan, utang)', () => {
    // Skenario bisnis:
    // Laba bersih: Penjualan 10jt - HPP 6jt = 4jt
    // Piutang naik 1jt (penjualan belum diterima kas: arus kas -1jt)
    // Persediaan naik 500rb (stok bertambah: arus kas -500rb)
    // Utang usaha naik 1.2jt (pembelian persediaan belum dibayar: arus kas +1.2jt)
    // Beban penyusutan 300rb (non-kas: ditambahkan kembali +300rb)
    // Arus kas operasi seharusnya: 4jt - 1jt - 500rb + 1.2jt + 300rb = 4jt netto = 3.7jt
    // Pembelian peralatan 2jt (arus kas investasi: -2jt)
    // Tambahan modal disetor 1jt (arus kas pendanaan: +1jt)
    // Total arus kas bersih = 4jt - 1jt - 500rb + 1.2jt + 300rb - 2jt + 1jt = 3.000.000
    // Saldo kas awal 2jt -> kas akhir 5jt -> perubahan kas 3.000.000
    const trial: TrialRow[] = [
      { accountId: 'kas', code: '1-1100', name: 'Kas', category: 'cash_bank', opening: 2000000, debit: 5000000, credit: 2000000, closing: 5000000 },
      { accountId: 'ar', code: '1-1400', name: 'Piutang Usaha', category: 'receivable', opening: 0, debit: 1000000, credit: 0, closing: 1000000 },
      { accountId: 'inv', code: '1-1500', name: 'Persediaan', category: 'inventory', opening: 1000000, debit: 1500000, credit: 1000000, closing: 1500000 },
      { accountId: 'fa', code: '1-2100', name: 'Peralatan', category: 'fixed_asset', opening: 10000000, debit: 2000000, credit: 0, closing: 12000000 },
      { accountId: 'ad', code: '1-2900', name: 'Akumulasi Penyusutan', category: 'accumulated_depreciation', opening: 1000000, debit: 0, credit: 300000, closing: 1300000 },
      { accountId: 'ap', code: '2-1100', name: 'Utang Usaha', category: 'payable', opening: 800000, debit: 0, credit: 1200000, closing: 2000000 },
      { accountId: 'eq', code: '3-1000', name: 'Modal Disetor', category: 'equity', opening: 11200000, debit: 0, credit: 1000000, closing: 12200000 },
      { accountId: 'rev', code: '4-1000', name: 'Penjualan', category: 'revenue', opening: 0, debit: 0, credit: 10000000, closing: 10000000 },
      { accountId: 'cogs', code: '5-1000', name: 'HPP', category: 'cogs', opening: 0, debit: 5700000, credit: 0, closing: 5700000 },
      { accountId: 'dep', code: '6-2000', name: 'Beban Penyusutan', category: 'expense', opening: 0, debit: 300000, credit: 0, closing: 300000 },
    ];

    const cf = computeIndirectCashFlow(trial);

    // Laba bersih = 10jt - 5.7jt - 300rb = 4.000.000
    expect(cf.netIncome).toBe(4000000);

    // Penyesuaian non-kas: penyusutan +300rb
    expect(cf.operating.nonCash).toHaveLength(1);
    expect(cf.operating.nonCash[0]!.cashImpact).toBe(300000);

    // Penyesuaian modal kerja:
    // Piutang: change +1jt -> cashImpact -1jt
    // Persediaan: change +500rb -> cashImpact -500rb
    // Utang: change +1.2jt -> cashImpact +1.2jt
    const piutang = cf.operating.workingCapital.find((x) => x.category === 'receivable');
    const persediaan = cf.operating.workingCapital.find((x) => x.category === 'inventory');
    const utang = cf.operating.workingCapital.find((x) => x.category === 'payable');

    expect(piutang?.cashImpact).toBe(-1000000);
    expect(persediaan?.cashImpact).toBe(-500000);
    expect(utang?.cashImpact).toBe(1200000);

    // Subtotal operasi = 4.000.000 + 300.000 - 1.000.000 - 500.000 + 1.200.000 = 4.000.000
    expect(cf.operating.subtotal).toBe(4000000);

    // Investasi: Peralatan naik 2jt -> cashImpact -2jt
    expect(cf.investing.subtotal).toBe(-2000000);
    expect(cf.investing.lines[0]!.cashImpact).toBe(-2000000);

    // Pendanaan: Modal naik 1jt -> cashImpact +1jt
    expect(cf.financing.subtotal).toBe(1000000);
    expect(cf.financing.lines[0]!.cashImpact).toBe(1000000);

    // Total Arus Kas = 4.000.000 - 2.000.000 + 1.000.000 = 3.000.000
    expect(cf.totalCashFlow).toBe(3000000);
    expect(cf.cashSummary.opening).toBe(2000000);
    expect(cf.cashSummary.closing).toBe(5000000);
    expect(cf.cashSummary.netChange).toBe(3000000);

    // Rekonsiliasi terbukti: total arus kas = perubahan kas
    expect(cf.reconciled).toBe(true);
    expect(cf.discrepancy).toBe(0);
  });

  it('menyediakan baris nol informatif bila tidak ada aktivitas investasi dan pendanaan', () => {
    const trial: TrialRow[] = [
      { accountId: 'kas', code: '1-1100', name: 'Kas', category: 'cash_bank', opening: 1000000, debit: 500000, credit: 0, closing: 1500000 },
      { accountId: 'rev', code: '4-1000', name: 'Penjualan', category: 'revenue', opening: 0, debit: 0, credit: 500000, closing: 500000 },
    ];

    const cf = computeIndirectCashFlow(trial);
    expect(cf.investing.lines).toHaveLength(1);
    expect(cf.investing.lines[0]!.cashImpact).toBe(0);
    expect(cf.investing.subtotal).toBe(0);

    expect(cf.financing.lines).toHaveLength(1);
    expect(cf.financing.lines[0]!.cashImpact).toBe(0);
    expect(cf.financing.subtotal).toBe(0);
  });

  it('mendeteksi diskrepansi bila ada penyesuaian khusus yang belum terhubung ke kas', () => {
    // Skenario: laba bersih 1jt, kas bertambah 1.2jt (selisih 200rb)
    const trial: TrialRow[] = [
      { accountId: 'kas', code: '1-1100', name: 'Kas', category: 'cash_bank', opening: 1000000, debit: 1200000, credit: 0, closing: 2200000 },
      { accountId: 'rev', code: '4-1000', name: 'Penjualan', category: 'revenue', opening: 0, debit: 0, credit: 1000000, closing: 1000000 },
    ];

    const cf = computeIndirectCashFlow(trial);
    expect(cf.totalCashFlow).toBe(1000000);
    expect(cf.cashSummary.netChange).toBe(1200000);
    expect(cf.reconciled).toBe(false);
    expect(cf.discrepancy).toBe(-200000);
  });
});

