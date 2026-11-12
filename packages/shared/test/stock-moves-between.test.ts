import { describe, expect, it } from 'vitest';
import { createFakeData, newId } from '../src';

describe('listStockMovesBetween di data demo', () => {
  async function setup() {
    let t = new Date('2026-11-12T01:00:00.000Z').getTime();
    const d = createFakeData({ now: () => new Date(t) });
    const items = (await d.listStock({ kind: 'ingredient' })).slice(0, 2);
    return { d, items, advance: (min: number) => { t += min * 60000; } };
  }

  it('mengembalikan mutasi lintas produk dengan nama dan satuan, terbaru dulu, dan menyaring jenis', async () => {
    const { d, items, advance } = await setup();
    const [a, b] = items;
    await d.postStock({ id: newId(), productId: a!.productId, kind: 'adjust_in', qty: 100, unitCost: 10 });
    advance(10);
    await d.postStock({ id: newId(), productId: a!.productId, kind: 'waste', qty: 5, reason: 'tumpah' });
    advance(10);
    await d.postStock({ id: newId(), productId: b!.productId, kind: 'adjust_in', qty: 50, unitCost: 10 });
    advance(10);
    await d.postStock({ id: newId(), productId: b!.productId, kind: 'waste', qty: 2, reason: 'kedaluwarsa' });
    const range = { from: '2026-11-12T00:00:00.000Z', to: '2026-11-13T00:00:00.000Z' };

    const waste = await d.listStockMovesBetween(range, ['waste']);
    expect(waste.map((m) => m.productName)).toEqual([b!.name, a!.name]);
    expect(waste.map((m) => m.reason)).toEqual(['kedaluwarsa', 'tumpah']);
    expect(waste.map((m) => m.qtyDelta)).toEqual([-2, -5]);
    expect(waste[0]).toMatchObject({ kind: 'waste', unit: b!.unit, productId: b!.productId });
    expect(waste[0]!.occurredAt > waste[1]!.occurredAt).toBe(true);

    const all = await d.listStockMovesBetween(range);
    expect(all.length).toBeGreaterThanOrEqual(4);
    const kinds = new Set(all.map((m) => m.kind));
    expect(kinds.has('adjust_in') && kinds.has('waste')).toBe(true);
    const two = await d.listStockMovesBetween(range, ['adjust_in', 'waste']);
    expect(two.every((m) => m.kind === 'adjust_in' || m.kind === 'waste')).toBe(true);
    expect(two.length).toBe(all.filter((m) => m.kind === 'adjust_in' || m.kind === 'waste').length);
    expect(await d.listStockMovesBetween(range, ['sale'])).toEqual([]);
  });
  it('rentang: awal ikut, akhir tidak ikut, dan di luar rentang kosong', async () => {
    const { d, items, advance } = await setup();
    await d.postStock({ id: newId(), productId: items[0]!.productId, kind: 'waste', qty: 1 });
    const at = '2026-11-12T01:00:00.000Z';
    expect(await d.listStockMovesBetween({ from: at, to: '2026-11-12T02:00:00.000Z' }, ['waste'])).toHaveLength(1);
    expect(await d.listStockMovesBetween({ from: '2026-11-12T00:00:00.000Z', to: at }, ['waste'])).toHaveLength(0);
    advance(24 * 60);
    expect(await d.listStockMovesBetween({ from: '2026-11-13T00:00:00.000Z', to: '2026-11-14T00:00:00.000Z' }, ['waste'])).toEqual([]);
  });
});
