import type { PriceChange } from './types';

/** Selisih per unit dan persennya terhadap harga dasar (1 desimal). Mengembalikan null bila harga tidak berubah atau harga dasar tidak sah. */
export function priceDelta(basePrice: number, unitPrice: number): { diff: number; diffPct: number } | null {
  if (!Number.isFinite(basePrice) || !Number.isFinite(unitPrice) || basePrice <= 0 || basePrice === unitPrice) return null;
  const diff = unitPrice - basePrice;
  return { diff, diffPct: Math.round((diff / basePrice) * 1000) / 10 };
}

export interface PriceChangeSummary { count: number; lowered: number; raised: number; totalImpact: number; byCashier: { cashierId: string; cashierName: string; count: number; impact: number }[] }

/** Ringkasan laporan harga diubah: dampak = selisih x jumlah (negatif = pendapatan berkurang). Urut dampak terbesar (paling merugikan) dulu. */
export function summarizePriceChanges(list: PriceChange[]): PriceChangeSummary {
  const by = new Map<string, { cashierId: string; cashierName: string; count: number; impact: number }>();
  let lowered = 0, raised = 0, totalImpact = 0;
  for (const c of list) {
    if (c.diff < 0) lowered += 1; else raised += 1;
    totalImpact += c.lineImpact;
    const row = by.get(c.cashierId) ?? { cashierId: c.cashierId, cashierName: c.cashierName, count: 0, impact: 0 };
    row.count += 1; row.impact += c.lineImpact;
    by.set(c.cashierId, row);
  }
  return { count: list.length, lowered, raised, totalImpact, byCashier: [...by.values()].sort((a, b) => a.impact - b.impact) };
}
