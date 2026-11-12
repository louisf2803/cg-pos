import { describe, expect, it } from 'vitest';
import type { PriceChange } from '../src/types';
import { summarizePriceChanges } from '../src/price-change';
import { filterPriceChanges, splitVoidPriceChanges } from '../src/price-change-report';

const SAMPLE: PriceChange[] = [
  {
    orderId: 'o1',
    orderNumber: 'OUT1/A/261112/001',
    orderStatus: 'paid',
    itemId: 'i1',
    itemName: 'Americano',
    qty: 2,
    basePrice: 25000,
    unitPrice: 20000,
    diff: -5000,
    diffPct: -20,
    lineImpact: -10000,
    cashierId: 'c1',
    cashierName: 'Sari',
    at: '2026-11-12T03:00:00.000Z',
  },
  {
    orderId: 'o2',
    orderNumber: 'OUT1/A/261112/002',
    orderStatus: 'paid',
    itemId: 'i2',
    itemName: 'Matcha Latte',
    qty: 1,
    basePrice: 30000,
    unitPrice: 35000,
    diff: 5000,
    diffPct: 16.7,
    lineImpact: 5000,
    cashierId: 'c2',
    cashierName: 'Budi',
    at: '2026-11-12T04:00:00.000Z',
  },
  {
    orderId: 'o3',
    orderNumber: 'OUT1/A/261112/003',
    orderStatus: 'void',
    itemId: 'i3',
    itemName: 'Croissant',
    qty: 3,
    basePrice: 20000,
    unitPrice: 15000,
    diff: -5000,
    diffPct: -25,
    lineImpact: -15000,
    cashierId: 'c1',
    cashierName: 'Sari',
    at: '2026-11-12T05:00:00.000Z',
  },
];

describe('price-change-report helpers', () => {
  it('menyaring menurut kasir, arah perubahan, dan pencarian', () => {
    expect(filterPriceChanges(SAMPLE, { cashierId: 'c1' })).toHaveLength(2);
    expect(filterPriceChanges(SAMPLE, { direction: 'lowered' })).toHaveLength(2);
    expect(filterPriceChanges(SAMPLE, { direction: 'raised' }).map((x) => x.itemId)).toEqual(['i2']);
    expect(filterPriceChanges(SAMPLE, { search: 'matcha' }).map((x) => x.itemId)).toEqual(['i2']);
    expect(filterPriceChanges(SAMPLE, { search: '003' }).map((x) => x.itemId)).toEqual(['i3']);
  });

  it('memisahkan pesanan void dari ringkasan dampak pendapatan', () => {
    const { active, voidCount } = splitVoidPriceChanges(SAMPLE);
    expect(voidCount).toBe(1);
    expect(active).toHaveLength(2);
    const summary = summarizePriceChanges(active);
    expect(summary.count).toBe(2);
    expect(summary.lowered).toBe(1);
    expect(summary.raised).toBe(1);
    expect(summary.totalImpact).toBe(-5000);
    expect(summary.byCashier[0]?.cashierName).toBe('Sari');
  });
});

