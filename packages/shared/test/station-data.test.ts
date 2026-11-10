import { describe, expect, it } from 'vitest';
import { createFakeData, newId } from '../src';

async function setup() {
  const d = createFakeData({ now: () => new Date('2026-11-10T03:00:00Z') }); d.reset();
  const emp = (await d.listEmployees())[0]!;
  await d.openShift({ id: newId(), cashierId: emp.id, openingCash: 0 });
  return { d, emp };
}

describe('stasiun cetak: data bohongan', () => {
  it('bawaan demo: Dapur dan Bar, produk terpetakan per kategori', async () => {
    const { d } = await setup();
    const st = await d.listPrintStations();
    expect(st.map((s) => s.name)).toEqual(['Dapur', 'Bar']);
    const prods = await d.listProducts();
    expect(prods.filter((p) => p.categoryId === 'c-kopi').every((p) => p.printStationId === 'st-bar')).toBe(true);
    expect(prods.filter((p) => p.categoryId === 'c-makan').every((p) => p.printStationId === 'st-dapur')).toBe(true);
  });

  it('kirim hanya baris bersasis stasiun dan mengembalikan baris baru per stasiun', async () => {
    const { d, emp } = await setup();
    const prods = await d.listProducts();
    const kopi = prods.find((p) => p.categoryId === 'c-kopi')!;
    const makan = prods.find((p) => p.categoryId === 'c-makan')!;
    const id = newId();
    await d.saveOrder({ id, type: 'takeaway', items: [
      { id: newId(), productId: kopi.id, name: kopi.name, qty: 2, unitPrice: kopi.price, note: 'kurang manis' },
      { id: newId(), productId: makan.id, name: makan.name, qty: 1, unitPrice: makan.price },
      { id: newId(), productId: 'custom-item-fake', name: 'Item bebas', qty: 1, unitPrice: 5000 },
    ] }, emp.id);
    const r = await d.kitchenSend(id);
    expect(r.sent).toBe(2);                                                   // item bebas tanpa stasiun tidak ikut
    expect(r.lines.map((l) => l.stationId).sort()).toEqual(['st-bar', 'st-dapur']);
    expect(r.lines.find((l) => l.stationId === 'st-bar')!.note).toBe('kurang manis');
    const again = await d.kitchenSend(id);
    expect(again.sent).toBe(0);
    expect(again.lines).toEqual([]);
    const board = await d.kitchenBoard();
    expect(board[0]!.items.map((i) => i.stationId).sort()).toEqual(['st-bar', 'st-dapur']);
  });

  it('stasiun nonaktif tidak meneruskan; diaktifkan lagi lalu kirim berikutnya meneruskan', async () => {
    const { d, emp } = await setup();
    const kopi = (await d.listProducts()).find((p) => p.categoryId === 'c-kopi')!;
    await d.savePrintStation({ id: 'st-bar', name: 'Bar', isActive: false });
    const id = newId();
    await d.saveOrder({ id, type: 'takeaway', items: [{ id: newId(), productId: kopi.id, name: kopi.name, qty: 1, unitPrice: kopi.price }] }, emp.id);
    expect((await d.kitchenSend(id)).sent).toBe(0);
    await d.savePrintStation({ id: 'st-bar', name: 'Bar', isActive: true });
    expect((await d.kitchenSend(id)).sent).toBe(1);
  });

  it('simpan stasiun: tambah, ubah template, nama unik, validasi, hapus melepas produk', async () => {
    const { d } = await setup();
    const label = await d.savePrintStation({ name: 'Label Minuman', kind: 'label', printMode: 'auto', copies: 2, paper: '80', template: { title: 'Es Kopi', showCashier: true } });
    expect(label.kind).toBe('label');
    expect(label.template.title).toBe('Es Kopi');
    expect(label.template.showCashier).toBe(true);
    expect(label.template.showGuests).toBe(false);                            // bawaan stiker
    const upd = await d.savePrintStation({ id: label.id, name: 'Label Minuman', template: { footer: 'Terima kasih' } });
    expect(upd.template.footer).toBe('Terima kasih');
    expect(upd.template.title).toBe('Es Kopi');                               // yang tak disentuh bertahan
    await expect(d.savePrintStation({ name: 'label minuman' })).rejects.toThrow(/sudah ada/);
    await expect(d.savePrintStation({ name: '  ' })).rejects.toThrow(/wajib/);
    await expect(d.savePrintStation({ name: 'X', copies: 9 })).rejects.toThrow(/1 sampai 5/);
    await expect(d.savePrintStation({ id: 'tidak-ada', name: 'Y' })).rejects.toThrow(/tidak ditemukan/);
    await d.removePrintStation('st-bar');
    expect((await d.listProducts()).some((p) => p.printStationId === 'st-bar')).toBe(false);
    await expect(d.removePrintStation('st-bar')).rejects.toThrow(/tidak ditemukan/);
  });

  it('petakan produk: per daftar dan per kategori, lepas dengan null, tolak stasiun asing', async () => {
    const { d } = await setup();
    const prods = await d.listProducts();
    const teh = prods.find((p) => p.categoryId === 'c-non')!;
    expect((await d.assignProductsToStation({ stationId: 'st-dapur', productIds: [teh.id] })).changed).toBe(1);
    expect((await d.getProduct(teh.id))!.printStationId).toBe('st-dapur');
    expect((await d.assignProductsToStation({ stationId: 'st-dapur', productIds: [teh.id] })).changed).toBe(0);   // sudah sama
    const nKopi = prods.filter((p) => p.categoryId === 'c-kopi').length;
    expect((await d.assignProductsToStation({ stationId: null, categoryId: 'c-kopi' })).changed).toBe(nKopi);
    expect((await d.listProducts()).filter((p) => p.categoryId === 'c-kopi').every((p) => !p.printStationId)).toBe(true);
    await expect(d.assignProductsToStation({ stationId: 'asing', productIds: [teh.id] })).rejects.toThrow(/tidak ditemukan/);
  });
});
