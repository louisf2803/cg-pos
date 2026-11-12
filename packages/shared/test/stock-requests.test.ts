import { describe, expect, it } from 'vitest';
import { createFakeData, DataError, stockRequestActions, stockRequestProblem } from '../src';

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof DataError ? e.code : 'galat'));

describe('validasi permintaan barang', () => {
  const ok = { requesterId: 'a', sourceId: 'b', lines: [{ productId: 'p1', qty: 5 }] };
  it('menerima isian benar dan menolak yang salah', () => {
    expect(stockRequestProblem(ok)).toBeNull();
    expect(stockRequestProblem({ ...ok, requesterId: '' })).toMatch(/Pilih lokasi/);
    expect(stockRequestProblem({ ...ok, sourceId: 'a' })).toMatch(/tidak boleh sama/);
    expect(stockRequestProblem({ ...ok, lines: [] })).toMatch(/minimal satu/);
    expect(stockRequestProblem({ ...ok, lines: [{ productId: 'p1', qty: 1 }, { productId: 'p1', qty: 2 }] })).toMatch(/dua kali/);
    expect(stockRequestProblem({ ...ok, lines: [{ productId: 'p1', qty: 0 }] })).toMatch(/lebih dari 0/);
    expect(stockRequestProblem({ ...ok, lines: [{ productId: 'p1', qty: 1.00001 }] })).toMatch(/4 angka/);
    expect(stockRequestProblem({ ...ok, note: 'x'.repeat(301) })).toMatch(/300/);
  });
  it('tindakan yang mungkin per status', () => {
    expect(stockRequestActions('requested')).toEqual({ decide: true, fulfill: false, cancel: true });
    expect(stockRequestActions('approved')).toEqual({ decide: false, fulfill: true, cancel: true });
    expect(stockRequestActions('fulfilled')).toEqual({ decide: false, fulfill: false, cancel: false });
    expect(stockRequestActions('rejected')).toEqual({ decide: false, fulfill: false, cancel: false });
  });
});

describe('permintaan barang di data demo', () => {
  it('diminta, disetujui, dipenuhi (stok sumber berkurang, transfer terbuat), final, batal, tolak', async () => {
    const d = createFakeData();
    const [a, b] = await d.listStockLocations();
    const req = await d.createStockRequest({ requesterId: a!.id, sourceId: b!.id, note: 'stok bar menipis', lines: [{ productId: 'ing-kopi', qty: 100 }] });
    expect(req).toMatchObject({ status: 'requested', note: 'stok bar menipis' });
    expect(req.number).toMatch(/^REQ-/);
    expect((await d.createStockRequest({ id: req.id, requesterId: a!.id, sourceId: b!.id, lines: [{ productId: 'ing-kopi', qty: 1 }] })).lines[0]!.qty).toBe(100);
    expect(await code(d.createStockRequest({ requesterId: a!.id, sourceId: a!.id, lines: [{ productId: 'ing-kopi', qty: 1 }] }))).toBe('invalid');
    expect(await code(d.createStockRequest({ requesterId: a!.id, sourceId: 'lokasi-x', lines: [{ productId: 'ing-kopi', qty: 1 }] }))).toBe('not_found');
    expect(await code(d.fulfillStockRequest(req.id))).toBe('invalid');
    expect((await d.decideStockRequest(req.id, true, 'oke')).status).toBe('approved');
    expect(await code(d.decideStockRequest(req.id, false))).toBe('invalid');
    const before = (await d.listStockTransfers()).length;
    const done = await d.fulfillStockRequest(req.id);
    expect(done.status).toBe('fulfilled');
    expect(done.transferId).toBeTruthy();
    const transfers = await d.listStockTransfers();
    expect(transfers).toHaveLength(before + 1);
    expect(transfers[0]).toMatchObject({ fromId: b!.id, toId: a!.id, status: 'in_transit' });
    expect(await code(d.cancelStockRequest(req.id))).toBe('invalid');
    const r2 = await d.createStockRequest({ requesterId: a!.id, sourceId: b!.id, lines: [{ productId: 'ing-kopi', qty: 5 }] });
    expect((await d.decideStockRequest(r2.id, false, 'habis')).status).toBe('rejected');
    const r3 = await d.createStockRequest({ requesterId: a!.id, sourceId: b!.id, lines: [{ productId: 'ing-kopi', qty: 5 }] });
    expect((await d.cancelStockRequest(r3.id)).status).toBe('cancelled');
    expect((await d.listStockRequests({ status: 'rejected' })).map((x) => x.id)).toEqual([r2.id]);
    expect(await code(d.decideStockRequest('tidak-ada', true))).toBe('not_found');
  });
});
