import { describe, expect, it } from 'vitest';
import { applyStockMove, createFakeData, makeStockItem, newId, stockFilterMatches, stockPostProblem, stockStatus } from '../src';

const mk = () => { const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') }); d.reset(); return d; };

describe('stok: rumus', () => {
  it('status: minus, habis, menipis, aman', () => {
    expect(stockStatus(-1)).toBe('negative');
    expect(stockStatus(0)).toBe('out');
    expect(stockStatus(5, 5)).toBe('low');
    expect(stockStatus(6, 5)).toBe('ok');
    expect(stockStatus(3)).toBe('ok');           // tanpa batas minimum tidak ada peringatan menipis
    expect(stockStatus(3, 0)).toBe('ok');
  });
  it('nilai persediaan: qty x rata-rata, nol bila minus', () => {
    expect(makeStockItem({ productId: 'x', name: 'X', kind: 'ingredient', unit: 'gram', qty: 10, avgCost: 25.5 }).value).toBe(255);
    expect(makeStockItem({ productId: 'x', name: 'X', kind: 'ingredient', unit: 'gram', qty: -4, avgCost: 25 }).value).toBe(0);
  });
  it('filter perlu perhatian', () => {
    const it1 = makeStockItem({ productId: 'x', name: 'X', kind: 'goods', unit: 'pcs', qty: 0, avgCost: 0 });
    expect(stockFilterMatches(it1, 'alert')).toBe(true);
    expect(stockFilterMatches(it1, 'ok')).toBe(false);
    expect(stockFilterMatches(it1, undefined)).toBe(true);
  });
  it('validasi isian', () => {
    const ok = { id: 'a', productId: 'p', kind: 'adjust_in' as const, qty: 5, unitCost: 100 };
    expect(stockPostProblem(ok)).toBeNull();
    expect(stockPostProblem({ ...ok, qty: 0 })).toMatch(/lebih dari 0/);
    expect(stockPostProblem({ ...ok, qty: 1.00001 })).toMatch(/4 angka/);
    expect(stockPostProblem({ ...ok, unitCost: -1 })).toMatch(/Harga/);
    expect(stockPostProblem({ ...ok, kind: 'waste' })).toMatch(/hanya untuk stok masuk/);
    expect(stockPostProblem({ ...ok, reason: 'x'.repeat(201) })).toMatch(/panjang/);
    expect(stockPostProblem({ ...ok, kind: 'sale' as never })).toMatch(/tidak dikenal/);
  });
  it('rata-rata bergerak sama dengan trigger server', () => {
    let b = { qty: 0, avgCost: 0 };
    let r = applyStockMove(b, 10, 100); expect(r).toMatchObject({ qty: 10, avgCost: 100 }); b = r;
    r = applyStockMove(b, 10, 200); expect(r.avgCost).toBe(150); b = r;               // (10x100 + 10x200) / 20
    r = applyStockMove(b, -5, 0); expect(r).toMatchObject({ qty: 15, avgCost: 150, unitCost: 150, totalCost: -750 }); b = r;
    r = applyStockMove(b, -20, 0); expect(r.qty).toBe(-5); b = r;                    // boleh minus, rata-rata tetap
    expect(b.avgCost).toBe(150);
    r = applyStockMove(b, 10, 90); expect(r).toMatchObject({ qty: 5, avgCost: 90 });  // saldo <= 0: rata-rata mulai ulang dari biaya masuk
    expect(applyStockMove({ qty: 3, avgCost: 10 }, 1, 20).avgCost).toBe(12.5);
  });
});

describe('stok: data palsu', () => {
  it('daftar stok: bahan baku dan barang, urut nama, dengan status', async () => {
    const d = mk();
    const all = await d.listStock();
    expect(all.some((i) => i.kind === 'ingredient' && i.name === 'Biji kopi arabika')).toBe(true);
    expect(all.map((i) => i.name)).toEqual([...all.map((i) => i.name)].sort((a, b) => a.localeCompare(b, 'id')));
    expect((await d.listStock({ kind: 'ingredient' })).every((i) => i.kind === 'ingredient')).toBe(true);
    expect((await d.listStock({ search: 'MINERAL' })).map((i) => i.name)).toEqual(['Air mineral']);
    const alerts = await d.listStock({ status: 'alert' });
    expect(alerts.map((i) => [i.name, i.status])).toEqual(expect.arrayContaining([['Air mineral', 'low'], ['Pisang goreng', 'out'], ['Gelas 16 oz', 'out']]));
    expect(alerts.every((i) => i.status !== 'ok')).toBe(true);
  });

  it('stok masuk, keluar, terbuang: saldo, rata-rata, kartu stok', async () => {
    const d = mk();
    const before = (await d.listStock({ search: 'gelas' }))[0]!;
    expect(before).toMatchObject({ qty: 0, status: 'out' });
    const a = await d.postStock({ id: newId(), productId: before.productId, kind: 'adjust_in', qty: 100, unitCost: 700, reason: 'beli pasar' });
    expect(a).toMatchObject({ qty: 100, avgCost: 700, value: 70000, status: 'ok' });
    const b = await d.postStock({ id: newId(), productId: before.productId, kind: 'adjust_in', qty: 100, unitCost: 900 });
    expect(b).toMatchObject({ qty: 200, avgCost: 800 });
    const c = await d.postStock({ id: newId(), productId: before.productId, kind: 'adjust_out', qty: 30, reason: 'dibawa pulang' });
    expect(c).toMatchObject({ qty: 170, avgCost: 800 });
    const w = await d.postStock({ id: newId(), productId: before.productId, kind: 'waste', qty: 20 });
    expect(w.qty).toBe(150);
    const card = await d.listStockMoves(before.productId);
    expect(card.map((m) => [m.kind, m.qtyDelta, m.qtyAfter])).toEqual([['waste', -20, 150], ['adjust_out', -30, 170], ['adjust_in', 100, 200], ['adjust_in', 100, 100]]);
    expect(card[1]).toMatchObject({ reason: 'dibawa pulang', unitCost: 800, totalCost: -24000, refType: 'manual' });
    expect((await d.listStockMoves(before.productId, { limit: 2 })).length).toBe(2);
  });

  it('kunci sama tidak menggandakan; stok boleh minus; masukan salah ditolak', async () => {
    const d = mk();
    const g = (await d.listStock({ search: 'gelas' }))[0]!;
    const id = newId();
    await d.postStock({ id, productId: g.productId, kind: 'adjust_in', qty: 10, unitCost: 100 });
    const again = await d.postStock({ id, productId: g.productId, kind: 'adjust_in', qty: 10, unitCost: 100 });
    expect(again.qty).toBe(10);
    expect((await d.listStockMoves(g.productId)).length).toBe(1);
    const neg = await d.postStock({ id: newId(), productId: g.productId, kind: 'adjust_out', qty: 25 });
    expect(neg).toMatchObject({ qty: -15, status: 'negative', value: 0 });
    await expect(d.postStock({ id: newId(), productId: g.productId, kind: 'adjust_in', qty: 0 })).rejects.toThrow(/lebih dari 0/);
    await expect(d.postStock({ id: newId(), productId: 'nope', kind: 'adjust_in', qty: 1 })).rejects.toThrow(/tidak ditemukan/);
  });

  it('batas minimum: dipasang, memicu menipis, dihapus', async () => {
    const d = mk();
    const k = (await d.listStock({ search: 'arabika' }))[0]!;
    expect(k.status).toBe('ok');
    await d.setStockMin(k.productId, 5000);
    expect((await d.listStock({ search: 'arabika' }))[0]).toMatchObject({ minQty: 5000, status: 'low' });
    await d.setStockMin(k.productId, null);
    expect((await d.listStock({ search: 'arabika' }))[0]!.status).toBe('ok');
    await expect(d.setStockMin(k.productId, -1)).rejects.toThrow(/negatif/);
  });

  it('penjualan memotong stok barang dan tercatat di kartu stok; refund + restock mengembalikan', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const before = (await d.listStock({ search: 'espresso' }))[0]!;
    const o = await d.saveOrder({ id: newId(), type: 'takeaway', items: [{ id: newId(), productId: 'p4', name: 'Espresso', qty: 2, unitPrice: 15000 }] }, 'e-sari');
    await d.addPayment(o.id, { id: newId(), methodId: 'm-cash', amount: o.total });
    const after = (await d.listStock({ search: 'espresso' }))[0]!;
    expect(after.qty).toBe(before.qty - 2);
    expect((await d.listStockMoves('p4'))[0]).toMatchObject({ kind: 'sale', qtyDelta: -2, qtyAfter: after.qty });
    expect(after.avgCost).toBe(before.avgCost);
  });

  it('saldo selalu sama dengan jumlah gerakan', async () => {
    const d = mk();
    const g = (await d.listStock({ search: 'susu' }))[0]!;
    await d.postStock({ id: newId(), productId: g.productId, kind: 'adjust_in', qty: 7.5, unitCost: 20 });
    await d.postStock({ id: newId(), productId: g.productId, kind: 'waste', qty: 2.25 });
    const sum = (await d.listStockMoves(g.productId, { limit: 999 })).reduce((n, m) => n + m.qtyDelta, 0);
    expect((await d.listStock({ search: 'susu' }))[0]!.qty).toBeCloseTo(sum, 4);
  });
});

