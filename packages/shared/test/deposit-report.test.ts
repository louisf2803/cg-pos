import { describe, expect, it } from 'vitest';
import {
  filterCustomerDepositBalances,
  summarizeCustomerDepositBalances,
  type CustomerDepositBalance,
} from '../src/deposit-report';

describe('deposit-report helpers', () => {
  const balances: CustomerDepositBalance[] = [
    {
      customerId: 'c1',
      customerName: 'Rina Kusuma',
      customerPhone: '08123456789',
      totalDepositPurchased: 550000,
      totalDepositUsed: 200000,
      totalDepositRefunded: 0,
      currentBalance: 350000,
      lastTransactionAt: '2026-11-12T10:00:00Z',
    },
    {
      customerId: 'c2',
      customerName: 'Budi Santoso',
      customerPhone: '08567891234',
      totalDepositPurchased: 100000,
      totalDepositUsed: 100000,
      totalDepositRefunded: 0,
      currentBalance: 0,
      lastTransactionAt: '2026-11-11T12:00:00Z',
    },
    {
      customerId: 'c3',
      customerName: 'Fajar Pratama',
      customerPhone: '08999999999',
      totalDepositPurchased: 300000,
      totalDepositUsed: 50000,
      totalDepositRefunded: 150000,
      currentBalance: 100000,
      lastTransactionAt: '2026-11-10T15:00:00Z',
    },
  ];

  it('summarizes customer deposit balances properly', () => {
    const summary = summarizeCustomerDepositBalances(balances);
    expect(summary.customerCount).toBe(3);
    expect(summary.totalPurchased).toBe(950000);
    expect(summary.totalUsed).toBe(350000);
    expect(summary.totalRefunded).toBe(150000);
    expect(summary.totalOutstandingBalance).toBe(450000);
  });

  it('filters customer deposit balances by name or phone', () => {
    const byName = filterCustomerDepositBalances(balances, 'rina');
    expect(byName).toHaveLength(1);
    expect(byName[0].customerId).toBe('c1');

    const byPhone = filterCustomerDepositBalances(balances, '567891');
    expect(byPhone).toHaveLength(1);
    expect(byPhone[0].customerId).toBe('c2');

    const empty = filterCustomerDepositBalances(balances, 'tidak ada');
    expect(empty).toHaveLength(0);
  });
});
