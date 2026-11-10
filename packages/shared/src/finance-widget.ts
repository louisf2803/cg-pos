import type { StatementRow } from './finance';

export interface IncomeBreakdown {
  revenue: number;
  expenses: number;
  netProfit: number;
}

/**
 * Menghitung rincian pendapatan, total beban, dan laba bersih dari baris laporan laba rugi.
 */
export function extractIncomeBreakdown(rows: StatementRow[]): IncomeBreakdown {
  let revenue = 0;
  let expenses = 0;
  let foundNetProfit = false;
  let netProfit = 0;

  for (const r of rows) {
    if (r.section === 'revenue' || r.section === 'other_income') {
      revenue += r.amount;
    } else if (r.section === 'cogs' || r.section === 'expense' || r.section === 'other_expense') {
      expenses += r.amount;
    } else if (r.section === 'net_profit') {
      netProfit = r.amount;
      foundNetProfit = true;
    }
  }

  if (!foundNetProfit) {
    netProfit = Math.round((revenue - expenses) * 100) / 100;
  }

  return {
    revenue: Math.round(revenue * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
  };
}

