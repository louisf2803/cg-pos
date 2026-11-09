import { describe, expect, it } from 'vitest';
import { DataError, createFakeData, createOfflineData, memoryKV, newId, type DataLayer } from '../src';

/** DataLayer palsu yang bisa "putus": semua pemanggilan melempar galat jaringan selama online=false. */
function flaky() {
  const base = createFakeData({ now: () => new Date('2026-11-10T03:00:00Z') }); base.reset();
  const state = { online: true, rejectPay: false };
  const wrapped = new Proxy(base, {
    get(t, k: string) {
      const v = (t as unknown as Record<string, unknown>)[k];
      if (typeof v !== 'function' || k === 'reset') return v;
      return (...a: unknown[]) => {
        if (!state.online) return Promise.reject(new DataError('network', 'Tidak ada koneksi ke server'));
        if (k === 'addPayment' && state.rejectPay) return Promise.reject(new DataError('bad_amount', 'Jumlah melebihi sisa tagihan'));
        return (v as (...x: unknown[]) => unknown).apply(t, a);
      };
    },
  }) as DataLayer;
  return { base, wrapped, state };
}
const draft = (id = newId()) => ({ id, type: 'takeaway' as const, items: [{ id: newId(), productId: 'p1', name: 'Kopi susu gula aren', qty: 2, unitPrice: 20000 }] });

describe('mode offline', () => {
  it('bacaan disimpan lalu dipakai saat jaringan putus', async () => {
    const { wrapped, state } = flaky();
    const d = createOfflineData(wrapped, { storage: memoryKV(), isOnline: () => state.online });
    const online = await d.listProducts();
    state.online = false;
    expect(await d.listProducts()).toEqual(online);
    await expect(d.listBundles()).rejects.toThrow(/koneksi/);          // yang tidak disimpan tetap gagal jelas
  });

  it('pesanan dan pembayaran offline masuk antrean dan terkirim saat online, tanpa dobel', async () => {
    const { base, wrapped, state } = flaky();
    const d = createOfflineData(wrapped, { storage: memoryKV(), isOnline: () => state.online });
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    await d.getContext(); await d.listPaymentMethods();               // cache terisi saat online
    state.online = false;
    const o = await d.saveOrder(draft(), 'e-sari');
    expect(o.number).toMatch(/OFF-001/);
    const paid = await d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: o.total, tendered: o.total });
    expect(paid.status).toBe('paid');
    expect(d.pending.list().map((e) => e.kind)).toEqual(['order', 'payment']);
    expect((await d.listOrders({ status: 'paid' })).some((x) => x.id === o.id)).toBe(true);   // terlihat di daftar lokal
    await expect(d.closeShift({ shiftId: 'x', counted: 0, closedBy: 'e-sari' })).rejects.toThrow(/tertunda/);

    state.online = true;
    await d.pending.flush();
    expect(d.pending.list()).toEqual([]);
    const server = await base.getOrder(o.id);
    expect(server!.status).toBe('paid'); expect(server!.number).not.toMatch(/OFF/);
    await d.pending.flush();                                           // kirim ulang tidak menggandakan
    expect((await base.listOrders({ status: 'paid' })).filter((x) => x.id === o.id)).toHaveLength(1);
  });

  it('ubah pesanan offline mengganti entrinya; sudah dibayar tidak bisa diubah', async () => {
    const { wrapped, state } = flaky();
    const d = createOfflineData(wrapped, { storage: memoryKV(), isOnline: () => state.online });
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 }); await d.getContext(); await d.listPaymentMethods();
    state.online = false;
    const dr = draft();
    await d.saveOrder(dr, 'e-sari');
    const again = await d.saveOrder({ ...dr, items: [{ ...dr.items[0]!, qty: 3 }] }, 'e-sari');
    expect(d.pending.list()).toHaveLength(1);
    expect(again.items[0]!.qty).toBe(3);
    await d.addPayment(dr.id, { id: newId(), methodId: 'm-cash', amount: again.total, tendered: again.total });
    await expect(d.saveOrder(dr, 'e-sari')).rejects.toThrow(/pembayaran/);
  });

  it('ditolak server: tampil gagal dengan alasan, bisa dicoba lagi atau dibuang', async () => {
    const { base, wrapped, state } = flaky();
    const d = createOfflineData(wrapped, { storage: memoryKV(), isOnline: () => state.online });
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 }); await d.getContext(); await d.listPaymentMethods();
    state.online = false;
    const o = await d.saveOrder(draft(), 'e-sari');
    await d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: o.total, tendered: o.total });
    state.online = true; state.rejectPay = true;
    await d.pending.flush();
    const left = d.pending.list();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ kind: 'payment', status: 'failed', error: 'Jumlah melebihi sisa tagihan' });
    expect((await base.getOrder(o.id))!.status).toBe('open');          // pesanan sudah terkirim, pembayaran belum
    state.rejectPay = false;
    await d.pending.retry(left[0]!.id);
    expect(d.pending.list()).toEqual([]);
    expect((await base.getOrder(o.id))!.status).toBe('paid');
  });

  it('buang pesanan ikut membuang pembayarannya; antrean bertahan setelah muat ulang', async () => {
    const { wrapped, state } = flaky();
    const storage = memoryKV();
    let d = createOfflineData(wrapped, { storage, isOnline: () => state.online });
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 }); await d.getContext(); await d.listPaymentMethods();
    state.online = false;
    const o = await d.saveOrder(draft(), 'e-sari');
    await d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: o.total, tendered: o.total });
    d = createOfflineData(wrapped, { storage, isOnline: () => state.online });          // "muat ulang"
    expect(d.pending.list()).toHaveLength(2);
    expect((await d.getOrder(o.id))!.status).toBe('paid');
    d.pending.discard(d.pending.list()[0]!.id);
    expect(d.pending.list()).toEqual([]);
    expect(await d.getOrder(o.id).catch(() => 'tak ada')).not.toMatchObject({ status: 'paid' });
  });
});
