import { describe, expect, it } from 'vitest';
import {
  buildStockKindMap,
  filterWasteMoves,
  summarizeWasteMoves,
  type StockMoveEntry,
} from '../src';

const MOVES: StockMoveEntry[] = [
  {
    id: 'w1',
    productId: 'p-milk',
    productName: 'Susu UHT',
    unit: 'ml',
    kind: 'waste',
    qtyDelta: -500,
    unitCost: 20,
    totalCost: -10000,
    qtyAfter: 1500,
    avgCostAfter: 20,
    reason: 'Tumpah di bar',
    occurredAt: '2026-11-12T03:00:00.000Z',
  },
  {
    id: 'w2',
    productId: 'p-milk',
    productName: 'Susu UHT',
    unit: 'ml',
    kind: 'waste',
    qtyDelta: -250,
    unitCost: 20,
    totalCost: -5000,
    qtyAfter: 1250,
    avgCostAfter: 20,
    reason: 'Kedaluwarsa',
    occurredAt: '2026-11-12T05:00:00.000Z',
  },
  {
    id: 'w3',
    productId: 'p-cake',
    productName: 'Croissant Butter',
    unit: 'pcs',
    kind: 'waste',
    qtyDelta: -2,
    unitCost: 15000,
    totalCost: -30000,
    qtyAfter: 3,
    avgCostAfter: 15000,
    reason: 'Gosong oven',
    occurredAt: '2026-11-12T06:00:00.000Z',
  },
];

describe('waste-report helpers', () => {
  it('filters by search (product or reason) and itemKind', () => {
    const kindMap = buildStockKindMap([
      { productId: 'p-milk', kind: 'ingredient' },
      { productId: 'p-cake', kind: 'goods' },
    ]);

    expect(filterWasteMoves(MOVES, kindMap, { search: 'tumpah' }).map((m) => m.id)).toEqual(['w1']);
    expect(filterWasteMoves(MOVES, kindMap, { search: 'croissant' }).map((m) => m.id)).toEqual(['w3']);
    expect(filterWasteMoves(MOVES, kindMap, { itemKind: 'ingredient' }).map((m) => m.id)).toEqual([
      'w1',
      'w2',
    ]);
    expect(filterWasteMoves(MOVES, kindMap, { itemKind: 'goods' }).map((m) => m.id)).toEqual(['w3']);
  });

  it('summarizes total incidents, value, top frequent item, and sorts byProduct by largest value', () => {
    const kindMap = buildStockKindMap([
      { productId: 'p-milk', kind: 'ingredient' },
      { productId: 'p-cake', kind: 'goods' },
    ]);

    const { summary, byProduct } = summarizeWasteMoves(MOVES, kindMap);
    expect(summary.incidentCount).toBe(3);
    expect(summary.totalValue).toBe(45000);
    // Most frequent item is Susu UHT (2 incidents) even though Croissant Butter has higher value (30k)
    expect(summary.topProduct?.productId).toBe('p-milk');
    expect(summary.topProduct?.incidentCount).toBe(2);
    expect(summary.topProduct?.totalQty).toBe(750);

    // Table Per barang is ordered by largest totalValue descending
    expect(byProduct.map((r) => r.productId)).toEqual(['p-cake', 'p-milk']);
    expect(byProduct[0]?.totalValue).toBe(30000);
    expect(byProduct[1]?.totalValue).toBe(15000);
  });

  it('returns empty summary cleanly', () => {
    const { summary, byProduct } = summarizeWasteMoves([]);
    expect(summary).toEqual({ incidentCount: 0, totalValue: 0, topProduct: null });
    expect(byProduct).toEqual([]);
  });
});

