import { describe, expect, it } from 'vitest';
import { createFakeSalesDocuments, salesDocumentError, salesDocumentProblem, type SalesDocumentInput } from '../src/sales-documents';

let n = 0;
const mk = (invoices: string[] = ['inv1']) => createFakeSalesDocuments({
  customerName: async (id) => (id === 'c1' ? 'PT Pelanggan' : undefined), invoiceExists: async (id) => invoices.includes(id), today: () => '2026-11-13', newId: () => `id${++n}`,
});
const lines = [{ name: 'Kopi', qty: 10, unitPrice: 100000 }, { name: 'Gula', qty: 5, unitPrice: 20000 }];
const quote: SalesDocumentInput = { id: 'q1', type: 'quote', customerId: 'c1', lines };

describe('validasi dokumen penjualan', () => {
  it('penawaran/pesanan baru wajib baris; pengiriman/penerimaan wajib induk', () => {
    expect(salesDocumentProblem(quote)).toBeNull();
    expect(salesDocumentProblem({ id: 'x', type: 'quote', lines: [] })).toMatch(/minimal satu baris/);
    expect(salesDocumentProblem({ id: 'x', type: 'delivery', lines })).toMatch(/dokumen sebelumnya/);
    expect(salesDocumentProblem({ id: 'x', type: 'order', parentId: 'q1' })).toBeNull();
    expect(salesDocumentProblem({ id: 'x', type: 'quote', lines: [{ name: ' ', qty: 1, unitPrice: 1 }] })).toMatch(/Nama/);
  });
  it('menerjemahkan galat server', () => {
    expect(salesDocumentError({ message: 'parent not open' }).message).toMatch(/sudah dilanjutkan/);
    expect(salesDocumentError({ message: 'not allowed' }).code).toBe('forbidden');
  });
});

describe('alur dokumen (demo)', () => {
  it('penawaran -> pesanan -> pengiriman -> penerimaan -> faktur; baris disalin dan induk menjadi converted', async () => {
    const s = mk();
    const q = await s.createSalesDocument(quote);
    expect(q).toMatchObject({ number: 'PNW-000001', total: 1100000, status: 'open', customerName: 'PT Pelanggan' });
    const so = await s.createSalesDocument({ id: 'o1', type: 'order', parentId: 'q1' });
    expect(so).toMatchObject({ number: 'PSN-000001', total: 1100000, customerName: 'PT Pelanggan' });
    expect(so.lines).toHaveLength(2);
    expect((await s.listSalesDocuments('quote'))[0]!.status).toBe('converted');
    await s.createSalesDocument({ id: 'd1', type: 'delivery', parentId: 'o1' });
    await s.createSalesDocument({ id: 'r1', type: 'receipt', parentId: 'd1' });
    await s.linkSalesDocumentInvoice('r1', 'inv1');
    const rc = (await s.listSalesDocuments('receipt'))[0]!;
    expect(rc).toMatchObject({ status: 'converted', invoiceId: 'inv1' });
  });
  it('idempoten menurut id; urutan jenis dan status induk dijaga', async () => {
    const s = mk();
    await s.createSalesDocument(quote);
    await s.createSalesDocument(quote);
    expect(await s.listSalesDocuments()).toHaveLength(1);
    await expect(s.createSalesDocument({ id: 'd1', type: 'delivery', parentId: 'q1' })).rejects.toThrow(/Urutan dokumen salah/);
    await s.createSalesDocument({ id: 'o1', type: 'order', parentId: 'q1' });
    await expect(s.createSalesDocument({ id: 'o2', type: 'order', parentId: 'q1' })).rejects.toThrow(/sudah dilanjutkan/);
  });
  it('batal hanya untuk yang terbuka; faktur hanya dari pesanan/penerimaan yang terbuka', async () => {
    const s = mk();
    await s.createSalesDocument(quote);
    await s.createSalesDocument({ id: 'o1', type: 'order', parentId: 'q1' });
    await expect(s.cancelSalesDocument('q1')).rejects.toThrow(/tidak bisa dibatalkan/);
    await s.createSalesDocument({ ...quote, id: 'q2' });
    await s.cancelSalesDocument('q2');
    expect((await s.listSalesDocuments('quote')).find((d) => d.id === 'q2')!.status).toBe('cancelled');
    await expect(s.linkSalesDocumentInvoice('q2', 'inv1')).rejects.toThrow(/pesanan atau penerimaan/);
    await expect(s.linkSalesDocumentInvoice('o1', 'tidak-ada')).rejects.toThrow(/Faktur tidak ditemukan/);
    await s.linkSalesDocumentInvoice('o1', 'inv1');
    await expect(s.linkSalesDocumentInvoice('o1', 'inv1')).rejects.toThrow(/sudah dilanjutkan/);
  });
});
