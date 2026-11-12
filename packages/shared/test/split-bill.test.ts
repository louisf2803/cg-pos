import { describe, expect, it } from 'vitest';
import {
  buildCombinedReceiptSummary,
  splitByItem,
  type Order,
  type TieredPriceRule,
} from '../src';

const lines = [
  { id: 'a', qty: 2, name: 'Kopi', unitPrice: 20000, basePrice: 20000, productId: 'prod-kopi' },
  { id: 'b', qty: 1, name: 'Roti', unitPrice: 15000, basePrice: 15000, productId: 'prod-roti' },
  { id: 'c', qty: 3, name: 'Teh', unitPrice: 8000, basePrice: 8000, productId: 'prod-teh' },
];
let n = 0;
const mk = () => `new-${++n}`;

describe('splitByItem', () => {
  it('memisahkan sebagian jumlah; sisa tetap dengan id lama, bagian dibayar mendapat id baru', () => {
    n = 0;
    const r = splitByItem(lines, { a: 1, c: 3 }, mk);
    expect(r.problem).toBeNull();
    expect(r.paid.map((l) => [l.id, l.name, l.qty])).toEqual([
      ['new-1', 'Kopi', 1],
      ['new-2', 'Teh', 3],
    ]);
    expect(r.remain.map((l) => [l.id, l.name, l.qty])).toEqual([
      ['a', 'Kopi', 1],
      ['b', 'Roti', 1],
    ]);
  });

  it('jumlah total terjaga: dibayar + sisa = semula untuk tiap produk', () => {
    const r = splitByItem(lines, { a: 2, b: 0, c: 1 }, () => crypto.randomUUID());
    const tot = (xs: typeof lines, name: string) =>
      xs.filter((l) => l.name === name).reduce((s, l) => s + l.qty, 0);
    for (const name of ['Kopi', 'Roti', 'Teh']) {
      expect(tot(r.paid, name) + tot(r.remain, name)).toBe(tot(lines, name));
    }
  });

  it('menolak: tidak memilih apa pun, memilih semua, melebihi jumlah, negatif, id asing', () => {
    expect(splitByItem(lines, {}, mk).problem).toMatch(/minimal satu/);
    expect(splitByItem(lines, { a: 2, b: 1, c: 3 }, mk).problem).toMatch(/Semua item/);
    expect(splitByItem(lines, { a: 3 }, mk).problem).toMatch(/melebihi/);
    expect(splitByItem(lines, { a: -1 }, mk).problem).toMatch(/tidak sah/);
    expect(splitByItem(lines, { zzz: 1 }, mk).problem).toMatch(/tidak ada/);
  });

  it('memblokir pemisahan bila terdapat diskon di tingkat pesanan', () => {
    const r = splitByItem(lines, { a: 1 }, mk, { hasOrderDiscount: true });
    expect(r.problem).toMatch(/diskon di tingkat pesanan/);
    expect(r.paid).toEqual([]);
    expect(r.remain).toEqual([]);
  });

  it('menghitung ulang harga grosir bertingkat berdasarkan kuantitas baru paid dan remain', () => {
    const kopiRules: TieredPriceRule[] = [
      { tier: 1, minQty: 1, unitPrice: 20000 },
      { tier: 2, minQty: 5, unitPrice: 17000 },
    ];
    // Pesanan awal: 10 kopi dengan harga grosir 17.000
    const bulkLine = [
      {
        id: 'k1',
        productId: 'p-kopi',
        name: 'Kopi Susu',
        qty: 10,
        basePrice: 20000,
        unitPrice: 17000,
      },
    ];

    // Dipisah: 3 dibayar sekarang (tidak memenuhi min 5 -> balik ke 20.000), 7 sisa (tetap >= 5 -> tetap 17.000)
    const r = splitByItem(bulkLine, { k1: 3 }, mk, {
      tieredRules: { 'p-kopi': kopiRules },
    });

    expect(r.problem).toBeNull();
    expect(r.paid[0]!.qty).toBe(3);
    expect(r.paid[0]!.unitPrice).toBe(20000); // tier 1

    expect(r.remain[0]!.qty).toBe(7);
    expect(r.remain[0]!.unitPrice).toBe(17000); // tier 2
  });

  it('jumlah desimal tidak meninggalkan sisa pecahan palsu', () => {
    const r = splitByItem(
      [{ id: 'x', qty: 1.5 }, { id: 'y', qty: 1 }],
      { x: 0.5 },
      mk,
    );
    expect(r.remain.find((l) => l.id === 'x')!.qty).toBe(1);
    expect(r.paid[0]!.qty).toBe(0.5);
  });

  it('baris tak berubah (tidak dipilih) tetap utuh dan input tidak dimutasi', () => {
    const copy = JSON.parse(JSON.stringify(lines));
    splitByItem(lines, { a: 1 }, mk);
    expect(lines).toEqual(copy);
  });

  it('menyusun ringkasan struk gabungan dengan benar', () => {
    const dummyOrders: Order[] = [
      {
        id: 'ord-1',
        number: 'CG/2026/001',
        type: 'dine_in',
        tableId: 't1',
        label: 'Meja 1 (Bagian A)',
        status: 'paid',
        items: [{ id: 'i1', productId: 'p1', name: 'Kopi', qty: 2, unitPrice: 20000 }],
        subtotal: 40000,
        discountTotal: 0,
        serviceCharge: 2000,
        taxTotal: 4200,
        rounding: 0,
        total: 46200,
        paidTotal: 46200,
        payments: [],
        openedAt: '2026-11-13T08:00:00Z',
      },
      {
        id: 'ord-2',
        number: 'CG/2026/002',
        type: 'dine_in',
        tableId: 't1',
        label: 'Meja 1 (Bagian B)',
        status: 'open',
        items: [{ id: 'i2', productId: 'p2', name: 'Roti', qty: 1, unitPrice: 15000 }],
        subtotal: 15000,
        discountTotal: 0,
        serviceCharge: 750,
        taxTotal: 1575,
        rounding: 0,
        total: 17325,
        paidTotal: 0,
        payments: [],
        openedAt: '2026-11-13T08:05:00Z',
      },
    ];

    const summary = buildCombinedReceiptSummary('Meja 1', dummyOrders);
    expect(summary.tableLabel).toBe('Meja 1');
    expect(summary.parts.length).toBe(2);
    expect(summary.parts[0]?.status).toBe('Lunas');
    expect(summary.parts[1]?.status).toBe('Belum Lunas');
    expect(summary.totalSubtotal).toBe(55000);
    expect(summary.totalCombined).toBe(63525);
  });
});
