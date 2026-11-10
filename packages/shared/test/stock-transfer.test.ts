import { describe, expect, it } from 'vitest';
import { createFakeData, transferProblem } from '../src';

describe('transfer stok: pemeriksaan isian', () => {
  const ok = { fromId: 'a', toId: 'b', lines: [{ productId: 'x', qty: 2 }] };
  it('menolak isian salah', () => {
    expect(transferProblem({ ...ok, fromId: '' })).toMatch(/lokasi/i);
    expect(transferProblem({ ...ok, toId: 'a' })).toMatch(/tidak boleh sama/);
    expect(transferProblem({ ...ok, lines: [] })).toMatch(/minimal satu/);
    expect(transferProblem({ ...ok, lines: [{ productId: 'x', qty: 0 }] })).toMatch(/lebih dari 0/);
    expect(transferProblem({ ...ok, lines: [{ productId: 'x', qty: 1.00001 }] })).toMatch(/4 angka/);
    expect(transferProblem({ ...ok, lines: [{ productId: 'x', qty: 1 }, { productId: 'x', qty: 2 }] })).toMatch(/dua kali/);
    expect(transferProblem(ok)).toBeNull();
  });
});

describe('transfer stok: data tiruan', () => {
  it('kirim mengurangi stok asal, terima menambah tujuan, batal mengembalikan', async () => {
    const d = createFakeData();
    const [a, b] = await d.listStockLocations();
    const item = (await d.listStock()).find((i) => i.productId === 'ing-kopi')!;
    const qty0 = item.qty;
    const r = await d.createStockTransfer({ id: 't1', fromId: a!.id, toId: b!.id, lines: [{ productId: 'ing-kopi', qty: 100 }] });
    expect(r.number).toMatch(/^TRF-/);
    expect((await d.listStock()).find((i) => i.productId === 'ing-kopi')!.qty).toBe(qty0 - 100);
    expect((await d.createStockTransfer({ id: 't1', fromId: a!.id, toId: b!.id, lines: [{ productId: 'ing-kopi', qty: 100 }] })).number).toBe(r.number);
    expect((await d.listStock()).find((i) => i.productId === 'ing-kopi')!.qty).toBe(qty0 - 100);
    expect((await d.listStockTransfers())[0]).toMatchObject({ status: 'in_transit', fromName: a!.name, toName: b!.name });
    await d.receiveStockTransfer('t1');
    expect((await d.listStockTransfers())[0]!.status).toBe('received');
    await expect(d.receiveStockTransfer('t1')).rejects.toMatchObject({ code: 'invalid' });
    await expect(d.cancelStockTransfer('t1')).rejects.toMatchObject({ code: 'invalid' });
    await d.createStockTransfer({ id: 't2', fromId: a!.id, toId: b!.id, lines: [{ productId: 'ing-kopi', qty: 50 }] });
    await d.cancelStockTransfer('t2');
    expect((await d.listStock()).find((i) => i.productId === 'ing-kopi')!.qty).toBe(qty0 - 100);
    // balik dari gudang ke outlet
    await d.createStockTransfer({ id: 't3', fromId: b!.id, toId: a!.id, lines: [{ productId: 'ing-kopi', qty: 30 }] });
    await d.receiveStockTransfer('t3');
    expect((await d.listStock()).find((i) => i.productId === 'ing-kopi')!.qty).toBe(qty0 - 70);
    await expect(d.createStockTransfer({ id: 't4', fromId: a!.id, toId: a!.id, lines: [{ productId: 'ing-kopi', qty: 1 }] })).rejects.toMatchObject({ code: 'invalid' });
    await expect(d.createStockTransfer({ id: 't5', fromId: a!.id, toId: b!.id, lines: [{ productId: 'tidak-ada', qty: 1 }] })).rejects.toMatchObject({ code: 'invalid' });
  });
});
