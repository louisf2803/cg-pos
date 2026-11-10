import { describe, expect, it } from 'vitest';
import { accessFor, createFakeData, newId, paymentRefField, paymentRefProblem } from '../src';

describe('keterangan pembayaran', () => {
  it('komplimen wajib beralasan, kartu dan transfer opsional, tunai tidak ada isian', () => {
    expect(paymentRefField('complimentary')?.required).toBe(true);
    expect(paymentRefField('noncash')?.required).toBe(false);
    expect(paymentRefField('cash')).toBeNull();
    expect(paymentRefProblem('complimentary', '  ab ')).toMatch(/alasan/i);
    expect(paymentRefProblem('complimentary', 'tamu undangan')).toBeNull();
    expect(paymentRefProblem('noncash', undefined)).toBeNull();
    expect(paymentRefProblem('noncash', 'x'.repeat(121))).toMatch(/120/);
  });
  it('kasir butuh persetujuan manajer untuk komplimen, manajer langsung', () => {
    expect(accessFor('cashier', 'complimentary')).toBe('approve');
    expect(accessFor('manager', 'complimentary')).toBe('allow');
    expect(accessFor('owner', 'complimentary')).toBe('allow');
  });
});

describe('bayar gratis di data palsu', () => {
  async function newOrder(d: ReturnType<typeof createFakeData>) {
    const shift = await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    const p = (await d.listProducts())[0]!;
    const o = await d.saveOrder({ id: newId(), type: 'takeaway', items: [{ id: newId(), productId: p.id, name: p.name, qty: 1, unitPrice: p.price }] }, 'e-sari');
    return { shift, o };
  }
  it('ditolak tanpa alasan, diterima dengan alasan yang tersimpan', async () => {
    const d = createFakeData();
    const { o } = await newOrder(d);
    const free = (await d.listPaymentMethods()).find((m) => m.kind === 'complimentary')!;
    await expect(d.addPayment(o.id, { id: newId(), methodId: free.id, amount: o.total })).rejects.toThrow(/alasan/i);
    const paid = await d.addPayment(o.id, { id: newId(), methodId: free.id, amount: o.total, reference: 'Tamu undangan' });
    expect(paid.status).toBe('paid');
    expect(paid.payments[0]!.reference).toBe('Tamu undangan');
  });
  it('nomor referensi kartu ikut tersimpan', async () => {
    const d = createFakeData();
    const { o } = await newOrder(d);
    const edc = (await d.listPaymentMethods()).find((m) => m.code === 'EDC')!;
    const paid = await d.addPayment(o.id, { id: newId(), methodId: edc.id, amount: o.total, reference: ' 123456 ' });
    expect(paid.payments[0]!.reference).toBe('123456');
  });
});
