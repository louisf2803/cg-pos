import { describe, expect, it } from 'vitest';
import { createFakeData, filterRowsByStation, groupTickets, kitchenAlert, newId, thresholdsProblem, ticketLane, waitMinutes, type KitchenRow } from '../src';

const row = (p: Partial<KitchenRow>): KitchenRow => ({ itemId: newId(), orderId: 'o1', orderNumber: 'A-1', orderType: 'dine_in', name: 'Kopi', qty: 1, extras: [], status: 'new', sentAt: '2026-11-10T03:00:00.000Z', statusAt: '2026-11-10T03:00:00.000Z', ...p });

describe('dapur: aturan', () => {
  it('tiket berada di tahap paling awal yang belum selesai', () => {
    expect(ticketLane([{ status: 'ready' }, { status: 'new' }])).toBe('new');
    expect(ticketLane([{ status: 'ready' }, { status: 'preparing' }])).toBe('preparing');
    expect(ticketLane([{ status: 'ready' }, { status: 'served' }])).toBe('ready');
    expect(ticketLane([{ status: 'served' }])).toBe('served');
  });
  it('baris dikelompokkan per pesanan, tiket tertua di depan', () => {
    const t = groupTickets([
      row({ orderId: 'b', orderNumber: 'B', sentAt: '2026-11-10T03:05:00.000Z', name: 'Teh' }),
      row({ orderId: 'a', orderNumber: 'A', sentAt: '2026-11-10T03:00:00.000Z', name: 'Kopi' }),
      row({ orderId: 'a', orderNumber: 'A', sentAt: '2026-11-10T03:02:00.000Z', name: 'Air', status: 'ready' }),
    ]);
    expect(t.map((x) => x.orderNumber)).toEqual(['A', 'B']);
    expect(t[0]!.items.map((i) => i.name)).toEqual(['Kopi', 'Air']);
    expect(t[0]!.sentAt).toBe('2026-11-10T03:00:00.000Z');
    expect(t[0]!.lane).toBe('new');
  });
  it('penanda lama menunggu dan batas waktu', () => {
    const now = new Date('2026-11-10T03:15:30.000Z');
    expect(waitMinutes('2026-11-10T03:00:00.000Z', now)).toBe(15);
    expect(waitMinutes('2026-11-10T04:00:00.000Z', now)).toBe(0);
    expect([5, 10, 19, 20, 45].map((m) => kitchenAlert(m))).toEqual(['ok', 'warn', 'warn', 'late', 'late']);
    expect(thresholdsProblem({ warnMin: 10, lateMin: 20 })).toBeNull();
    expect(thresholdsProblem({ warnMin: 20, lateMin: 20 })).toMatch(/lebih kecil/);
    expect(thresholdsProblem({ warnMin: 0, lateMin: 20 })).toMatch(/antara 1/);
    expect(thresholdsProblem({ warnMin: 1.5, lateMin: 20 })).toMatch(/bulat/);
  });
  it('filterRowsByStation menyaring baris berdasarkan stasiun dan mengabaikan saat all/null', () => {
    const r1 = row({ name: 'Kopi', stationId: 'st-bar' });
    const r2 = row({ name: 'Nasi', stationId: 'st-dapur' });
    const r3 = row({ name: 'Air' }); // tanpa stationId

    // null, undefined, 'all' -> semua baris
    expect(filterRowsByStation([r1, r2, r3])).toEqual([r1, r2, r3]);
    expect(filterRowsByStation([r1, r2, r3], 'all')).toEqual([r1, r2, r3]);
    expect(filterRowsByStation([r1, r2, r3], null)).toEqual([r1, r2, r3]);

    // filter per stasiun spesifik
    expect(filterRowsByStation([r1, r2, r3], 'st-bar')).toEqual([r1]);
    expect(filterRowsByStation([r1, r2, r3], 'st-dapur')).toEqual([r2]);
    expect(filterRowsByStation([r1, r2, r3], 'st-lain')).toEqual([]);

    // array kosong
    expect(filterRowsByStation([], 'st-bar')).toEqual([]);

    // integrasi dengan groupTickets: tiket tanpa baris tersisa disembunyikan
    const rows = [
      row({ orderId: 'o1', orderNumber: 'A-1', name: 'Kopi', stationId: 'st-bar', status: 'new' }),
      row({ orderId: 'o1', orderNumber: 'A-1', name: 'Nasi', stationId: 'st-dapur', status: 'ready' }),
      row({ orderId: 'o2', orderNumber: 'A-2', name: 'Teh', stationId: 'st-bar', status: 'preparing' }),
    ];

    const barTickets = groupTickets(filterRowsByStation(rows, 'st-bar'));
    expect(barTickets).toHaveLength(2);
    expect(barTickets[0]!.orderNumber).toBe('A-1');
    expect(barTickets[0]!.items).toHaveLength(1);
    expect(barTickets[0]!.items[0]!.name).toBe('Kopi');
    expect(barTickets[0]!.lane).toBe('new');

    const dapurTickets = groupTickets(filterRowsByStation(rows, 'st-dapur'));
    expect(dapurTickets).toHaveLength(1);
    expect(dapurTickets[0]!.orderNumber).toBe('A-1');
    expect(dapurTickets[0]!.items).toHaveLength(1);
    expect(dapurTickets[0]!.items[0]!.name).toBe('Nasi');
    expect(dapurTickets[0]!.lane).toBe('ready'); // Nasi sudah ready, jadi lane untuk Dapur adalah ready
  });
});

