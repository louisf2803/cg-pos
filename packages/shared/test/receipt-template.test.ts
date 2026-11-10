import { describe, expect, it } from 'vitest';
import { canPrintAgain, DEFAULT_RECEIPT_TEMPLATE, receiptBytes, receiptPieces, receiptTemplateProblem, resolveReceiptTemplate, sanitizeReceiptTemplate, themeCols } from '../src';
import type { Order, OutletContext } from '../src';

const base = { outletName: 'Coffee Ground', address: 'Jl. Raya Darmo 1', phone: '031-123', timezone: 'Asia/Jakarta', receiptFooter: 'Terima kasih' } as unknown as OutletContext;
const order = {
  id: 'o1', number: 'OUT1/A/261110/101', type: 'dine_in', label: 'Meja 3', guestCount: 2, customerName: 'Ani', status: 'paid', openedAt: '2026-11-10T03:00:00.000Z', closedAt: '2026-11-10T03:10:00.000Z',
  items: [{ id: 'i1', productId: 'p', name: 'Kopi Susu', qty: 2, unitPrice: 20000, lineTotal: 40000, note: 'kurang manis', extras: [{ optionId: 'x', name: 'Extra shot', price: 5000 }] }],
  subtotal: 50000, discountTotal: 0, serviceCharge: 0, taxTotal: 0, rounding: 0, total: 50000, paidTotal: 50000,
  payments: [{ id: 'pay', methodId: 'm', methodName: 'Tunai', kind: 'cash', amount: 50000, tendered: 50000, change: 0 }],
} as unknown as Order;
const lines = (ctx: OutletContext, cols = 32) => receiptPieces({ order, ctx, cashierName: 'Budi', kind: 'receipt', cols, printedAt: '2026-11-10T04:00:00.000Z' }).map((p) => p.text);

