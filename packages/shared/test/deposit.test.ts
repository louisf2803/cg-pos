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

  it('handles deposit package CRUD and purchasing via DataLayer', async () => {
    const { createFakeData } = await import('../src/fake');
    const data = createFakeData({ seed: false });

    // Initial empty
    const pkgs = await data.listDepositPackages();
    expect(pkgs).toEqual([]);

    // Save package
    const pkg = await data.saveDepositPackage({
      name: 'Deposit 200rb Bonus 20rb',
      creditAmount: 220000,
      salePrice: 200000,
      note: 'Bonus 10%',
    });
    expect(pkg.id).toBeDefined();
    expect(pkg.name).toBe('Deposit 200rb Bonus 20rb');
    expect(pkg.soldCount).toBe(0);

    // Create a customer
    const cust = await data.saveCustomer({
      name: 'Rudi Pratama',
      phone: '081234567890',
    });

    // Initial deposit balance 0
    const initialDeposit = await data.getCustomerDeposit(cust.id);
    expect(initialDeposit?.currentBalance).toBe(0);

    // Buy package
    const sale = await data.buyDepositPackage({
      customerId: cust.id,
      packageId: pkg.id,
      paymentMethod: 'QRIS',
    });
    expect(sale.id).toBeDefined();
    expect(sale.customerName).toBe('Rudi Pratama');
    expect(sale.creditAmount).toBe(220000);

    // Check customer balance increased
    const afterBuy = await data.getCustomerDeposit(cust.id);
    expect(afterBuy?.currentBalance).toBe(220000);
    expect(afterBuy?.totalDepositPurchased).toBe(220000);

    // Check package soldCount increased
    const pkgsAfter = await data.listDepositPackages();
    expect(pkgsAfter[0]?.soldCount).toBe(1);

    // Cannot delete sold package
    await expect(data.deleteDepositPackage(pkg.id)).rejects.toThrow(/tidak dapat dihapus/i);

    // List customer deposit balances
    const balances = await data.listCustomerDepositBalances();
    expect(balances.length).toBe(1);
    expect(balances[0]?.currentBalance).toBe(220000);

    // List deposit sales
    const sales = await data.listDepositSales();
    expect(sales.length).toBe(1);
    expect(sales[0]?.orderNumber).toContain('DEP/');
  });
});

