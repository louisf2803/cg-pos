import { describe, expect, it } from 'vitest';
import {
  accountProblem, agingBucket, balanceSheetOf, balanceSheetTotals, cashFlowOf, createFakeData, incomeStatementOf, journalProblem, ledgerOf, newId, payablesBySupplier, sourceLabel,
  trialBalanceOf, type Account, type FinLine,
} from '../src';

const mk = () => { const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') }); d.reset(); return d; };
const acc = (id: string, code: string, name: string, category: Account['category']): Account => ({ id, code, name, kind: 'detail', category, isActive: true });
const KAS = acc('k', '1-1100', 'Kas', 'cash_bank'), MODAL = acc('m', '3-1000', 'Modal', 'equity'), JUAL = acc('j', '4-1000', 'Penjualan', 'revenue'), BEBAN = acc('b', '6-1000', 'Gaji', 'expense');
let n = 0;
const line = (a: Account, date: string, debit: number, credit: number, source = 'manual'): FinLine => ({
  entryId: `e${++n}`, number: `JU-${n}`, date, description: 'x', sourceType: source, status: 'posted', accountId: a.id, code: a.code, name: a.name, category: a.category, debit, credit,
});
const book: FinLine[] = [
  line(KAS, '2026-10-31', 1000, 0, 'opening'), line(MODAL, '2026-10-31', 0, 1000, 'opening'),
  line(KAS, '2026-11-02', 500, 0, 'sale'), line(JUAL, '2026-11-02', 0, 500, 'sale'),
  line(BEBAN, '2026-11-05', 200, 0), line(KAS, '2026-11-05', 0, 200),
];

describe('keuangan: aturan', () => {
  it('kode dan kelompok akun harus cocok', () => {
    expect(accountProblem({ code: '6-1300', name: 'Listrik', kind: 'detail', category: 'expense' })).toBeNull();
    expect(accountProblem({ code: '61300', name: 'Listrik', kind: 'detail', category: 'expense' })).toMatch(/Kode akun/);
    expect(accountProblem({ code: '1-1300', name: 'Listrik', kind: 'detail', category: 'expense' })).toMatch(/berawalan 6/);
    expect(accountProblem({ code: '6-1300', name: '  ', kind: 'detail', category: 'expense' })).toMatch(/Nama/);
  });
  it('jurnal harus seimbang, dua baris, satu sisi per baris', () => {
    const ok = { id: 'a', date: '2026-11-09', description: 'Modal awal', kind: 'opening' as const, lines: [{ accountId: 'k', debit: 100, credit: 0 }, { accountId: 'm', debit: 0, credit: 100 }] };
    expect(journalProblem(ok)).toBeNull();
    expect(journalProblem({ ...ok, lines: [ok.lines[0]!] })).toMatch(/dua baris/);
    expect(journalProblem({ ...ok, lines: [{ accountId: 'k', debit: 100, credit: 0 }, { accountId: 'm', debit: 0, credit: 90 }] })).toMatch(/belum seimbang/);
    expect(journalProblem({ ...ok, lines: [{ accountId: 'k', debit: 100, credit: 100 }, { accountId: 'm', debit: 0, credit: 0 }] })).toMatch(/salah satu/);
    expect(journalProblem({ ...ok, lines: [{ accountId: 'k', debit: 0.001, credit: 0 }, { accountId: 'm', debit: 0, credit: 0.001 }] })).toMatch(/2 angka/);
    expect(journalProblem({ ...ok, description: ' ' })).toMatch(/keterangan/);
  });
});

describe('keuangan: laporan dari baris jurnal', () => {
  it('neraca saldo: saldo awal, mutasi, saldo akhir sesuai sisi normal', () => {
    const t = trialBalanceOf(book, '2026-11-01', '2026-11-30');
    const kas = t.find((r) => r.code === '1-1100')!;
    expect(kas).toMatchObject({ opening: 1000, debit: 500, credit: 200, closing: 1300 });
    expect(t.find((r) => r.code === '3-1000')).toMatchObject({ opening: 1000, closing: 1000 });
    expect(t.find((r) => r.code === '4-1000')).toMatchObject({ opening: 0, credit: 500, closing: 500 });
    expect(t.map((r) => r.code)).toEqual([...t.map((r) => r.code)].sort());
  });
  it('laba rugi: hanya periode, laba kotor dan bersih', () => {
    const rows = incomeStatementOf(book, '2026-11-01', '2026-11-30');
    expect(rows.find((r) => r.section === 'gross_profit')!.amount).toBe(500);
    expect(rows.find((r) => r.section === 'net_profit')!.amount).toBe(300);
    expect(incomeStatementOf(book, '2026-10-01', '2026-10-31').find((r) => r.section === 'net_profit')!.amount).toBe(0);
  });
  it('neraca seimbang dan memuat laba berjalan', () => {
    const rows = balanceSheetOf(book, '2026-11-30');
    const t = balanceSheetTotals(rows);
    expect(t).toEqual({ assets: 1300, liabilities: 0, equity: 1300, balanced: true });
    expect(rows.find((r) => r.code === '3-9999')!.amount).toBe(300);
    expect(balanceSheetTotals(balanceSheetOf(book, '2026-10-31')).assets).toBe(1000);
  });
  it('buku besar: saldo berjalan per baris', () => {
    const l = ledgerOf(book, KAS, '2026-11-01', '2026-11-30');
    expect(l.opening).toBe(1000);
    expect(l.rows.map((r) => r.balance)).toEqual([1500, 1300]);
    expect(l).toMatchObject({ debit: 500, credit: 200, closing: 1300 });
    expect(ledgerOf(book, MODAL, '2026-11-01', '2026-11-30').closing).toBe(1000);    // sisi normal kredit
  });
  it('arus kas: dikelompokkan menurut sumber', () => {
    const c = cashFlowOf(book, '2026-11-01', '2026-11-30');
    expect(c).toMatchObject({ opening: 1000, inflow: 500, outflow: 200, net: 300, closing: 1300 });
    expect(c.groups.map((g) => [g.source, g.net])).toEqual([['sale', 500], ['manual', -200]]);
  });
  it('umur hutang dan ringkasan per pemasok', () => {
    expect([0, 1, 30, 31, 60, 61].map(agingBucket)).toEqual([0, 1, 1, 2, 2, 3]);
    const t = payablesBySupplier([
      { supplierName: 'A', invoiceId: '1', number: 'F1', outstanding: 100, daysOverdue: 0 }, { supplierName: 'A', invoiceId: '2', number: 'F2', outstanding: 50, daysOverdue: 10 },
      { supplierName: 'B', invoiceId: '3', number: 'F3', outstanding: 500, daysOverdue: 0 },
    ]);
    expect(t.map((x) => x.supplierName)).toEqual(['B', 'A']);
    expect(t[1]).toMatchObject({ count: 2, outstanding: 150, overdue: 50 });
    expect(sourceLabel('sale')).toBe('Penjualan'); expect(sourceLabel('zzz')).toBe('zzz');
  });
});

describe('keuangan: data bohongan', () => {
  it('daftar akun bawaan, kode unik, akun sistem terkunci', async () => {
    const d = mk();
    const all = await d.listAccounts();
    expect(all.length).toBeGreaterThanOrEqual(30);
    const kas = all.find((a) => a.systemKey === 'cash_main')!;
    await expect(d.saveAccount({ code: '1-1100', name: 'Dobel', kind: 'detail', category: 'cash_bank' })).rejects.toThrow(/sudah dipakai/);
    await expect(d.saveAccount({ id: kas.id, code: kas.code, name: kas.name, kind: 'detail', category: 'cash_bank', isActive: false })).rejects.toThrow(/Akun sistem/);
    const baru = await d.saveAccount({ code: '6-1300', name: 'Listrik', kind: 'detail', category: 'expense' });
    expect((await d.listAccounts()).some((a) => a.id === baru.id)).toBe(true);
  });
  it('jurnal manual: idempoten, tolak akun induk, bisa dibalik satu kali', async () => {
    const d = mk();
    const all = await d.listAccounts();
    const kas = all.find((a) => a.systemKey === 'cash_main')!, modal = all.find((a) => a.systemKey === 'opening_balance_equity')!, induk = all.find((a) => a.kind === 'header')!;
    const input = { id: newId(), date: '2026-11-09', description: 'Saldo awal kas', kind: 'opening' as const, lines: [{ accountId: kas.id, debit: 750000, credit: 0 }, { accountId: modal.id, debit: 0, credit: 750000 }] };
    const kas0 = (await d.ledger(kas.id, { from: '2026-11-01', to: '2026-11-30' })).closing;
    const j = await d.postJournal(input);
    await d.postJournal(input);
    expect(j.number).toMatch(/^OB-/);
    expect((await d.listJournal({ from: '2026-11-01', to: '2026-11-30', sourceType: 'opening' }))).toHaveLength(1);
    await expect(d.postJournal({ ...input, id: newId(), lines: [{ accountId: induk.id, debit: 1, credit: 0 }, { accountId: modal.id, debit: 0, credit: 1 }] })).rejects.toThrow(/induk/);
    expect((await d.ledger(kas.id, { from: '2026-11-01', to: '2026-11-30' })).closing).toBe(kas0 + 750000);
    const r = await d.reverseJournal(j.id, 'salah catat');
    expect(r.sourceType).toBe('reversal'); expect(r.reversesId).toBe(j.id);
    expect((await d.reverseJournal(j.id)).id).toBe(r.id);                                  // kedua kali: dokumen yang sama
    expect((await d.getJournal(j.id))!.status).toBe('voided');
    expect((await d.ledger(kas.id, { from: '2026-11-01', to: '2026-11-30' })).closing).toBe(kas0);
    await expect(d.reverseJournal(r.id)).rejects.toThrow(/belum atau tidak lagi|Hanya jurnal manual/);
  });
  it('faktur dan pembayaran pembelian ikut terjurnal; neraca tetap seimbang', async () => {
    const d = mk();
    const items = await d.listPurchaseItems();
    const k = items.find((x) => x.productId === 'ing-kopi')!;
    const kg = k.units.find((u) => !u.isBase)!;
    const id = newId();
    const inv0 = (await d.balanceSheet('2026-11-30')).rows.find((r) => r.name === 'Persediaan')?.amount ?? 0;
    await d.createPurchaseInvoice({ id, supplierId: 'sp-kopi', discount: 0, tax: 0, otherCost: 0, lines: [{ productId: k.productId, unitId: kg.unitId, qty: 2, unitPrice: 320000, receivedQty: 2 }] });
    const ap1 = await d.payablesAging('2026-11-09');
    expect(ap1.reduce((s, r) => s + r.outstanding, 0)).toBe(640000);
    await d.payPurchase({ id: newId(), invoiceId: id, accountId: 'acc-kas', amount: 200000 });
    const bs = await d.balanceSheet('2026-11-30');
    expect(bs.totals.balanced).toBe(true);
    expect(bs.rows.find((r) => r.name === 'Utang Usaha')!.amount).toBe(440000);
    expect(bs.rows.find((r) => r.name === 'Persediaan')!.amount - inv0).toBe(640000);
    const cf = await d.cashFlow({ from: '2026-11-01', to: '2026-11-30' });
    expect(cf.outflow).toBe(200000);
    const tb = await d.trialBalance({ from: '2026-11-01', to: '2026-11-30' });
    expect(tb.reduce((s, r) => s + r.debit, 0)).toBe(tb.reduce((s, r) => s + r.credit, 0));
    expect((await d.listJournal({ from: '2026-11-01', to: '2026-11-30', search: 'pur' })).length).toBeGreaterThan(0);
    expect((await d.payablesAging('2026-11-09'))[0]!.outstanding).toBe(440000);
  });
});
