import { describe, expect, it } from 'vitest';
import { createFakeData, localDateString, localMonthStart } from '../src';

describe('tanggal lokal', () => {
  it('00.00-07.00 WIB masih tanggal kemarin di UTC, tetapi tanggal lokal sudah hari ini', () => {
    const d = new Date('2026-11-12T20:00:00Z'); // 03.00 WIB 13 Nov
    expect(d.toISOString().slice(0, 10)).toBe('2026-11-12');
    expect(localDateString(d)).toBe('2026-11-13');
    expect(localMonthStart(d)).toBe('2026-11-01');
    expect(localDateString(new Date('2026-11-30T18:00:00Z'))).toBe('2026-12-01');
    expect(localMonthStart(new Date('2026-11-30T18:00:00Z'))).toBe('2026-12-01');
    expect(localDateString(new Date('2026-11-13T05:00:00Z'), 'UTC')).toBe('2026-11-13');
  });
});

describe('tanggal hari ini diterima di data demo pada pukul 03.00 WIB', () => {
  it('melepas aset dan membayar tagihan bertanggal hari ini lokal', async () => {
    const clock = new Date('2026-11-12T20:00:00Z');
    const d = createFakeData({ now: () => clock });
    const today = localDateString(clock);
    const a = await d.saveFixedAsset({ name: 'Mesin', acquiredOn: '2026-01-10', cost: 1_000_000, salvageValue: 0, usefulLifeMonths: 10 });
    const out = await d.disposeFixedAsset({ assetId: a.id, date: today, proceeds: 0, gainLossAccountId: 'rugi' });
    expect(out.status).toBe('disposed');
    const bill = await d.saveRecurringBill({ name: 'Sewa', amount: 5_000_000, frequency: 'monthly', nextDue: '2026-11-01', expenseAccountId: 'beban' });
    expect((await d.payRecurringBill(bill.id, 'kas', today)).nextDue).toBe('2026-12-01');
    await expect(d.payRecurringBill(bill.id, 'kas', '2026-11-14')).rejects.toThrow();
  });
});
