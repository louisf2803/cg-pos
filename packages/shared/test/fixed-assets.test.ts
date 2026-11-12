import { describe, expect, it } from 'vitest';
import {
  depreciationSchedule, disposalGainLoss, disposalProblem, firstDepreciationPeriod, fixedAssetProblem, monthlyDepreciation, pendingPeriods, summarizeAssets,
  type FixedAsset,
} from '../src';

const base = { name: 'Mesin Espresso', acquiredOn: '2026-08-15', cost: 12_000_000, salvageValue: 1_200_000, usefulLifeMonths: 12 };
const asset = (over: Partial<FixedAsset> = {}): FixedAsset => ({ id: 'a1', ...base, status: 'active', accumulatedDepreciation: 0, bookValue: base.cost, monthsDepreciated: 0, ...over });

describe('validasi aset tetap', () => {
  it('menerima isian yang benar dan menolak yang salah', () => {
    expect(fixedAssetProblem(base)).toBeNull();
    expect(fixedAssetProblem({ ...base, name: '  ' })).toMatch(/Nama/);
    expect(fixedAssetProblem({ ...base, name: 'x'.repeat(121) })).toMatch(/120/);
    expect(fixedAssetProblem({ ...base, acquiredOn: '2026-13-40' })).toMatch(/Tanggal/);
    expect(fixedAssetProblem({ ...base, cost: 0 })).toMatch(/Harga/);
    expect(fixedAssetProblem({ ...base, cost: 1000.5 })).toMatch(/bulat/);
    expect(fixedAssetProblem({ ...base, salvageValue: -1 })).toMatch(/Nilai sisa/);
    expect(fixedAssetProblem({ ...base, salvageValue: base.cost })).toMatch(/lebih kecil/);
    expect(fixedAssetProblem({ ...base, usefulLifeMonths: 0 })).toMatch(/Umur/);
    expect(fixedAssetProblem({ ...base, usefulLifeMonths: 601 })).toMatch(/Umur/);
  });
});

describe('jadwal penyusutan', () => {
  it('mulai bulan setelah perolehan, termasuk pergantian tahun', () => {
    expect(firstDepreciationPeriod('2026-08-15')).toBe('2026-09-01');
    expect(firstDepreciationPeriod('2026-12-31')).toBe('2027-01-01');
  });
  it('12 bulan x 900.000 dan jumlahnya = harga - sisa', () => {
    const s = depreciationSchedule(base);
    expect(s).toHaveLength(12);
    expect(s[0]).toEqual({ period: '2026-09-01', amount: 900000 });
    expect(s[3]!.period).toBe('2026-12-01');
    expect(s[4]!.period).toBe('2027-01-01');
    expect(s.reduce((a, x) => a + x.amount, 0)).toBe(10_800_000);
  });
  it('bulan terakhir menghabiskan sisa pembulatan (sama dengan tes SQL: 1000,01 dalam 2 bulan)', () => {
    expect(monthlyDepreciation(1000.01, 0, 2)).toBe(500.01);
    const s = depreciationSchedule({ acquiredOn: '2026-08-01', cost: 1000.01, salvageValue: 0, usefulLifeMonths: 2 });
    expect(s.map((x) => x.amount)).toEqual([500.01, 500]);
  });
  it('bulan yang jatuh tempo tetapi belum dicatat; aset dilepas tidak punya apa pun', () => {
    expect(pendingPeriods(asset(), ['2026-09-01'], '2026-11-01')).toEqual(['2026-10-01', '2026-11-01']);
    expect(pendingPeriods(asset(), [], '2026-08-01')).toEqual([]);
    expect(pendingPeriods(asset({ status: 'disposed' }), [], '2027-12-01')).toEqual([]);
  });
});

