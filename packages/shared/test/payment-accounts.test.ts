import { describe, expect, it } from 'vitest';
import type { Account } from '../src/finance';
import { createFakePaymentAccounts, methodAccountOptions, methodAccountProblem } from '../src/payment-accounts';

const acc = (id: string, category: Account['category'], systemKey?: string, extra: Partial<Account> = {}): Account =>
  ({ id, code: id, name: `Akun ${id}`, kind: 'detail', category, isActive: true, ...(systemKey ? { systemKey } : {}), ...extra });
const accounts = [
  acc('kas', 'cash_bank', 'cash_main'), acc('bank', 'cash_bank', 'bank_main'), acc('nt', 'receivable', 'noncash_clearing'),
  acc('gw', 'receivable', 'gateway_clearing'), acc('rev', 'revenue', 'sales_revenue'),
  acc('off', 'cash_bank', undefined, { isActive: false }), acc('hdr', 'cash_bank', undefined, { kind: 'header' }),
];

describe('akun metode bayar', () => {
  it('tunai hanya kas/bank; non-tunai juga piutang; akun nonaktif, header, dan pendapatan tidak muncul', () => {
    expect(methodAccountOptions('cash', accounts).map((a) => a.id)).toEqual(['kas', 'bank']);
    expect(methodAccountOptions('noncash', accounts).map((a) => a.id)).toEqual(['kas', 'bank', 'nt', 'gw']);
    expect(methodAccountOptions('complimentary', accounts)).toEqual([]);
  });
  it('validasi pilihan', () => {
    expect(methodAccountProblem({ kind: 'cash' }, accounts[2])).toMatch(/kas atau bank/);
    expect(methodAccountProblem({ kind: 'gateway' }, accounts[4])).toMatch(/kas, bank, atau piutang/);
    expect(methodAccountProblem({ kind: 'deposit' }, accounts[0])).toMatch(/tidak bisa diubah/);
    expect(methodAccountProblem({ kind: 'noncash' }, accounts[2])).toBeNull();
  });
  it('mode demo: akun bawaan, lalu bisa diubah, pilihan salah ditolak', async () => {
    const s = createFakePaymentAccounts({
      methods: async () => [
        { id: 'm1', code: 'CASH', name: 'Tunai', kind: 'cash' }, { id: 'm2', code: 'QRIS', name: 'QRIS', kind: 'gateway' },
        { id: 'm3', code: 'KOMP', name: 'Komplimen', kind: 'complimentary' },
      ],
      accounts: async () => accounts,
    });
    let list = await s.listPaymentMethodAccounts();
    expect(list.map((m) => m.accountId)).toEqual(['kas', 'gw', '']);
    expect(list[2]!.configurable).toBe(false);
    await s.setPaymentMethodAccount('m1', 'bank');
    list = await s.listPaymentMethodAccounts();
    expect(list[0]!.accountId).toBe('bank');
    await expect(s.setPaymentMethodAccount('m1', 'nt')).rejects.toThrow(/kas atau bank/);
    await expect(s.setPaymentMethodAccount('m3', 'bank')).rejects.toThrow(/tidak bisa diubah/);
  });
});
