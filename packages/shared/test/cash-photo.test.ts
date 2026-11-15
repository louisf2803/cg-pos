import { describe, expect, it } from 'vitest';
import { createFakeData } from '../src';

const jpeg = { data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), contentType: 'image/jpeg' as const };

async function openShift() {
  const d = createFakeData();
  const emp = (await d.listEmployees())[0]!;
  const shift = await d.openShift({ id: 'sh-1', cashierId: emp.id, openingCash: 0 });
  return { d, shift, emp };
}

describe('foto bukti kas (mode demo)', () => {
  it('tanpa aturan wajib, foto boleh kosong dan bila ada tersimpan', async () => {
    const { d, shift } = await openShift();
    const a = await d.addCashMovement({ id: 'c1', shiftId: shift.id, kind: 'out', amount: 5000, reason: 'Beli es batu' });
    expect(a.hasPhoto).toBeUndefined();
    const b = await d.addCashMovement({ id: 'c2', shiftId: shift.id, kind: 'out', amount: 7000, reason: 'Beli gula', photo: jpeg });
    expect(b.hasPhoto).toBe(true);
    expect(b.photoUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect((await d.listCashMovements(shift.id)).filter((m) => m.hasPhoto)).toHaveLength(1);
  });

  it('bila outlet mewajibkan foto, kas tanpa foto ditolak dan dengan foto diterima', async () => {
    const { d, shift } = await openShift();
    const { options } = await d.getOutletSettings();
    await d.saveOutletOptions({ ...options, requireCashPhoto: true });
    expect((await d.getOutletSettings()).options.requireCashPhoto).toBe(true);
    await expect(d.addCashMovement({ id: 'c3', shiftId: shift.id, kind: 'in', amount: 10000, reason: 'Tambah kembalian' })).rejects.toThrow(/foto bukti kas/i);
    const ok = await d.addCashMovement({ id: 'c3', shiftId: shift.id, kind: 'in', amount: 10000, reason: 'Tambah kembalian', photo: jpeg });
    expect(ok.hasPhoto).toBe(true);
  });

  it('foto yang bukan gambar atau kosong ditolak', async () => {
    const { d, shift } = await openShift();
    await expect(d.addCashMovement({ id: 'c4', shiftId: shift.id, kind: 'out', amount: 1000, reason: 'Uji foto', photo: { data: new Uint8Array(), contentType: 'image/jpeg' } })).rejects.toThrow(/kosong/i);
  });
});
