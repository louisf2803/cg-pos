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

  it('pindah meja: ke meja kosong berhasil, ke meja terisi atau meja sama ditolak, nomor dan item tetap', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const a = await d.saveOrder(draft('t-T1'), 'e-sari');
    const b = await d.saveOrder(draft('t-T2'), 'e-sari');
    await expect(d.moveOrderTable(a.id, 't-T2')).rejects.toThrow(/sedang dipakai/);
    await expect(d.moveOrderTable(a.id, 't-T1')).rejects.toThrow(/sudah ada di meja ini/);
    await expect(d.moveOrderTable(a.id, 'nope')).rejects.toThrow(/tidak ditemukan/);
    const moved = await d.moveOrderTable(a.id, 't-T5');
    expect(moved).toMatchObject({ id: a.id, number: a.number, tableId: 't-T5', label: 'Pak Budi', guestCount: 3, total: a.total });
    const st = await d.listTableStatus();
    expect(st.find((t) => t.id === 't-T1')!.order).toBeUndefined();
    expect(st.find((t) => t.id === 't-T5')!.order?.number).toBe(a.number);
    // pesanan yang sudah dibayar sebagian, lunas, atau bukan meja tidak bisa dipindah
    await d.addPayment(b.id, { id: newId(), methodId: 'm-cash', amount: 5000 });
    await expect(d.moveOrderTable(b.id, 't-T3')).rejects.toThrow(/sudah ada pembayaran/);
    const take = await d.saveOrder({ ...draft(undefined), type: 'takeaway' as const }, 'e-sari');
    await expect(d.moveOrderTable(take.id, 't-T3')).rejects.toThrow(/bukan pesanan meja/);
  });

  it('gabung meja: item dan tamu disatukan, pesanan sumber dibatalkan dan mejanya kosong', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const a = await d.saveOrder(draft('t-T1'), 'e-sari');
    const b = await d.saveOrder({ ...draft('t-T2'), label: 'Bu Ani', guestCount: 2, items: [
      { id: newId(), productId: 'p1', name: 'Kopi susu gula aren', qty: 2, unitPrice: 20000, note: 'less ice' },
    ] }, 'e-sari');
    await expect(d.mergeOrders({ intoId: a.id, fromId: a.id, authorizedBy: 'e-budi' })).rejects.toThrow(/berbeda/);
    const merged = await d.mergeOrders({ intoId: a.id, fromId: b.id, authorizedBy: 'e-budi' });
    expect(merged).toMatchObject({ id: a.id, number: a.number, tableId: 't-T1', label: 'Pak Budi', guestCount: 5 });
    expect(merged.items.map((i) => [i.qty, i.note])).toEqual([[1, undefined], [2, 'less ice']]);
    expect(new Set(merged.items.map((i) => i.id)).size).toBe(2);
    expect(merged.total).toBe(a.total + b.total);
    const src = (await d.getOrder(b.id))!;
    expect(src.status).toBe('void');
    const st = await d.listTableStatus();
    expect(st.find((t) => t.id === 't-T2')!.order).toBeUndefined();
    expect(st.find((t) => t.id === 't-T1')!.order?.total).toBe(merged.total);
  });

  it('gabung meja ditolak bila salah satu sudah dibayar sebagian; tidak ada yang berubah', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const a = await d.saveOrder(draft('t-T1'), 'e-sari');
    const b = await d.saveOrder(draft('t-T2'), 'e-sari');
    await d.addPayment(b.id, { id: newId(), methodId: 'm-cash', amount: 5000 });
    await expect(d.mergeOrders({ intoId: a.id, fromId: b.id, authorizedBy: 'e-budi' })).rejects.toThrow(/sudah ada pembayaran/);
    await expect(d.mergeOrders({ intoId: b.id, fromId: a.id, authorizedBy: 'e-budi' })).rejects.toThrow(/sudah ada pembayaran/);
    expect((await d.getOrder(a.id))!.items).toHaveLength(1);
    expect((await d.getOrder(a.id))!.status).toBe('open');
  });
});
