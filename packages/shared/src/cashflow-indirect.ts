import type { AccountCategory } from './finance';
import type { TrialRow } from './finance';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface IndirectCashFlowLine {
  id: string;
  code: string;
  name: string;
  category: AccountCategory;
  opening: number;
  closing: number;
  change: number; // closing - opening
  cashImpact: number; // efek terhadap kas
  label: string;
}

export interface IndirectCashFlowSection {
  title: string;
  lines: IndirectCashFlowLine[];
  subtotal: number;
}

export interface IndirectCashFlow {
  netIncome: number;
  operating: {
    netIncome: number;
    nonCash: IndirectCashFlowLine[];
    workingCapital: IndirectCashFlowLine[];
    subtotal: number;
  };
  investing: {
    lines: IndirectCashFlowLine[];
    subtotal: number;
  };
  financing: {
    lines: IndirectCashFlowLine[];
    subtotal: number;
  };
  totalCashFlow: number;
  cashSummary: {
    opening: number;
    closing: number;
    netChange: number;
  };
  reconciled: boolean;
  discrepancy: number; // totalCashFlow - cashSummary.netChange
}

/**
 * Menghitung laba bersih periode berjalan langsung dari baris Neraca Saldo (Trial Balance).
 * Rumus: (Pendapatan + Pendapatan Lain) - (HPP + Beban Operasional + Beban Lain)
 */
export function computeNetIncomeFromTrial(rows: TrialRow[]): number {
  let rev = 0;
  let otherInc = 0;
  let cogs = 0;
  let exp = 0;
  let otherExp = 0;

  for (const r of rows) {
    // Sisi kredit untuk kategori pendapatan
    if (r.category === 'revenue') {
      rev += r.credit - r.debit;
    } else if (r.category === 'other_income') {
      otherInc += r.credit - r.debit;
    } else if (r.category === 'cogs') {
      cogs += r.debit - r.credit;
    } else if (r.category === 'expense') {
      exp += r.debit - r.credit;
    } else if (r.category === 'other_expense') {
      otherExp += r.debit - r.credit;
    }
  }

  return round2(rev + otherInc - cogs - exp - otherExp);
}

/**
 * Menghasilkan label ramah Indonesia untuk baris penyesuaian arus kas.
 */
function createAdjustmentLabel(name: string, category: AccountCategory, change: number): string {
  if (category === 'accumulated_depreciation') {
    return `Beban penyusutan non-kas (${name})`;
  }
  const isIncrease = change > 0;
  switch (category) {
    case 'receivable':
      return isIncrease ? `Kenaikan piutang (${name})` : `Penurunan piutang (${name})`;
    case 'inventory':
      return isIncrease ? `Kenaikan persediaan (${name})` : `Penurunan persediaan (${name})`;
    case 'other_current_asset':
      return isIncrease ? `Kenaikan aset lancar lainnya (${name})` : `Penurunan aset lancar lainnya (${name})`;
    case 'payable':
      return isIncrease ? `Kenaikan utang usaha (${name})` : `Penurunan utang usaha (${name})`;
    case 'short_term_liability':
      return isIncrease ? `Kenaikan kewajiban lancar (${name})` : `Penurunan kewajiban lancar (${name})`;
    case 'fixed_asset':
      return isIncrease ? `Perolehan aset tetap (${name})` : `Pelepasan aset tetap (${name})`;
    case 'long_term_liability':
      return isIncrease ? `Penerimaan pinjaman jangka panjang (${name})` : `Pelunasan pinjaman jangka panjang (${name})`;
    case 'equity':
      return isIncrease ? `Penambahan modal disetor (${name})` : `Pengurangan modal/prive (${name})`;
    default:
      return `Perubahan saldo ${name}`;
  }
}

/**
 * Menghitung Laporan Arus Kas Metode Tidak Langsung (Indirect Cash Flow)
 * berdasarkan baris Neraca Saldo (TrialRow[]) dan laba bersih periode.
 */
