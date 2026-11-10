import { describe, expect, it } from 'vitest';
import { createFakeData, DataError, newId } from '../src';

describe('kas masuk dan keluar selama shift', () => {
  it('tercatat, mengubah kas yang seharusnya, idempoten, dan menolak masukan buruk', async () => {
    const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') });
    d.reset();
    const sh = await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 100000 });
    const a = newId();
    await d.addCashMovement({ id: a, shiftId: sh.id, kind: 'out', amount: 15000, reason: ' Beli es batu ' });
    await d.addCashMovement({ id: a, shiftId: sh.id, kind: 'out', amount: 15000, reason: 'Beli es batu' }); // kirim ulang = tidak dobel
    await d.addCashMovement({ id: newId(), shiftId: sh.id, kind: 'in', amount: 50000, reason: 'Tambah uang kembalian' });
    const list = await d.listCashMovements(sh.id);
    expect(list).toHaveLength(2);
    expect(list[0]!.reason).toBe('Beli es batu');
    const r = await d.shiftSummary(sh.id);
    expect(r.cashOut).toBe(15000);
    expect(r.cashIn).toBe(50000);
    expect(r.expectedCash).toBe(100000 + 50000 - 15000);
    await expect(d.addCashMovement({ id: newId(), shiftId: sh.id, kind: 'out', amount: 0, reason: 'Nol' })).rejects.toBeInstanceOf(DataError);
    await expect(d.addCashMovement({ id: newId(), shiftId: sh.id, kind: 'out', amount: 100, reason: 'a' })).rejects.toBeInstanceOf(DataError);
    await expect(d.addCashMovement({ id: newId(), shiftId: 'tidak-ada', kind: 'in', amount: 100, reason: 'Uji' })).rejects.toBeInstanceOf(DataError);
    await d.closeShift({ shiftId: sh.id, counted: 135000, closedBy: 'e-sari' });
    await expect(d.addCashMovement({ id: newId(), shiftId: sh.id, kind: 'in', amount: 100, reason: 'Setelah tutup' })).rejects.toBeInstanceOf(DataError);
  });
});

describe('batas kas keluar harian (S122)', () => {
  it('menolak kas keluar yang melewati batas, kas masuk dan nilai tepat batas tetap boleh', async () => {
    const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') });
    d.reset();
    const o = (await d.getOutletSettings()).options;
    await d.saveOutletOptions({ ...o, cashOutDailyLimit: 20000 });
    const sh = await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 100000 });
    await d.addCashMovement({ id: newId(), shiftId: sh.id, kind: 'out', amount: 12000, reason: 'Beli es batu' });
    await expect(d.addCashMovement({ id: newId(), shiftId: sh.id, kind: 'out', amount: 9000, reason: 'Beli plastik' })).rejects.toMatchObject({ message: /Batas kas keluar harian/ });
    await d.addCashMovement({ id: newId(), shiftId: sh.id, kind: 'out', amount: 8000, reason: 'Beli sedotan' }); // total tepat 20.000
    await d.addCashMovement({ id: newId(), shiftId: sh.id, kind: 'in', amount: 90000, reason: 'Tambah kembalian' });
  });
  it('tanpa batas (null) tidak membatasi, dan modal awal bawaan terbaca di konteks', async () => {
    const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') });
    d.reset();
    const o = (await d.getOutletSettings()).options;
    await d.saveOutletOptions({ ...o, cashOutDailyLimit: null, defaultOpeningCash: 150000 });
    expect((await d.getContext()).settings.defaultOpeningCash).toBe(150000);
    const sh = await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 150000 });
    await d.addCashMovement({ id: newId(), shiftId: sh.id, kind: 'out', amount: 140000, reason: 'Bayar pemasok' });
  });
});
