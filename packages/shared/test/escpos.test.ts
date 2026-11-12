import { describe, expect, it } from 'vitest';
import { paperCols, receiptBytes, testPageBytes, toPrinterText, twoColumns, wrapText } from '../src';
import type { Order, OutletContext } from '../src';

const ctx = { outletName: 'Coffee Ground', address: 'Jl. Raya Darmo 1, Surabaya', phone: '031-123', timezone: 'Asia/Jakarta', receiptFooter: 'Terima kasih' } as unknown as OutletContext;
const order = {
  id: 'o1', number: 'OUT1/A/261110/101', type: 'dine_in', label: 'Meja 3', guestCount: 2, status: 'paid', openedAt: '2026-11-10T03:00:00.000Z', closedAt: '2026-11-10T03:10:00.000Z',
  items: [{ id: 'i1', productId: 'p', name: 'Kopi Susu Gula Aren Spesial Édisi Panjang Sekali', qty: 2, unitPrice: 20000, lineTotal: 40000, extras: [{ optionId: 'x', name: 'Extra shot', price: 5000 }] }],
  subtotal: 50000, discountTotal: 0, serviceCharge: 0, taxTotal: 0, rounding: 0, total: 50000, paidTotal: 50000,
  payments: [{ id: 'pay', methodId: 'm', methodName: 'Tunai', kind: 'cash', amount: 50000, tendered: 100000, change: 50000 }],
} as unknown as Order;

/** Urai byte kembali ke teks dengan melewati perintah ESC/GS. */
function asText(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i++) {
    const c = b[i]!;
    if (c === 0x1b) { i += b[i + 1] === 0x40 ? 1 : b[i + 1] === 0x70 ? 4 : 2; continue; }
    if (c === 0x1d) { i += 3; continue; }
    out += c === 10 ? '\n' : String.fromCharCode(c);
  }
  return out;
}

describe('ESC/POS', () => {
  it('lebar kolom mengikuti kertas', () => { expect(paperCols('58')).toBe(32); expect(paperCols('80')).toBe(48); });
  it('teks aksen dan simbol diubah ke ASCII', () => {
    expect(toPrinterText('Café × 2 · Édisi “baru”…')).toBe('Cafe x 2 - Edisi "baru"...');
    expect(toPrinterText('日本')).toBe('??');
  });
  it('dua kolom rata kiri-kanan tepat selebar kertas; terlalu panjang turun baris', () => {
    const [l] = twoColumns('Subtotal', 'Rp 50.000', 32);
    expect(l).toHaveLength(32); expect(l!.startsWith('Subtotal')).toBe(true); expect(l!.endsWith('Rp 50.000')).toBe(true);
    expect(twoColumns('Nama produk yang sangat panjang sekali', 'Rp 1.000', 20).length).toBeGreaterThan(1);
  });
  it('wrapText tidak melebihi lebar, kata terlalu panjang dipotong', () => {
    for (const l of wrapText('satu dua tiga empat lima enam tujuh delapan sembilan sepuluh ' + 'x'.repeat(50), 20)) expect(l.length).toBeLessThanOrEqual(20);
  });
  it('struk: init, potong, isi lengkap, tak ada baris melebihi lebar', () => {
    const b = receiptBytes({ order, ctx, cashierName: 'Budi', kind: 'receipt', paper: '58' });
    expect(Array.from(b.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(b.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]);
    const t = asText(b);
    expect(t).toContain('Coffee Ground'); expect(t).toContain('Extra shot'); expect(t).toContain('Kembalian'); expect(t).toContain('Kasir: Budi');
    expect(t).not.toContain('É');
    for (const line of t.split('\n')) expect(line.length).toBeLessThanOrEqual(32);
  });
  it('tampilan struk: teks kepala tampil; kasir dan pelanggan bisa disembunyikan; total dan pajak tetap', () => {
    const o = { ...order, customerName: 'Ibu Sari' } as unknown as Order;
    const plain = asText(receiptBytes({ order: o, ctx, cashierName: 'Budi', kind: 'receipt', paper: '80' }));
    expect(plain).toContain('Kasir: Budi'); expect(plain).toContain('Pelanggan: Ibu Sari');
    const custom = { ...ctx, receiptHeader: 'Buka 08.00-22.00\n\n  Wi-Fi: kopi123 ', receiptShowCashier: false, receiptShowCustomer: false } as unknown as OutletContext;
    const t = asText(receiptBytes({ order: o, ctx: custom, cashierName: 'Budi', kind: 'receipt', paper: '80' }));
    expect(t).toContain('Buka 08.00-22.00'); expect(t).toContain('Wi-Fi: kopi123');
    expect(t).not.toContain('Kasir:'); expect(t).not.toContain('Pelanggan:');
    expect(t).toContain('TOTAL'); expect(t).toContain('Kembalian');
    expect(t.indexOf('Buka 08.00')).toBeGreaterThan(t.indexOf('031-123'));
  });
  it('tagihan memuat sisa dan tanpa Kembalian; laci kas hanya bila diminta', () => {
    const bill = { ...order, status: 'open', paidTotal: 10000, payments: [] } as unknown as Order;
    const t = asText(receiptBytes({ order: bill, ctx, cashierName: 'Budi', kind: 'bill', paper: '80' }));
    expect(t).toContain('TAGIHAN'); expect(t).toContain('Sisa'); expect(t).not.toContain('Kembalian');
    const noDrawer = receiptBytes({ order, ctx, cashierName: 'B', kind: 'receipt', paper: '80' });
    const withDrawer = receiptBytes({ order, ctx, cashierName: 'B', kind: 'receipt', paper: '80', openDrawer: true });
    expect(Array.from(withDrawer.slice(-5))).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
    expect(withDrawer.length - noDrawer.length).toBe(5);
  });
  it('halaman uji sesuai lebar kertas', () => {
    for (const line of asText(testPageBytes('58', 'Coffee Ground')).split('\n')) expect(line.length).toBeLessThanOrEqual(32);
  });
  it('mencetak nomor referensi kupon/promo di bawah Potongan bila ada', () => {
    const withDisc = {
      ...order,
      discountTotal: 5000,
      total: 45000,
      paidTotal: 45000,
      discounts: [{ id: 'd1', source: 'coupon', label: 'Potongan 5 ribu', amount: 5000, reference: 'CPN-001' }],
    } as unknown as Order;
    const t = asText(receiptBytes({ order: withDisc, ctx, cashierName: 'Budi', kind: 'receipt', paper: '58' }));
    expect(t).toContain('Potongan');
    expect(t).toContain('Potongan 5 ribu - Ref: CPN-001');
    for (const line of t.split('\n')) expect(line.length).toBeLessThanOrEqual(32);
  });
});
