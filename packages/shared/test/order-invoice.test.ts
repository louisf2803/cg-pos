import { describe, expect, it } from 'vitest';
import type { Order } from '../src/types';
import { salesInvoiceProblem, salesInvoiceTotals } from '../src/sales-invoice';
import { orderInvoiceProblem, orderToInvoiceInput } from '../src/order-invoice';

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1', number: 'OUT/A/261113/001', type: 'dine_in', customerId: 'c1', customerName: 'PT Pelanggan', cashierId: 'e1', status: 'open',
  items: [
    { id: 'i1', productId: 'p1', name: 'Kopi', qty: 2, unitPrice: 20000, lineTotal: 40000 },
    { id: 'i2', productId: 'p2', name: 'Roti', qty: 1, unitPrice: 15000, extras: [{ id: 'x', name: 'Keju', price: 3000, qty: 1 }], lineTotal: 18000 },
  ] as Order['items'],
  subtotal: 58000, discountTotal: 0, serviceCharge: 0, taxTotal: 6380, rounding: 0, total: 64380, paidTotal: 0, payments: [], openedAt: '2026-11-13T00:00:00Z', ...over,
});

describe('syarat pesanan menjadi invoice', () => {
  it('pesanan terbuka, belum dibayar, ada pelanggan', () => expect(orderInvoiceProblem(order())).toBeNull());
  it('menolak yang sudah dibayar sebagian, tanpa pelanggan, kosong, atau bukan terbuka', () => {
    expect(orderInvoiceProblem(order({ paidTotal: 100 }))).toMatch(/pembayaran sebagian/);
    expect(orderInvoiceProblem(order({ customerId: undefined }))).toMatch(/pelanggan/);
    expect(orderInvoiceProblem(order({ items: [] }))).toMatch(/kosong/);
    expect(orderInvoiceProblem(order({ status: 'paid' }))).toMatch(/belum dibayar/);
  });
});

describe('menyusun faktur dari pesanan', () => {
  it('baris dari item (termasuk ekstra), pajak sama, total faktur = total pesanan', () => {
    const inv = orderToInvoiceInput(order(), { id: 'f1', termDays: 14 });
    expect(inv.lines.map((l) => [l.name, l.qty, l.unitPrice])).toEqual([['Kopi', 2, 20000], ['Roti + Keju', 1, 18000]]);
    expect(inv).toMatchObject({ customerId: 'c1', termDays: 14, taxAmount: 6380, discount: 0, downPayment: 0 });
    expect(salesInvoiceTotals(inv.lines, inv.discount, inv.taxAmount).total).toBe(64380);
    expect(salesInvoiceProblem(inv)).toBeNull();
    expect(inv.note).toContain('OUT/A/261113/001');
  });
  it('potongan order masuk sebagai diskon agar total tetap sama', () => {
    const o = order({ discountTotal: 5000, total: 59380 });
    const inv = orderToInvoiceInput(o, { id: 'f1', termDays: 7 });
    expect(inv.discount).toBe(5000);
    expect(salesInvoiceTotals(inv.lines, inv.discount, inv.taxAmount).total).toBe(59380);
  });
  it('pembulatan naik menjadi baris Pembulatan; biaya layanan menjadi baris', () => {
    const o = order({ serviceCharge: 2900, taxTotal: 6670, total: 67600, rounding: 30 });
    const inv = orderToInvoiceInput(o, { id: 'f1', termDays: 0 });
    expect(inv.lines.map((l) => l.name)).toEqual(['Kopi', 'Roti + Keju', 'Biaya layanan', 'Pembulatan']);
    expect(salesInvoiceTotals(inv.lines, inv.discount, inv.taxAmount).total).toBe(67600);
  });
  it('catatan kasir ikut', () => expect(orderToInvoiceInput(order(), { id: 'f', termDays: 1, note: ' kirim sore ' }).note).toBe('Dari pesanan OUT/A/261113/001 · kirim sore'));
});
