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