export function computeIndirectCashFlow(
  trialRows: TrialRow[],
  netIncomeOverride?: number
): IndirectCashFlow {
  const netIncome = typeof netIncomeOverride === 'number'
    ? round2(netIncomeOverride)
    : computeNetIncomeFromTrial(trialRows);

  const nonCash: IndirectCashFlowLine[] = [];
  const workingCapital: IndirectCashFlowLine[] = [];
  const investingLines: IndirectCashFlowLine[] = [];
  const financingLines: IndirectCashFlowLine[] = [];

  let cashOpening = 0;
  let cashClosing = 0;

  for (const r of trialRows) {
    const change = round2(r.closing - r.opening);

    // Akun Kas dan Bank
    if (r.category === 'cash_bank') {
      cashOpening = round2(cashOpening + r.opening);
      cashClosing = round2(cashClosing + r.closing);
      continue;
    }

    // Hanya proses akun yang ada saldo atau perubahan
    const hasMovement = r.opening !== 0 || r.closing !== 0 || change !== 0;

    // 1. Penyesuaian Non-Kas: Akumulasi Penyusutan (kredit normal)
    if (r.category === 'accumulated_depreciation') {
      if (hasMovement) {
        // Kenaikan akumulasi penyusutan ditambahkan kembali ke laba bersih
        const cashImpact = round2(change);
        nonCash.push({
          id: r.accountId,
          code: r.code,
          name: r.name,
          category: r.category,
          opening: r.opening,
          closing: r.closing,
          change,
          cashImpact,
          label: createAdjustmentLabel(r.name, r.category, change),
        });
      }
      continue;
    }

    // 2. Modal Kerja Operasional:
    // Aset lancar: kenaikan = arus kas keluar (-)
    if (r.category === 'receivable' || r.category === 'inventory' || r.category === 'other_current_asset') {
      if (hasMovement) {
        const cashImpact = round2(-change);
        workingCapital.push({
          id: r.accountId,
          code: r.code,
          name: r.name,
          category: r.category,
          opening: r.opening,
          closing: r.closing,
          change,
          cashImpact,
          label: createAdjustmentLabel(r.name, r.category, change),
        });
      }
      continue;
    }

    // Kewajiban lancar: kenaikan = arus kas masuk (+)
    if (r.category === 'payable' || r.category === 'short_term_liability') {
      if (hasMovement) {
        const cashImpact = round2(change);
        workingCapital.push({
          id: r.accountId,
          code: r.code,
          name: r.name,
          category: r.category,
          opening: r.opening,
          closing: r.closing,
          change,
          cashImpact,
          label: createAdjustmentLabel(r.name, r.category, change),
        });
      }
      continue;
    }

    // 3. Arus Kas Investasi: Aset Tetap
    if (r.category === 'fixed_asset') {
      if (hasMovement) {
        // Kenaikan aset tetap (pembelian) = kas keluar (-)
        const cashImpact = round2(-change);
        investingLines.push({
          id: r.accountId,
          code: r.code,
          name: r.name,
          category: r.category,
          opening: r.opening,
          closing: r.closing,
          change,
          cashImpact,
          label: createAdjustmentLabel(r.name, r.category, change),
        });
      }
      continue;
    }

    // 4. Arus Kas Pendanaan: Kewajiban Jangka Panjang & Ekuitas
    if (r.category === 'long_term_liability' || r.category === 'equity') {
      if (hasMovement) {
        // Kenaikan modal / hutang jangka panjang = kas masuk (+)
        const cashImpact = round2(change);
        financingLines.push({
          id: r.accountId,
          code: r.code,
          name: r.name,
          category: r.category,
          opening: r.opening,
          closing: r.closing,
          change,
          cashImpact,
          label: createAdjustmentLabel(r.name, r.category, change),
        });
      }
      continue;
    }
  }

  // Jika tidak ada akun investasi atau pendanaan yang bergerak, sediakan baris nol informatif
  if (investingLines.length === 0) {
    investingLines.push({
      id: 'inv-zero',
      code: '-',
      name: 'Tidak ada perolehan atau pelepasan aset tetap',
      category: 'fixed_asset',
      opening: 0,
      closing: 0,
      change: 0,
      cashImpact: 0,
      label: 'Tidak ada aktivitas investasi di periode ini',
    });
  }

  if (financingLines.length === 0) {
    financingLines.push({
      id: 'fin-zero',
      code: '-',
      name: 'Tidak ada perubahan pinjaman jangka panjang atau ekuitas',
      category: 'equity',
      opening: 0,
      closing: 0,
      change: 0,
      cashImpact: 0,
      label: 'Tidak ada aktivitas pendanaan di periode ini',
    });
  }

  const operatingAdjustments = [...nonCash, ...workingCapital];
  const operatingAdjustmentsSum = round2(
    operatingAdjustments.reduce((sum, item) => sum + item.cashImpact, 0)
  );
  const operatingSubtotal = round2(netIncome + operatingAdjustmentsSum);

  const investingSubtotal = round2(
    investingLines.reduce((sum, item) => sum + item.cashImpact, 0)
  );

  const financingSubtotal = round2(
    financingLines.reduce((sum, item) => sum + item.cashImpact, 0)
  );

  const totalCashFlow = round2(operatingSubtotal + investingSubtotal + financingSubtotal);
  const netCashChange = round2(cashClosing - cashOpening);
  const discrepancy = round2(totalCashFlow - netCashChange);
  const reconciled = Math.abs(discrepancy) < 0.01;

  return {
    netIncome,
    operating: {
      netIncome,
      nonCash,
      workingCapital,
      subtotal: operatingSubtotal,
    },
    investing: {
      lines: investingLines,
      subtotal: investingSubtotal,
    },
    financing: {
      lines: financingLines,
      subtotal: financingSubtotal,
    },
    totalCashFlow,
    cashSummary: {
      opening: cashOpening,
      closing: cashClosing,
      netChange: netCashChange,
    },
    reconciled,
    discrepancy,
  };
}

