import { describe, expect, it } from 'vitest';
import type { Order, Product } from '@cgpos/shared';
import { lineOrderName, reduce, type CartState } from './cart';

const air: Product = {
  id: 'p-air', name: 'Air mineral', categoryId: null, price: 5000, kind: 'goods', trackStock: true, isActive: true, isFavorite: false,
  baseUnitName: 'pcs', sellUnits: [{ id: 'pu-dus', name: 'dus', conversion: 24, price: 110000 }],
};
const empty: CartState = { type: 'takeaway', lines: [], discounts: [] };

describe('satuan ganda di keranjang', () => {
  it('baris baru memakai satuan dasar dan membawa pilihan satuan', () => {
    const s = reduce(empty, { t: 'add', product: air });
    expect(s.lines[0]).toMatchObject({ unitPrice: 5000, listPrice: 5000, baseUnitName: 'pcs' });
    expect(s.lines[0]!.unitId).toBeUndefined();
    expect(s.lines[0]!.sellUnits).toHaveLength(1);
  });

  it('ganti ke dus: harga jadi harga dus, nama pesanan memuat satuan, kuantitas tidak mengubah harga', () => {
    let s = reduce(empty, { t: 'add', product: air });
    const id = s.lines[0]!.id;
    s = reduce(s, { t: 'unit', lineId: id, unitId: 'pu-dus' });
    expect(s.lines[0]).toMatchObject({ unitId: 'pu-dus', unitPrice: 110000, basePrice: 110000 });
    expect(lineOrderName(s.lines[0]!)).toBe('Air mineral (dus)');
    s = reduce(s, { t: 'qty', lineId: id, qty: 3 });
    expect(s.lines[0]!.unitPrice).toBe(110000);
  });

  it('kembali ke satuan dasar memulihkan harga dan melepas satuan', () => {
    let s = reduce(empty, { t: 'add', product: air });
    const id = s.lines[0]!.id;
    s = reduce(s, { t: 'unit', lineId: id, unitId: 'pu-dus' });
    s = reduce(s, { t: 'unit', lineId: id });
    expect(s.lines[0]).toMatchObject({ unitPrice: 5000, basePrice: 5000 });
    expect(s.lines[0]!.unitId).toBeUndefined();
    expect(lineOrderName(s.lines[0]!)).toBe('Air mineral');
  });

  it('menambah produk yang sama tidak menggabung ke baris satuan lain', () => {
    let s = reduce(empty, { t: 'add', product: air });
    s = reduce(s, { t: 'unit', lineId: s.lines[0]!.id, unitId: 'pu-dus' });
    s = reduce(s, { t: 'add', product: air });
    expect(s.lines).toHaveLength(2);
    expect(s.lines[1]!.unitId).toBeUndefined();
  });

  it('muat ulang pesanan: satuan lain dikenali dan akhiran nama dibuang agar tidak ganda', () => {
    const order = {
      id: 'o1', number: 'X/1', type: 'takeaway', status: 'open', subtotal: 110000, discountTotal: 0, serviceCharge: 0, taxTotal: 0, rounding: 0, total: 110000, paidTotal: 0,
      items: [{ id: 'i1', productId: 'p-air', unitId: 'pu-dus', name: 'Air mineral (dus)', qty: 1, unitPrice: 110000, lineTotal: 110000 }], payments: [], openedAt: '2026-11-14T00:00:00Z', version: 1,
    } as unknown as Order;
    const s = reduce(empty, { t: 'load', order, products: [air] });
    expect(s.lines[0]).toMatchObject({ name: 'Air mineral', unitId: 'pu-dus', unitName: 'dus', unitPrice: 110000 });
    expect(lineOrderName(s.lines[0]!)).toBe('Air mineral (dus)');
  });
  it('Detail Produk: jumlah, satuan, dan catatan masuk sekaligus saat ditambahkan', () => {
    const s = reduce(empty, { t: 'add', product: air, qty: 3, unitId: 'pu-dus', note: '  tanpa es  ' });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]).toMatchObject({ qty: 3, unitId: 'pu-dus', unitPrice: 110000, note: 'tanpa es' });
  });

  it('Detail Produk: jumlah tanpa catatan digabung ke baris yang sama, dengan catatan jadi baris baru', () => {
    let s = reduce(empty, { t: 'add', product: air, qty: 2 });
    s = reduce(s, { t: 'add', product: air, qty: 3 });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]!.qty).toBe(5);
    s = reduce(s, { t: 'add', product: air, qty: 1, note: 'dingin' });
    expect(s.lines).toHaveLength(2);
  });

  it('jumlah kurang dari 1 dibulatkan jadi 1; catatan dipotong 100 karakter', () => {
    const s = reduce(empty, { t: 'add', product: air, qty: 0, note: 'x'.repeat(150) });
    expect(s.lines[0]!.qty).toBe(1);
    expect(s.lines[0]!.note).toHaveLength(100);
  });
});
