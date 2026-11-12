import { describe, expect, it } from 'vitest';
import {
  filterShiftRows,
  groupShiftsByCashier,
} from '../src/cashier-report';
import type { ShiftReportRow } from '../src';

describe('cashier-report helpers', () => {
  const rows: ShiftReportRow[] = [
    {
      shift: { id: 's1', cashierId: 'c1', openedAt: '2026-11-12T01:00:00Z', openingCash: 100000, status: 'closed', closedAt: '2026-11-12T08:00:00Z', counted: 450000, expectedCash: 450000, variance: 0 },
      cashierName: 'Sari',
      expectedCash: 450000,
      counted: 450000,
      variance: 0,
      cashSales: 350000,
      otherSales: 200000,
      cashIn: 0,
      cashOut: 0,
      cashRefunds: 0,
      orderCount: 15,
      byMethod: [],
      productsSold: [],
    },
    {
      shift: { id: 's2', cashierId: 'c1', openedAt: '2026-11-12T08:00:00Z', openingCash: 100000, status: 'closed', closedAt: '2026-11-12T16:00:00Z', counted: 390000, expectedCash: 400000, variance: -10000 },
      cashierName: 'Sari',
      expectedCash: 400000,
      counted: 390000,
      variance: -10000,
      cashSales: 300000,
      otherSales: 150000,
      cashIn: 0,
      cashOut: 0,
      cashRefunds: 0,
      orderCount: 12,
      byMethod: [],
      productsSold: [],
    },
    {
      shift: { id: 's3', cashierId: 'c2', openedAt: '2026-11-12T16:00:00Z', openingCash: 100000, status: 'open' },
      cashierName: 'Budi',
      expectedCash: 250000,
      counted: 0,
      variance: 0,
      cashSales: 150000,
      otherSales: 50000,
      cashIn: 0,
      cashOut: 0,
      cashRefunds: 0,
      orderCount: 6,
      byMethod: [],
      productsSold: [],
    },
  ];

  it('groups shifts by cashier properly', () => {
    const grouped = groupShiftsByCashier(rows);
    expect(grouped).toHaveLength(2);

    const budi = grouped.find((x) => x.cashierId === 'c2')!;
    expect(budi.cashierName).toBe('Budi');
    expect(budi.shiftCount).toBe(1);
    expect(budi.openShiftCount).toBe(1);
    expect(budi.closedShiftCount).toBe(0);
    expect(budi.totalCashSales).toBe(150000);

    const sari = grouped.find((x) => x.cashierId === 'c1')!;
    expect(sari.cashierName).toBe('Sari');
    expect(sari.shiftCount).toBe(2);
    expect(sari.closedShiftCount).toBe(2);
    expect(sari.totalCashSales).toBe(650000);
    expect(sari.totalOtherSales).toBe(350000);
    expect(sari.totalVariance).toBe(-10000);
  });

  it('filters shifts by cashier, status, or search query', () => {
    const onlyBudi = filterShiftRows(rows, { cashierId: 'c2' });
    expect(onlyBudi).toHaveLength(1);
    expect(onlyBudi[0].cashierName).toBe('Budi');

    const onlyOpen = filterShiftRows(rows, { status: 'open' });
    expect(onlyOpen).toHaveLength(1);
    expect(onlyOpen[0].shift.id).toBe('s3');

    const searched = filterShiftRows(rows, { search: 'sar' });
    expect(searched).toHaveLength(2);
  });
});
