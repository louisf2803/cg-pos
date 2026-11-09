import { describe, expect, it } from 'vitest';
import { createFakeData, newId } from '../src';

const mk = () => { const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') }); d.reset(); return d; };
const draft = (tableId?: string, id = newId()) => ({ id, type: 'dine_in' as const, tableId, label: 'Pak Budi', guestCount: 3, items: [{ id: newId(), productId: 'p1', name: 'Kopi susu gula aren', qty: 1, unitPrice: 20000 }] });

describe('denah dan meja', () => {
  it('lantai dan meja: tambah, ganti nama, nama ganda ditolak', async () => {
    const d = mk();
    const f = await d.saveFloor({ name: ' Lantai 2 ' });
    expect(f.name).toBe('Lantai 2');
    await expect(d.saveFloor({ name: 'lantai 2' })).rejects.toThrow(/sudah ada/);
    const t = await d.saveTable({ floorId: f.id, name: 'A1' });
    await expect(d.saveTable({ floorId: f.id, name: 'a1' })).rejects.toThrow(/sudah ada/);
    expect((await d.saveTable({ floorId: 'f-1', name: 'A1' })).floorId).toBe('f-1');   // nama sama di lantai lain boleh
    expect((await d.saveTable({ id: t.id, floorId: f.id, name: 'A2' })).name).toBe('A2');
    await expect(d.saveTable({ floorId: f.id, name: '' })).rejects.toThrow(/wajib/);
  });

  it('meja terisi selama pesanan belum lunas, kosong lagi setelah lunas atau dibatalkan', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const o = await d.saveOrder(draft('t-T1'), 'e-sari');
    expect(o.tableId).toBe('t-T1'); expect(o.label).toBe('Pak Budi'); expect(o.guestCount).toBe(3);
    let st = await d.listTableStatus();
    expect(st.find((t) => t.id === 't-T1')!.order).toMatchObject({ number: o.number, label: 'Pak Budi', guestCount: 3 });
    expect(st.find((t) => t.id === 't-T2')!.order).toBeUndefined();
    // meja yang sama dipakai pesanan lain: ditolak; pesanan yang sama diperbarui: boleh
    await expect(d.saveOrder(draft('t-T1'), 'e-sari')).rejects.toThrow(/sedang dipakai/);
    await d.saveOrder({ ...draft('t-T1', o.id) }, 'e-sari');
    // tidak bisa menghapus meja yang terpakai
    await expect(d.deleteTable('t-T1')).rejects.toThrow(/sedang dipakai/);
    await expect(d.deleteFloor('f-1')).rejects.toThrow(/sedang dipakai/);
    // lunas -> kosong
    await d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: o.total });
    st = await d.listTableStatus();
    expect(st.find((t) => t.id === 't-T1')!.order).toBeUndefined();
    // dibatalkan -> kosong
    const o2 = await d.saveOrder(draft('t-T2'), 'e-sari');
    await d.voidUnpaidOrder(o2.id, 'salah meja', 'e-budi');
    expect((await d.listTableStatus()).find((t) => t.id === 't-T2')!.order).toBeUndefined();
  });

  it('hapus lantai ikut menghapus mejanya; meja tak dikenal ditolak', async () => {
    const d = mk();
    await d.deleteFloor('f-teras');
    expect((await d.listTables()).some((t) => t.floorId === 'f-teras')).toBe(false);
    expect((await d.listFloors()).map((f) => f.id)).toEqual(['f-1']);
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    await expect(d.saveOrder(draft('nope'), 'e-sari')).rejects.toThrow(/tidak ditemukan/);
  });
});
