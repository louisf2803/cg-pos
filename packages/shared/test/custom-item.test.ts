import { describe, expect, it } from 'vitest';
import { createFakeData, newId } from '../src';

describe('item bebas (custom amount)', () => {
  it('produk sistem tidak muncul di daftar produk, tapi pesanan dengan nama dan harga ketikan tersimpan dan dihitung', async () => {
    const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') });
    d.reset();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const id = await d.getCustomItemProductId();
    expect(id).toBeTruthy();
    expect((await d.listProducts()).some((p) => p.id === id)).toBe(false);
    const o = await d.saveOrder({
      id: newId(), type: 'takeaway',
      items: [
        { id: newId(), productId: id, name: 'Jasa antar', qty: 1, unitPrice: 15000 },
        { id: newId(), productId: id, name: 'Kemasan khusus', qty: 2, unitPrice: 2500 },
      ],
    }, 'e-sari');
    expect(o.items.map((i) => i.name)).toEqual(['Jasa antar', 'Kemasan khusus']);
    expect(o.items.map((i) => i.lineTotal)).toEqual([15000, 5000]);
  });
});