describe('stok opname: data palsu', () => {
  const find = async (d: ReturnType<typeof mk>, q: string) => (await d.listStock({ search: q }))[0]!;

  it('draf: jumlah sistem dicatat, simpan ulang mempertahankannya, item yang dibuang hilang', async () => {
    const d = mk();
    const kopi = await find(d, 'arabika'); const susu = await find(d, 'susu');
    const id = newId();
    const a = await d.saveOpname({ id, note: 'akhir bulan', lines: [{ productId: kopi.productId, countedQty: 4800 }, { productId: susu.productId, countedQty: 12000 }] });
    expect(a).toMatchObject({ number: 'OPN-000001', status: 'draft', note: 'akhir bulan' });
    expect(a.lines.find((l) => l.productId === kopi.productId)).toMatchObject({ systemQty: 5000, countedQty: 4800, difference: -200, value: -200 * kopi.avgCost });
    // penjualan/koreksi setelah dihitung tidak mengubah jumlah sistem yang tercatat
    await d.postStock({ id: newId(), productId: kopi.productId, kind: 'adjust_out', qty: 100 });
    const b = await d.saveOpname({ id, lines: [{ productId: kopi.productId, countedQty: 4700 }] });
    expect(b.lines).toHaveLength(1);
    expect(b.lines[0]).toMatchObject({ systemQty: 5000, countedQty: 4700, difference: -300 });
    expect((await d.listOpnames())[0]).toMatchObject({ id, status: 'draft', lineCount: 1, diffCount: 1 });
  });

  it('selesai: stok disesuaikan sebesar selisih, kartu stok mencatat, final terkunci', async () => {
    const d = mk();
    const kopi = await find(d, 'arabika'); const gula = await find(d, 'gula');
    const id = newId();
    await d.saveOpname({ id, lines: [{ productId: kopi.productId, countedQty: 4700 }, { productId: gula.productId, countedQty: gula.qty }] });
    await d.postStock({ id: newId(), productId: kopi.productId, kind: 'adjust_out', qty: 100 });        // 5000 -> 4900 setelah dihitung
    const fin = await d.finalizeOpname(id);
    expect(fin.status).toBe('final');
    expect(fin.finalizedAt).toBeTruthy();
    expect((await find(d, 'arabika')).qty).toBe(4600);                 // 4900 + (4700 - 5000)
    expect((await find(d, 'gula')).qty).toBe(gula.qty);                 // selisih nol: tanpa gerakan
    const card = await d.listStockMoves(kopi.productId);
    expect(card[0]).toMatchObject({ kind: 'opname_adjust', qtyDelta: -300, refType: 'opname', reason: 'Opname OPN-000001' });
    expect((await d.listStockMoves(gula.productId)).every((m) => m.kind !== 'opname_adjust')).toBe(true);
    expect(fin.lines.find((l) => l.productId === kopi.productId)!.value).toBe(-300 * kopi.avgCost);
    await expect(d.finalizeOpname(id)).rejects.toThrow(/sudah diselesaikan/);
    await expect(d.saveOpname({ id, lines: [] })).rejects.toThrow(/tidak bisa diubah/);
    await expect(d.deleteOpname(id)).rejects.toThrow(/tidak bisa dihapus/);
  });

  it('masukan salah, draf kosong, hapus draf, nomor berurutan', async () => {
    const d = mk();
    const kopi = await find(d, 'arabika');
    await expect(d.saveOpname({ id: newId(), lines: [{ productId: kopi.productId, countedQty: -1 }] })).rejects.toThrow(/negatif/);
    await expect(d.saveOpname({ id: newId(), lines: [{ productId: kopi.productId, countedQty: 1 }, { productId: kopi.productId, countedQty: 2 }] })).rejects.toThrow(/dua kali/);
    await expect(d.saveOpname({ id: newId(), lines: [{ productId: 'nope', countedQty: 1 }] })).rejects.toThrow(/tidak ditemukan/);
    expect(await d.listOpnames()).toHaveLength(0);
    const a = newId(); const b = newId();
    await d.saveOpname({ id: a, lines: [] });
    await d.saveOpname({ id: b, lines: [{ productId: kopi.productId, countedQty: 1 }] });
    expect((await d.listOpnames()).map((o) => o.number)).toEqual(['OPN-000002', 'OPN-000001']);
    await expect(d.finalizeOpname(a)).rejects.toThrow(/minimal satu item/);
    await d.deleteOpname(a);
    expect((await d.listOpnames()).map((o) => o.id)).toEqual([b]);
    expect(await d.getOpname(a)).toBeNull();
    await expect(d.deleteOpname(a)).rejects.toThrow(/tidak ditemukan/);
  });
});