describe('pelepasan aset', () => {
  it('laba/rugi = hasil + akumulasi - harga perolehan', () => {
    const a = asset({ accumulatedDepreciation: 2_700_000 });
    expect(disposalGainLoss(a, 9_000_000)).toBe(-300_000);
    expect(disposalGainLoss(a, 9_300_000)).toBe(0);
    expect(disposalGainLoss(a, 10_000_000)).toBe(700_000);
  });
  it('validasi: sudah dilepas, tanggal, hasil tanpa akun kas, selisih tanpa akun laba/rugi', () => {
    const a = asset({ accumulatedDepreciation: 2_700_000 });
    const ok = { assetId: 'a1', date: '2026-11-12', proceeds: 9_000_000, cashAccountId: 'k', gainLossAccountId: 'g' };
    expect(disposalProblem(a, ok, '2026-11-12')).toBeNull();
    expect(disposalProblem(asset({ status: 'disposed' }), ok, '2026-11-12')).toMatch(/sudah dilepas/);
    expect(disposalProblem(a, { ...ok, date: '2026-01-01' }, '2026-11-12')).toMatch(/sebelum/);
    expect(disposalProblem(a, { ...ok, date: '2026-12-01' }, '2026-11-12')).toMatch(/masa depan/);
    expect(disposalProblem(a, { ...ok, cashAccountId: null }, '2026-11-12')).toMatch(/kas/);
    expect(disposalProblem(a, { ...ok, gainLossAccountId: null }, '2026-11-12')).toMatch(/laba\/rugi/);
    expect(disposalProblem(a, { ...ok, proceeds: 9_300_000, gainLossAccountId: null }, '2026-11-12')).toBeNull();
  });
});

describe('ringkasan', () => {
  it('hanya menghitung aset aktif', () => {
    const r = summarizeAssets([
      asset({ accumulatedDepreciation: 900000, bookValue: 11_100_000 }),
      asset({ id: 'a2', cost: 5_000_000, accumulatedDepreciation: 0, bookValue: 5_000_000 }),
      asset({ id: 'a3', status: 'disposed', accumulatedDepreciation: 1, bookValue: 1 }),
    ]);
    expect(r).toEqual({ count: 3, active: 2, cost: 17_000_000, accumulated: 900000, bookValue: 16_100_000 });
  });
});

describe('aset tetap di data demo', () => {
  it('mencatat, menyusutkan per bulan (aman diulang), dan melepas', async () => {
    const { createFakeData, DataError } = await import('../src');
    const d = createFakeData();
    const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof DataError ? e.code : 'galat'));
    const a = await d.saveFixedAsset({ name: 'Mesin Espresso', acquiredOn: '2020-01-10', cost: 12_000_000, salvageValue: 1_200_000, usefulLifeMonths: 12 });
    expect(a).toMatchObject({ status: 'active', bookValue: 12_000_000, accumulatedDepreciation: 0 });
    expect((await d.saveFixedAsset({ id: a.id, name: 'Lain', acquiredOn: '2020-01-10', cost: 5, salvageValue: 0, usefulLifeMonths: 1 })).name).toBe('Mesin Espresso');
    expect(await code(d.saveFixedAsset({ name: '', acquiredOn: '2020-01-10', cost: 1, salvageValue: 0, usefulLifeMonths: 1 }))).toBe('invalid');
    expect(await d.depreciateFixedAssets('2020-01-20')).toMatchObject({ assets: 0 });
    expect(await d.depreciateFixedAssets('2020-02-05')).toMatchObject({ period: '2020-02-01', assets: 1, total: 900000 });
    expect(await d.depreciateFixedAssets('2020-02-05')).toMatchObject({ assets: 0 });
    await d.depreciateFixedAssets('2020-03-01');
    const after = (await d.listFixedAssets())[0]!;
    expect(after).toMatchObject({ accumulatedDepreciation: 1_800_000, bookValue: 10_200_000, monthsDepreciated: 2 });
    expect(await d.listAssetDepreciations(a.id)).toHaveLength(2);
    expect(await code(d.depreciateFixedAssets('2999-01-01'))).toBe('invalid');
    expect(await code(d.disposeFixedAsset({ assetId: a.id, date: '2020-04-01', proceeds: 9_000_000, cashAccountId: null, gainLossAccountId: 'g' }))).toBe('invalid');
    const disposed = await d.disposeFixedAsset({ assetId: a.id, date: '2020-04-01', proceeds: 9_000_000, cashAccountId: 'k', gainLossAccountId: 'g' });
    expect(disposed.status).toBe('disposed');
    expect(await code(d.disposeFixedAsset({ assetId: a.id, date: '2020-04-01', proceeds: 0 }))).toBe('invalid');
    expect(await code(d.disposeFixedAsset({ assetId: 'tidak-ada', date: '2020-04-01', proceeds: 0 }))).toBe('not_found');
    expect(await d.depreciateFixedAssets('2020-05-01')).toMatchObject({ assets: 0 });
  });
});
