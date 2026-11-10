import { describe, expect, it } from 'vitest';
import { extractIncomeBreakdown } from '../src';
import type { StatementRow } from '../src';

describe('finance-widget: extractIncomeBreakdown', () => {
  it('menghitung rincian pendapatan, beban, dan laba bersih dari baris eksplisit', () => {
    const rows: StatementRow[] = [
      { section: 'revenue', code: '4-1000', name: 'Penjualan Makanan', amount: 15_000_000 },
      { section: 'revenue', code: '4-2000', name: 'Penjualan Minuman', amount: 5_000_000 },
      { section: 'cogs', code: '5-1000', name: 'HPP Bahan Baku', amount: 8_000_000 },
      { section: 'expense', code: '6-1000', name: 'Gaji Karyawan', amount: 4_000_000 },
      { section: 'expense', code: '6-2000', name: 'Listrik & Air', amount: 1_000_000 },
      { section: 'net_profit', code: '9-9999', name: 'Laba Bersih', amount: 7_000_000 },
    ];

    const result = extractIncomeBreakdown(rows);
    expect(result.revenue).toBe(20_000_000);
    expect(result.expenses).toBe(13_000_000);
    expect(result.netProfit).toBe(7_000_000);
  });

  it('menghitung laba bersih otomatis jika baris net_profit tidak ada', () => {
    const rows: StatementRow[] = [
      { section: 'revenue', code: '4-1000', name: 'Penjualan', amount: 10_000_000 },
      { section: 'expense', code: '6-1000', name: 'Sewa Tempat', amount: 3_500_000 },
    ];

    const result = extractIncomeBreakdown(rows);
    expect(result.revenue).toBe(10_000_000);
    expect(result.expenses).toBe(3_500_000);
    expect(result.netProfit).toBe(6_500_000);
  });

  it('mengembalikan 0 jika baris kosong', () => {
    const result = extractIncomeBreakdown([]);
    expect(result.revenue).toBe(0);
    expect(result.expenses).toBe(0);
    expect(result.netProfit).toBe(0);
  });
});

