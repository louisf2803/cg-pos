import { describe, expect, it } from 'vitest';
import { createFakeData } from '../src/fake';

describe('A124: Customer Deposit Detail & Ledger DataLayer', () => {
  it('menyediakan saldo deposit dan mutasi deposit pelanggan terdaftar', async () => {
    const data = createFakeData({ seed: true });

    // Cek saldo deposit pelanggan dari seed
    const depAni = await data.getCustomerDeposit('cu-ani');
    expect(depAni).not.toBeNull();
    expect(depAni?.customerName).toBe('Bu Ani');
    expect(depAni?.totalDepositPurchased).toBe(550000);
    expect(depAni?.currentBalance).toBe(550000);

    const depBudi = await data.getCustomerDeposit('cu-budi');
    expect(depBudi).not.toBeNull();
    expect(depBudi?.customerName).toBe('Pak Budi');
    expect(depBudi?.totalDepositPurchased).toBe(100000);
    expect(depBudi?.currentBalance).toBe(100000);

    // Pelanggan tanpa riwayat deposit
    const depDewi = await data.getCustomerDeposit('cu-dewi');
    expect(depDewi).not.toBeNull();
    expect(depDewi?.currentBalance).toBe(0);

    // Pelanggan tidak valid
    const depInvalid = await data.getCustomerDeposit('cu-tidak-ada');
    expect(depInvalid).toBeNull();

    // Daftar semua saldo deposit
    const allBalances = await data.listCustomerDepositBalances();
    expect(allBalances.length).toBeGreaterThanOrEqual(2);
    expect(allBalances.some((b) => b.customerId === 'cu-ani')).toBe(true);
    expect(allBalances.some((b) => b.customerId === 'cu-budi')).toBe(true);

    // Riwayat transaksi deposit pelanggan
    const entriesAni = await data.listCustomerDepositEntries('cu-ani');
    expect(entriesAni.length).toBeGreaterThan(0);
    expect(entriesAni[0]?.kind).toBe('purchase');
    expect(entriesAni[0]?.creditAmount).toBe(550000);
    expect(entriesAni[0]?.orderNumber).toBe('DEP/2611/001');

    const entriesDewi = await data.listCustomerDepositEntries('cu-dewi');
    expect(entriesDewi).toEqual([]);
  });
});
