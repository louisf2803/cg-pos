import { describe, expect, it } from 'vitest';
import { splitByItem } from '../src';

const lines = [
  { id: 'a', qty: 2, name: 'Kopi', unitPrice: 20000 },
  { id: 'b', qty: 1, name: 'Roti', unitPrice: 15000 },
  { id: 'c', qty: 3, name: 'Teh', unitPrice: 8000 },
];
let n = 0; const mk = () => `new-${++n}`;

describe('splitByItem', () => {
  it('memisahkan sebagian jumlah; sisa tetap dengan id lama, bagian dibayar mendapat id baru', () => {
    n = 0;
    const r = splitByItem(lines, { a: 1, c: 3 }, mk);
    expect(r.problem).toBeNull();
    expect(r.paid.map((l) => [l.id, l.name, l.qty])).toEqual([['new-1', 'Kopi', 1], ['new-2', 'Teh', 3]]);
    expect(r.remain.map((l) => [l.id, l.name, l.qty])).toEqual([['a', 'Kopi', 1], ['b', 'Roti', 1]]);
  });
  it('jumlah total terjaga: dibayar + sisa = semula untuk tiap produk', () => {
    const r = splitByItem(lines, { a: 2, b: 0, c: 1 }, () => crypto.randomUUID());
    const tot = (xs: typeof lines, name: string) => xs.filter((l) => l.name === name).reduce((s, l) => s + l.qty, 0);
    for (const name of ['Kopi', 'Roti', 'Teh']) expect(tot(r.paid, name) + tot(r.remain, name)).toBe(tot(lines, name));
  });
  it('menolak: tidak memilih apa pun, memilih semua, melebihi jumlah, negatif, id asing', () => {
    expect(splitByItem(lines, {}, mk).problem).toMatch(/minimal satu/);
    expect(splitByItem(lines, { a: 2, b: 1, c: 3 }, mk).problem).toMatch(/Semua item/);
    expect(splitByItem(lines, { a: 3 }, mk).problem).toMatch(/melebihi/);
    expect(splitByItem(lines, { a: -1 }, mk).problem).toMatch(/tidak sah/);
    expect(splitByItem(lines, { zzz: 1 }, mk).problem).toMatch(/tidak ada/);
  });
  it('jumlah desimal tidak meninggalkan sisa pecahan palsu', () => {
    const r = splitByItem([{ id: 'x', qty: 1.5 }, { id: 'y', qty: 1 }], { x: 0.5 }, mk);
    expect(r.remain.find((l) => l.id === 'x')!.qty).toBe(1);
    expect(r.paid[0]!.qty).toBe(0.5);
  });
  it('baris tak berubah (tidak dipilih) tetap utuh dan input tidak dimutasi', () => {
    const copy = JSON.parse(JSON.stringify(lines));
    splitByItem(lines, { a: 1 }, mk);
    expect(lines).toEqual(copy);
  });
});
