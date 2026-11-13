import { describe, expect, it } from 'vitest';
import type { OutletContext, Order } from '../src/types';
import { paperCols, receiptPieces } from '../src/escpos';
import { DEFAULT_RECEIPT_TEMPLATE, receiptTemplateProblem, resolveReceiptTemplate, sanitizeReceiptTemplate } from '../src/receipt-template';

const order: Order = {
  id: 'o1', number: 'OUT/A/261113/001', type: 'dine_in', cashierId: 'e1', status: 'paid', label: 'Meja 4',
  items: [{ id: 'i1', productId: 'p1', name: 'Kopi', qty: 2, unitPrice: 20000, lineTotal: 40000 }] as Order['items'],
  subtotal: 40000, discountTotal: 0, serviceCharge: 2000, taxTotal: 4620, rounding: -20, total: 46600, paidTotal: 50000,
  payments: [{ id: 'pay1', methodId: 'm1', methodName: 'Tunai', kind: 'cash', amount: 50000, tendered: 50000, change: 3400 }] as Order['payments'], openedAt: '2026-11-13T03:00:00Z',
};
const ctx = (tpl: object = {}): OutletContext => ({ outletName: 'Kedai Uji', timezone: 'Asia/Jakarta', receiptTemplate: tpl } as unknown as OutletContext);
const text = (tpl: object = {}) => receiptPieces({ order, ctx: ctx(tpl), cashierName: 'Sari', kind: 'receipt', cols: 32 }).map((p) => p.text).join('\n');

describe('kendali baris struk (A150)', () => {
  it('bawaan: semua baris tampil', () => {
    const t = text();
    for (const w of ['Biaya layanan', 'Pajak', 'Pembulatan', 'Tunai', 'Kembalian']) expect(t).toContain(w);
  });
  it('tiap baris bisa disembunyikan sendiri-sendiri', () => {
    expect(text({ showServiceCharge: false })).not.toContain('Biaya layanan');
    expect(text({ showTax: false })).not.toContain('Pajak');
    expect(text({ showRounding: false })).not.toContain('Pembulatan');
    expect(text({ showPaymentMethod: false })).not.toMatch(/Tunai/);
    expect(text({ showChange: false })).not.toContain('Kembalian');
    expect(text({ showChange: false })).toContain('Tunai');
  });
  it('subtotal dan TOTAL selalu tercetak', () => {
    const t = text({ showServiceCharge: false, showTax: false, showRounding: false, showPaymentMethod: false, showChange: false });
    expect(t).toContain('Subtotal');
    expect(t).toContain('TOTAL');
  });
});

describe('templat dan kertas', () => {
  it('kunci baru lolos penyaringan dan bawaan lengkap', () => {
    expect(sanitizeReceiptTemplate({ showTax: false, showChange: false, hack: true })).toEqual({ showTax: false, showChange: false });
    expect(resolveReceiptTemplate(ctx({ showRounding: false }))).toMatchObject({ showRounding: false, showTax: true, showChange: true });
    expect(DEFAULT_RECEIPT_TEMPLATE).toMatchObject({ showServiceCharge: true, showPaymentMethod: true });
  });
  it('kertas 76 mm = 40 kolom dan diterima sebagai kertas bawaan', () => {
    expect(paperCols('58')).toBe(32);
    expect(paperCols('76')).toBe(40);
    expect(paperCols('80')).toBe(48);
    expect(sanitizeReceiptTemplate({ defaultPaperWidth: '76' })).toEqual({ defaultPaperWidth: '76' });
    expect(receiptTemplateProblem({ defaultPaperWidth: '76' })).toBeNull();
    expect(receiptTemplateProblem({ defaultPaperWidth: '99' as never })).toMatch(/58, 76, atau 80/);
    expect(receiptTemplateProblem({ showTax: 'ya' as never })).toMatch(/tidak sah/);
  });
});