describe('dapur: data bohongan', () => {
  it('kirim, ubah status, sajikan, dan batal', async () => {
    const d = createFakeData({ now: () => new Date('2026-11-10T03:00:00Z') }); d.reset();
    const ctx = await d.getContext(); void ctx;
    const prods = await d.listProducts();
    const [a, b] = [prods[0]!, prods[1]!];
    const emp = (await d.listEmployees())[0]!;
    await d.openShift({ id: newId(), cashierId: emp.id, openingCash: 0 });
    const id = newId();
    const o = await d.saveOrder({ id, type: 'takeaway', items: [{ id: newId(), productId: a.id, name: a.name, qty: 2, unitPrice: 10000, note: 'tanpa gula' }, { id: newId(), productId: b.id, name: b.name, qty: 1, unitPrice: 12000 }] }, emp.id);
    expect(await d.kitchenBoard()).toHaveLength(0);
    expect((await d.kitchenSend(id)).sent).toBe(2);
    expect((await d.kitchenSend(id)).sent).toBe(0);                                  // idempoten
    let board = await d.kitchenBoard();
    expect(board).toHaveLength(1); expect(board[0]!.items).toHaveLength(2);
    expect(board[0]!.items.find((i) => i.name === a.name)!.note).toBe('tanpa gula');
    const ids = board[0]!.items.map((i) => i.itemId);
    await d.kitchenSetStatus([ids[0]!], 'preparing');
    expect((await d.kitchenBoard())[0]!.lane).toBe('new');                            // satu baris masih Baru
    await d.kitchenSetStatus(ids, 'ready');
    expect((await d.kitchenBoard())[0]!.lane).toBe('ready');
    await d.kitchenSetStatus(ids, 'served');
    expect(await d.kitchenBoard()).toHaveLength(0);                                   // disajikan hilang dari papan
    expect(await d.kitchenBoard(60)).toHaveLength(1);                                 // riwayat 60 menit
    await d.kitchenSetStatus(ids, 'new');
    expect(await d.kitchenBoard()).toHaveLength(1);                                   // boleh mundur
    await expect(d.kitchenSetStatus([], 'ready')).rejects.toThrow(/Pilih baris/);
    await expect(d.kitchenSend('tidak-ada')).rejects.toThrow(/belum tersimpan/);
    expect(o.items).toHaveLength(2);
  });
});
