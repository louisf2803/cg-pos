import { describe, expect, it } from 'vitest';
import { approvalProblem, billIsOverdue, createFakeData, DataError, daysUntilDue, nextDueAfter, recurringBillProblem } from '../src';

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof DataError ? e.code : 'galat'));
const base = { name: 'Sewa Ruko', amount: 5_000_000, frequency: 'monthly' as const, nextDue: '2026-01-31', expenseAccountId: 'akun-sewa' };

describe('jatuh tempo tagihan rutin', () => {
  it('bulanan memakai hari terakhir bulan bila harinya tidak ada (sama dengan server: 31 Jan menjadi 28 Feb)', () => {
    expect(nextDueAfter('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(nextDueAfter('2028-01-31', 'monthly')).toBe('2028-02-29');
    expect(nextDueAfter('2026-12-15', 'monthly')).toBe('2027-01-15');
  });
  it('mingguan +7 hari melewati pergantian bulan dan tahun; tahunan menjaga 29 Februari', () => {
    expect(nextDueAfter('2026-02-01', 'weekly')).toBe('2026-02-08');
    expect(nextDueAfter('2026-12-28', 'weekly')).toBe('2027-01-04');
    expect(nextDueAfter('2028-02-29', 'yearly')).toBe('2029-02-28');
  });
  it('terlambat dan hari menuju jatuh tempo', () => {
    expect(billIsOverdue({ nextDue: '2026-11-01', isActive: true }, '2026-11-12')).toBe(true);
    expect(billIsOverdue({ nextDue: '2026-11-01', isActive: false }, '2026-11-12')).toBe(false);
    expect(billIsOverdue({ nextDue: '2026-11-12', isActive: true }, '2026-11-12')).toBe(false);
    expect(daysUntilDue('2026-11-15', '2026-11-12')).toBe(3);
    expect(daysUntilDue('2026-11-10', '2026-11-12')).toBe(-2);
  });
});

describe('validasi tagihan dan persetujuan', () => {
  it('tagihan', () => {
    expect(recurringBillProblem(base)).toBeNull();
    expect(recurringBillProblem({ ...base, name: ' ' })).toMatch(/Nama/);
    expect(recurringBillProblem({ ...base, amount: 0 })).toMatch(/Jumlah/);
    expect(recurringBillProblem({ ...base, amount: 10.5 })).toMatch(/bulat/);
    expect(recurringBillProblem({ ...base, frequency: 'harian' as never })).toMatch(/Frekuensi/);
    expect(recurringBillProblem({ ...base, nextDue: '2026-02-31x' })).toMatch(/jatuh tempo/);
    expect(recurringBillProblem({ ...base, expenseAccountId: '' })).toMatch(/akun biaya/);
  });
  it('persetujuan', () => {
    expect(approvalProblem({ kind: 'purchase', title: 'Beli mesin', amount: 100 })).toBeNull();
    expect(approvalProblem({ kind: 'lain' as never, title: 'x', amount: 1 })).toMatch(/Jenis/);
    expect(approvalProblem({ kind: 'finance', title: ' ', amount: 1 })).toMatch(/Judul/);
    expect(approvalProblem({ kind: 'finance', title: 'x', amount: -1 })).toMatch(/Jumlah/);
  });
});

describe('tagihan rutin dan persetujuan di data demo', () => {
  it('bayar memajukan jatuh tempo dan mencatat riwayat; nonaktif dan masa depan ditolak; hapus membersihkan riwayat', async () => {
    const d = createFakeData();
    const bill = await d.saveRecurringBill(base);
    expect(await code(d.saveRecurringBill({ ...base, name: '' }))).toBe('invalid');
    expect(await code(d.payRecurringBill(bill.id, '', '2026-02-02'))).toBe('invalid');
    expect(await code(d.payRecurringBill(bill.id, 'kas', '2999-01-01'))).toBe('invalid');
    const paid = await d.payRecurringBill(bill.id, 'kas', '2026-02-02');
    expect(paid.nextDue).toBe('2026-02-28');
    expect(await d.listRecurringBillRuns(bill.id)).toEqual([{ billId: bill.id, dueDate: '2026-01-31', paidOn: '2026-02-02', amount: 5_000_000 }]);
    await d.saveRecurringBill({ ...base, id: bill.id, nextDue: paid.nextDue, isActive: false });
    expect(await code(d.payRecurringBill(bill.id, 'kas', '2026-03-01'))).toBe('invalid');
    expect(await d.listRecurringBills()).toEqual([]);
    expect(await d.listRecurringBills({ includeInactive: true })).toHaveLength(1);
    await d.deleteRecurringBill(bill.id);
    expect(await d.listRecurringBillRuns()).toEqual([]);
    expect(await code(d.deleteRecurringBill(bill.id))).toBe('not_found');
  });
  it('persetujuan: ajukan (idempoten), putuskan final, batalkan', async () => {
    const d = createFakeData();
    const a = await d.requestApproval({ kind: 'purchase', title: 'Beli mesin', amount: 12_000_000, note: 'untuk bar' });
    expect(a).toMatchObject({ status: 'pending', kind: 'purchase', note: 'untuk bar' });
    expect((await d.requestApproval({ id: a.id, kind: 'purchase', title: 'Lain', amount: 1 })).title).toBe('Beli mesin');
    expect(await code(d.requestApproval({ kind: 'purchase', title: '', amount: 1 }))).toBe('invalid');
    expect((await d.listApprovals({ status: 'pending' })).map((x) => x.id)).toEqual([a.id]);
    const decided = await d.decideApproval(a.id, true, 'oke');
    expect(decided).toMatchObject({ status: 'approved', decisionNote: 'oke' });
    expect(await code(d.decideApproval(a.id, false))).toBe('invalid');
    expect(await code(d.cancelApproval(a.id))).toBe('invalid');
    const b = await d.requestApproval({ kind: 'finance', title: 'Transfer', amount: 500_000 });
    expect((await d.cancelApproval(b.id)).status).toBe('cancelled');
    expect(await d.listApprovals({ status: 'pending' })).toEqual([]);
    expect(await code(d.decideApproval('tidak-ada', true))).toBe('not_found');
  });
});
