import { describe, expect, it } from 'vitest';
import {
  canDeleteDepositPackage,
  depositBonusAmount,
  depositBonusPct,
  depositPackageProblem,
  summarizeDepositRefunds,
  summarizeDepositSales,
} from '../src/deposit';

describe('deposit helpers', () => {
  it('computes bonus amount and percentage cleanly', () => {
    expect(depositBonusAmount({ creditAmount: 550000, salePrice: 500000 })).toBe(50000);
    expect(depositBonusPct({ creditAmount: 550000, salePrice: 500000 })).toBe(10);
    expect(depositBonusAmount({ creditAmount: 100000, salePrice: 100000 })).toBe(0);
    expect(depositBonusPct({ creditAmount: 100000, salePrice: 100000 })).toBe(0);
  });

  it('prevents permanent deletion once package has sales history', () => {
    expect(canDeleteDepositPackage({ soldCount: 0 })).toBe(true);
    expect(canDeleteDepositPackage({ soldCount: 3 })).toBe(false);
  });

  it('validates package inputs', () => {
    expect(depositPackageProblem({ name: '   ', creditAmount: 100000, salePrice: 100000 })).toBe(
      'Nama paket deposit wajib diisi.',
    );
    expect(
      depositPackageProblem({ name: 'Paket A', creditAmount: 500, salePrice: 500 }),
    ).toBe('Nominal saldo yang didapat minimal Rp 1.000 (bilangan bulat).');
    expect(
      depositPackageProblem({ name: 'Paket Mahal', creditAmount: 100000, salePrice: 120000 }),
    ).toBe('Harga jual paket tidak boleh lebih mahal dari nominal saldo yang didapat pelanggan.');
    expect(
      depositPackageProblem({ name: 'Deposit 500rb', creditAmount: 550000, salePrice: 500000 }),
    ).toBeNull();
  });

  it('summarizes sales and refund deposit records', () => {
    const sales = summarizeDepositSales([
      {
        id: 'ds1',
        occurredAt: '2026-11-11T04:00:00Z',
        customerName: 'Rina',
        packageName: 'Deposit 500rb',
        salePrice: 500000,
        creditAmount: 550000,
        methodName: 'QRIS',
        orderNumber: 'DEP/001',
      },
      {
        id: 'ds2',
        occurredAt: '2026-11-10T07:00:00Z',
        customerName: 'Budi',
        packageName: 'Deposit 100rb',
        salePrice: 100000,
        creditAmount: 100000,
        methodName: 'Tunai',
        orderNumber: 'DEP/002',
      },
    ]);
    expect(sales).toEqual({
      count: 2,
      totalSalePrice: 600000,
      totalCreditGiven: 650000,
      totalBonus: 50000,
    });

    const refunds = summarizeDepositRefunds([
      {
        id: 'dr1',
        occurredAt: '2026-11-11T06:00:00Z',
        customerName: 'Dian',
        amount: 75000,
        reason: 'Pindah domisili',
        processedBy: 'Manajer',
      },
    ]);
    expect(refunds).toEqual({ count: 1, totalRefundAmount: 75000 });
  });
});

