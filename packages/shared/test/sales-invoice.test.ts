import { describe, expect, it } from 'vitest';
import {
  salesDueDate, createFakeSalesInvoices, salesInvoiceError, salesInvoiceOverdue, salesInvoiceProblem, salesInvoiceStatus, salesInvoiceTotals, salesPayProblem,
  type SalesInvoiceInput,
} from '../src/sales-invoice';

const base: SalesInvoiceInput = {
  id: 'i1', termDays: 14, discount: 100000, taxAmount: 110000, downPayment: 300000, accountId: 'kas', date: '2026-11-01',
  lines: [{ name: 'Kopi 1 kg', qty: 10, unitPrice: 100000 }, { name: 'Gula', qty: 5, unitPrice: 20000 }],
};

describe('hitungan faktur penjualan', () => {
  it('total = subtotal - diskon + pajak', () => {
    expect(salesInvoiceTotals(base.lines, 100000, 110000)).toEqual({ subtotal: 1100000, total: 1110000 });
  });
  it('tanggal jatuh tempo tidak terpengaruh zona waktu', () => {
    expect(salesDueDate('2026-11-01', 14)).toBe('2026-11-15');
    expect(salesDueDate('2026-12-25', 10)).toBe('2027-01-04');
  });
  it('status menurut jumlah terbayar', () => {
    expect(salesInvoiceStatus(1000, 0)).toBe('open');
    expect(salesInvoiceStatus(1000, 1)).toBe('partially_paid');
    expect(salesInvoiceStatus(1000, 1000)).toBe('paid');
  });
  it('lewat jatuh tempo hanya bila belum lunas', () => {
    expect(salesInvoiceOverdue({ status: 'open', dueDate: '2026-11-01' }, '2026-11-02')).toBe(true);
    expect(salesInvoiceOverdue({ status: 'paid', dueDate: '2026-11-01' }, '2026-11-02')).toBe(false);
    expect(salesInvoiceOverdue({ status: 'open', dueDate: '2026-11-02' }, '2026-11-02')).toBe(false);
  });
});

describe('validasi', () => {
  it('menerima faktur yang benar', () => expect(salesInvoiceProblem(base)).toBeNull());
  it('menolak tanpa baris, uang muka tanpa akun, uang muka berlebih, diskon berlebih', () => {
    expect(salesInvoiceProblem({ ...base, lines: [] })).toMatch(/minimal satu baris/);
    expect(salesInvoiceProblem({ ...base, accountId: undefined })).toMatch(/akun kas atau bank/);
    expect(salesInvoiceProblem({ ...base, downPayment: 2000000 })).toMatch(/Uang muka/);
    expect(salesInvoiceProblem({ ...base, discount: 5000000 })).toMatch(/Diskon/);
    expect(salesInvoiceProblem({ ...base, termDays: -1 })).toMatch(/Termin/);
    expect(salesInvoiceProblem({ ...base, lines: [{ name: ' ', qty: 1, unitPrice: 1 }] })).toMatch(/Nama/);
  });
  it('pembayaran tidak boleh melebihi sisa', () => {
    expect(salesPayProblem(500, 501)).toMatch(/melebihi/);
    expect(salesPayProblem(500, 0)).toMatch(/lebih dari nol/);
    expect(salesPayProblem(500, 500)).toBeNull();
  });
  it('menerjemahkan galat server', () => {
    expect(salesInvoiceError({ message: 'amount exceeds outstanding' }).message).toMatch(/melebihi sisa/);
    expect(salesInvoiceError({ message: 'not allowed' }).code).toBe('forbidden');
  });
});

describe('penyimpanan demo', () => {
  const mk = () => createFakeSalesInvoices({ customerName: async (id) => (id === 'c1' ? 'PT Pelanggan' : undefined), today: () => '2026-11-13', newId: (() => { let n = 0; return () => `id${++n}`; })() });

  it('faktur dengan uang muka: sebagian dibayar, uang muka jadi pembayaran pertama, nomor berurut', async () => {
    const s = mk();
    const inv = await s.createSalesInvoice({ ...base, customerId: 'c1' });
    expect(inv.number).toBe('FJ-000001');
    expect(inv).toMatchObject({ total: 1110000, paidTotal: 300000, outstanding: 810000, status: 'partially_paid', dueDate: '2026-11-15', customerName: 'PT Pelanggan' });
    expect(inv.payments).toHaveLength(1);
    expect(inv.payments[0]).toMatchObject({ isDownPayment: true, amount: 300000 });
  });
  it('idempoten menurut id', async () => {
    const s = mk();
    await s.createSalesInvoice(base);
    await s.createSalesInvoice(base);
    expect(await s.listSalesInvoices()).toHaveLength(1);
  });
  it('pembayaran bertahap sampai lunas, ulang id yang sama tidak menggandakan, lebih dari sisa ditolak', async () => {
    const s = mk();
    await s.createSalesInvoice(base);
    let r = await s.paySalesInvoice({ id: 'p1', invoiceId: 'i1', accountId: 'kas', amount: 500000 });
    expect(r.status).toBe('partially_paid');
    r = await s.paySalesInvoice({ id: 'p1', invoiceId: 'i1', accountId: 'kas', amount: 500000 });
    expect(r.paidTotal).toBe(800000);
    await expect(s.paySalesInvoice({ id: 'p2', invoiceId: 'i1', accountId: 'kas', amount: 310001 })).rejects.toThrow(/melebihi/);
    r = await s.paySalesInvoice({ id: 'p3', invoiceId: 'i1', accountId: 'kas', amount: 310000 });
    expect(r).toMatchObject({ status: 'paid', outstanding: 0 });
  });
  it('tanpa uang muka berstatus belum dibayar; pelanggan tidak dikenal ditolak', async () => {
    const s = mk();
    const inv = await s.createSalesInvoice({ ...base, id: 'i2', downPayment: 0, accountId: undefined });
    expect(inv.status).toBe('open');
    expect(inv.customerName).toBe('(tanpa pelanggan)');
    await expect(s.createSalesInvoice({ ...base, id: 'i3', customerId: 'x' })).rejects.toThrow(/Pelanggan/);
  });
});
