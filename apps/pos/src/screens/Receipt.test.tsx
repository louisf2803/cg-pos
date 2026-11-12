import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Order, OutletContext } from '@cgpos/shared';
import { ReceiptBody } from './Receipt';

const ctx = { outletName: 'Coffee Ground', address: 'Jl. Raya Darmo 1', phone: '031-123', timezone: 'Asia/Jakarta', receiptFooter: 'Terima kasih' } as unknown as OutletContext;
const order = {
  id: 'o1', number: 'OUT1/A/261110/101', type: 'dine_in', label: 'Meja 3', guestCount: 2, customerName: 'Ani', status: 'paid', openedAt: '2026-11-10T03:00:00.000Z', closedAt: '2026-11-10T03:10:00.000Z',
  items: [{ id: 'i1', productId: 'p', name: 'Kopi Susu', qty: 2, unitPrice: 20000, lineTotal: 40000, note: 'kurang manis', extras: [{ optionId: 'x', name: 'Extra shot', price: 5000 }] }],
  subtotal: 50000, discountTotal: 0, serviceCharge: 0, taxTotal: 0, rounding: 0, total: 50000, paidTotal: 50000,
  payments: [{ id: 'pay', methodId: 'm', methodName: 'Tunai', kind: 'cash', amount: 50000, tendered: 50000, change: 0 }],
} as unknown as Order;
const html = (c: OutletContext, paper: '58' | '80' = '80') => renderToStaticMarkup(<ReceiptBody order={order} ctx={c} cashierName="Budi" kind="receipt" paper={paper} />);

describe('ReceiptBody mengikuti templat', () => {
  it('tanpa templat: semua tampil seperti sebelumnya', () => {
    const h = html(ctx);
    for (const s of ['Coffee Ground', 'Jl. Raya Darmo 1', '031-123', 'OUT1/A/261110/101', 'Pelanggan: Ani', 'Meja 3', '2 tamu', 'Kasir: Budi', 'kurang manis', 'Extra shot', 'Terima kasih']) expect(h).toContain(s);
    expect(h).toContain('receipt--normal'); expect(h).not.toContain('dicetak');
  });
  it('menyembunyikan bagian sesuai templat dan memakai kelas tema', () => {
    const h = html({ ...ctx, receiptTemplate: { theme: 'large', showOutletName: false, showAddress: false, showPhone: false, showOrderNo: false, showGuests: false, showTable: false, showTime: false, showCashier: false, showCustomer: false, showNotes: false, showExtras: false, showUnitPrice: false, showPrintTime: true } } as OutletContext);
    for (const s of ['Coffee Ground', 'Jl. Raya', '031-123', 'OUT1/A', 'Ani', 'Meja 3', 'tamu', 'Kasir:', 'kurang manis', 'Extra shot']) expect(h).not.toContain(s);
    expect(h).toContain('receipt--large'); expect(h).toContain('dicetak'); expect(h).toContain('TOTAL'); expect(h).toContain('Tunai');
  });
  it('pilihan lama kasir (0027) tetap dihormati', () => {
    expect(html({ ...ctx, receiptShowCashier: false } as OutletContext)).not.toContain('Kasir:');
  });
  it('menampilkan nomor referensi diskon/kupon di struk bila ada', () => {
    const withDiscountRef = {
      ...order,
      discountTotal: 5000,
      total: 45000,
      paidTotal: 45000,
      discounts: [{ id: 'd1', source: 'coupon', label: 'Potongan 5 ribu', amount: 5000, reference: 'CPN-001' }],
    } as unknown as Order;
    const h = renderToStaticMarkup(<ReceiptBody order={withDiscountRef} ctx={ctx} cashierName="Budi" kind="receipt" paper="80" />);
    expect(h).toContain('Potongan 5 ribu · Ref: CPN-001');
  });
});