describe('templat struk', () => {
  it('tanpa templat = isi lama (semua tampil, tanpa baris dicetak)', () => {
    const t = lines(base).join('\n');
    expect(t).toContain('Coffee Ground'); expect(t).toContain('Jl. Raya Darmo 1'); expect(t).toContain('031-123'); expect(t).toContain('Kasir: Budi'); expect(t).toContain('Pelanggan: Ani');
    expect(t).toContain('Meja 3'); expect(t).toContain('2 tamu'); expect(t).toContain('kurang manis'); expect(t).toContain('Extra shot'); expect(t).not.toContain('dicetak');
  });
  it('pilihan lama kasir/pelanggan (0027) tetap berlaku, templat bisa menimpa', () => {
    expect(resolveReceiptTemplate({ receiptShowCashier: false }).showCashier).toBe(false);
    expect(resolveReceiptTemplate({ receiptShowCashier: false, receiptTemplate: { showCashier: true } }).showCashier).toBe(true);
    expect(lines({ ...base, receiptShowCashier: false } as OutletContext).join('\n')).not.toContain('Kasir:');
  });
  it('menyembunyikan bagian sesuai templat', () => {
    const ctx = { ...base, receiptTemplate: { showOutletName: false, showAddress: false, showPhone: false, showOrderNo: false, showTime: false, showGuests: false, showTable: false, showNotes: false, showExtras: false, showUnitPrice: false } } as OutletContext;
    const t = lines(ctx).join('\n');
    for (const s of ['Coffee Ground', 'Jl. Raya', '031-123', 'OUT1/A', 'tamu', 'Meja 3', 'kurang manis', 'Extra shot', 'Rp 20.000']) expect(t).not.toContain(s);
    expect(t).toContain('TOTAL'); expect(t).toContain('Tunai');
  });
  it('baris dicetak muncul bila dinyalakan', () => {
    const t = lines({ ...base, receiptTemplate: { showPrintTime: true } } as OutletContext).join('\n');
    expect(t).toContain('dicetak 10/11/2026');
  });
  it('tema Besar mempersempit kolom dan menandai semua potongan; Sedang tidak', () => {
    expect(themeCols(32, 'large')).toBe(16); expect(themeCols(48, 'large')).toBe(24); expect(themeCols(32, 'medium')).toBe(32); expect(themeCols(32, 'normal')).toBe(32);
    const big = receiptPieces({ order, ctx: { ...base, receiptTemplate: { theme: 'large' } } as OutletContext, cashierName: 'Budi', kind: 'receipt', cols: 32 });
    expect(big.every((p) => p.size === 'large')).toBe(true);
    expect(big.every((p) => p.text.length <= 16)).toBe(true);
    const med = receiptPieces({ order, ctx: { ...base, receiptTemplate: { theme: 'medium' } } as OutletContext, cashierName: 'Budi', kind: 'receipt', cols: 32 });
    expect(med.every((p) => p.size === 'medium')).toBe(true);
  });
  it('byte ESC/POS memuat perintah ukuran huruf (GS ! n) dan menutupnya kembali', () => {
    const find = (b: Uint8Array, n: number) => { for (let i = 0; i < b.length - 2; i++) if (b[i] === 0x1d && b[i + 1] === 0x21 && b[i + 2] === n) return true; return false; };
    const large = receiptBytes({ order, ctx: { ...base, receiptTemplate: { theme: 'large' } } as OutletContext, cashierName: 'Budi', kind: 'receipt', paper: '58' });
    expect(find(large, 0x11)).toBe(true); expect(find(large, 0x00)).toBe(true);
    const med = receiptBytes({ order, ctx: { ...base, receiptTemplate: { theme: 'medium' } } as OutletContext, cashierName: 'Budi', kind: 'receipt', paper: '58' });
    expect(find(med, 0x01)).toBe(true);
    expect(find(receiptBytes({ order, ctx: base, cashierName: 'Budi', kind: 'receipt', paper: '58' }), 0x11)).toBe(false);
  });
  it('sanitize membuang kunci tak dikenal dan nilai salah', () => {
    expect(sanitizeReceiptTemplate(null)).toEqual({}); expect(sanitizeReceiptTemplate([1])).toEqual({});
    expect(sanitizeReceiptTemplate({ theme: 'huge', showPhone: 'ya', maxPrints: 99, aneh: true, showAddress: false, maxPrints2: 1 })).toEqual({ showAddress: false });
    expect(sanitizeReceiptTemplate({ theme: 'medium', maxPrints: 2 })).toEqual({ theme: 'medium', maxPrints: 2 });
  });
  it('validasi dan batas cetak ulang', () => {
    expect(receiptTemplateProblem({ theme: 'large', maxPrints: 3 })).toBeNull();
    expect(receiptTemplateProblem({ theme: 'x' as never })).toMatch(/Tema/);
    expect(receiptTemplateProblem({ maxPrints: 11 })).toMatch(/Batas cetak/);
    expect(receiptTemplateProblem({ maxPrints: 1.5 })).toMatch(/Batas cetak/);
    expect(receiptTemplateProblem({ showPhone: 1 as never })).toMatch(/tidak sah/);
    expect(canPrintAgain(5, 0)).toBe(true); expect(canPrintAgain(1, 2)).toBe(true); expect(canPrintAgain(2, 2)).toBe(false);
    expect(DEFAULT_RECEIPT_TEMPLATE.maxPrints).toBe(0);
  });
});

describe('templat struk lewat lapisan data (fake)', () => {
  it('disimpan, dibersihkan, dan ikut konteks outlet', async () => {
    const { createFakeData } = await import('../src');
    const d = createFakeData();
    const o0 = await d.getOutletSettings();
    expect(o0.options.receiptTemplate).toEqual({});
    await d.saveOutletOptions({ ...o0.options, receiptTemplate: { theme: 'large', showPhone: false, maxPrints: 2, aneh: 1 } as never });
    const o1 = await d.getOutletSettings();
    expect(o1.options.receiptTemplate).toEqual({ theme: 'large', showPhone: false, maxPrints: 2 });
    expect((await d.getContext()).receiptTemplate).toEqual({ theme: 'large', showPhone: false, maxPrints: 2 });
    await expect(d.saveOutletOptions({ ...o0.options, receiptTemplate: { maxPrints: 50 } })).rejects.toThrow(/Batas cetak/);
  });
});
