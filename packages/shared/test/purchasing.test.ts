import { describe, expect, it } from 'vitest';
import {
  addDays, createFakeData, invoiceOverdue, invoiceStatusFor, newId, purchaseInvoiceProblem, purchaseOrderProblem, purchasePayProblem, purchaseReceiveProblem,
  purchaseSubtotal, purchaseTotal, purchaseUnitCost, supplierProblem,
} from '../src';

const mk = () => { const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') }); d.reset(); return d; };
const kopi = (d: ReturnType<typeof mk>) => d.listPurchaseItems().then((xs) => xs.find((x) => x.productId === 'ing-kopi')!);

describe('pembelian: rumus', () => {
  it('subtotal, total, dan biaya per satuan dasar', () => {
    const lines = [{ qty: 2, unitPrice: 50000, discount: 5000 }];
    expect(purchaseSubtotal(lines)).toBe(95000);
    expect(purchaseTotal(lines, 5000, 9000, 1000)).toBe(100000);
    // 47.500 per karung x (95.000 - 5.000 + 1.000)/95.000 / 10 satuan dasar
    expect(purchaseUnitCost(lines[0]!, 10, { subtotal: 95000, discount: 5000, otherCost: 1000 })).toBe(Math.round(47500 * (91000 / 95000) / 10 * 10000) / 10000);
    expect(purchaseUnitCost({ qty: 1, unitPrice: 0 }, 1, { subtotal: 0, discount: 0, otherCost: 0 })).toBe(0);
  });
  it('tanggal jatuh tempo dan status', () => {
    expect(addDays('2026-11-09', 14)).toBe('2026-11-23');
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04');
    expect(invoiceOverdue({ status: 'open', dueDate: '2026-11-08' }, '2026-11-09')).toBe(true);
    expect(invoiceOverdue({ status: 'open', dueDate: '2026-11-09' }, '2026-11-09')).toBe(false);
    expect(invoiceOverdue({ status: 'paid', dueDate: '2026-01-01' }, '2026-11-09')).toBe(false);
    expect(invoiceStatusFor(100, 0)).toBe('open');
    expect(invoiceStatusFor(100, 40)).toBe('partially_paid');
    expect(invoiceStatusFor(100, 100)).toBe('paid');
  });
  it('validasi pemasok, PO, faktur, penerimaan, dan pembayaran', () => {
    expect(supplierProblem({ name: ' ', termDays: 0 })).toMatch(/Nama/);
    expect(supplierProblem({ name: 'A', termDays: -1 })).toMatch(/Termin/);
    expect(supplierProblem({ name: 'A', termDays: 7, email: 'salah' })).toMatch(/email/);
    expect(supplierProblem({ name: 'A', termDays: 7, email: 'a@b.co' })).toBeNull();
    const line = { productId: 'x', unitId: 'u', qty: 1, unitPrice: 1000 };
    const base = { id: 'i', supplierId: 's', discount: 0, tax: 0, otherCost: 0, status: 'ordered' as const };
    expect(purchaseOrderProblem({ ...base, lines: [] })).toMatch(/minimal satu/);
    expect(purchaseOrderProblem({ ...base, lines: [{ ...line, qty: 0 }] })).toMatch(/lebih dari nol/);
    expect(purchaseOrderProblem({ ...base, lines: [{ ...line, discount: 2000 }] })).toMatch(/Diskon baris/);
    expect(purchaseOrderProblem({ ...base, discount: 5000, lines: [line] })).toMatch(/Diskon melebihi/);
    expect(purchaseOrderProblem({ ...base, supplierId: '', lines: [line] })).toMatch(/pemasok/);
    expect(purchaseOrderProblem({ ...base, lines: [line] })).toBeNull();
    expect(purchaseInvoiceProblem({ id: 'f', discount: 0, tax: 0, otherCost: 0, lines: [{ ...line, receivedQty: 2 }] })).toMatch(/diterima/);
    expect(purchaseInvoiceProblem({ id: 'f', discount: 0, tax: 0, otherCost: 0, termDays: 1.5, lines: [line] })).toMatch(/Termin/);
    const ls = [{ id: 'l1', qty: 5, receivedQty: 3 }];
    expect(purchaseReceiveProblem({ id: 'r', invoiceId: 'f', items: [{ lineId: 'l1', qty: 3 }] }, ls)).toMatch(/melebihi/);
    expect(purchaseReceiveProblem({ id: 'r', invoiceId: 'f', items: [{ lineId: 'l1', qty: 0 }] }, ls)).toMatch(/Isi jumlah/);
    expect(purchaseReceiveProblem({ id: 'r', invoiceId: 'f', items: [{ lineId: 'l1', qty: 2 }] }, ls)).toBeNull();
    expect(purchasePayProblem({ id: 'p', invoiceId: 'f', accountId: 'a', amount: 0 }, 100)).toMatch(/lebih dari nol/);
    expect(purchasePayProblem({ id: 'p', invoiceId: 'f', accountId: 'a', amount: 101 }, 100)).toMatch(/melebihi/);
    expect(purchasePayProblem({ id: 'p', invoiceId: 'f', accountId: '', amount: 10 }, 100)).toMatch(/akun/);
    expect(purchasePayProblem({ id: 'p', invoiceId: 'f', accountId: 'a', amount: 100 }, 100)).toBeNull();
  });
});

describe('pembelian: data tiruan', () => {
  it('pemasok: tambah, ubah, nonaktifkan, nama ganda ditolak', async () => {
    const d = mk();
    const before = (await d.listSuppliers()).length;
    const s = await d.saveSupplier({ name: 'Toko Baru', termDays: 30, phone: ' 0812 ' });
    expect(s.termDays).toBe(30); expect(s.phone).toBe('0812');
    await expect(d.saveSupplier({ name: 'toko baru', termDays: 0 })).rejects.toThrow(/Sudah ada/);
    await d.saveSupplier({ id: s.id, name: 'Toko Baru', termDays: 30, isActive: false });
    expect((await d.listSuppliers()).length).toBe(before);
    expect((await d.listSuppliers({ includeInactive: true })).length).toBe(before + 1);
    await expect(d.saveSupplier({ id: 'tidak-ada', name: 'X', termDays: 0 })).rejects.toThrow(/tidak ditemukan/);
  });
  it('PO dihitung, bisa diubah saat dipesan, dibuatkan faktur lalu terkunci', async () => {
    const d = mk();
    const k = await kopi(d);
    const kg = k.units.find((u) => !u.isBase)!;
    const poId = newId();
    const po = await d.savePurchaseOrder({ id: poId, supplierId: 'sp-kopi', discount: 5000, tax: 9000, otherCost: 1000, status: 'ordered', lines: [{ productId: k.productId, unitId: kg.unitId, qty: 2, unitPrice: 50000, discount: 5000 }] });
    expect(po.number).toBe('PO-000001'); expect(po.total).toBe(100000);
    const po2 = await d.savePurchaseOrder({ id: poId, supplierId: 'sp-kopi', discount: 0, tax: 0, otherCost: 0, status: 'ordered', lines: [{ productId: k.productId, unitId: kg.unitId, qty: 3, unitPrice: 50000 }] });
    expect(po2.total).toBe(150000); expect(po2.lines).toHaveLength(1);
    const q0 = (await d.listStock()).find((i) => i.productId === k.productId)!.qty;
    const inv = await d.createPurchaseInvoice({ id: newId(), supplierId: 'sp-kopi', orderId: poId, discount: 0, tax: 0, otherCost: 0, lines: [{ productId: k.productId, unitId: kg.unitId, qty: 3, unitPrice: 50000, receivedQty: 1 }] });
    expect((await d.getPurchaseOrder(poId))!.status).toBe('received');
    expect(inv.dueDate).toBe('2026-11-23');                       // termin pemasok 14 hari dari 9 Nov
    expect((await d.listStock()).find((i) => i.productId === k.productId)!.qty).toBe(q0 + 1000);   // 1 kg = 1000 gram
    await expect(d.savePurchaseOrder({ id: poId, supplierId: 'sp-kopi', discount: 0, tax: 0, otherCost: 0, status: 'ordered', lines: [{ productId: k.productId, unitId: kg.unitId, qty: 1, unitPrice: 1 }] })).rejects.toThrow(/sudah diterima/);
    await expect(d.createPurchaseInvoice({ id: newId(), supplierId: 'sp-kopi', orderId: poId, discount: 0, tax: 0, otherCost: 0, lines: [{ productId: k.productId, unitId: kg.unitId, qty: 1, unitPrice: 1 }] })).rejects.toThrow(/tidak bisa dibuatkan faktur/);
  });
  it('faktur: idempoten, stok masuk memakai biaya per satuan dasar, penerimaan lanjutan dan pembayaran', async () => {
    const d = mk();
    const k = await kopi(d);
    const kg = k.units.find((u) => !u.isBase)!;
    const id = newId();
    const input = { id, supplierId: 'sp-kopi', discount: 0, tax: 0, otherCost: 0, lines: [{ productId: k.productId, unitId: kg.unitId, qty: 2, unitPrice: 320000, receivedQty: 1 }] };
    const inv = await d.createPurchaseInvoice(input);
    await d.createPurchaseInvoice(input);                              // diulang: tidak ada dokumen atau stok ganda
    expect(await d.listPurchaseInvoices()).toHaveLength(1);
    expect(inv.total).toBe(640000); expect(inv.status).toBe('open'); expect(inv.outstanding).toBe(640000);
    const stock = (await d.listStock()).find((i) => i.productId === k.productId)!;
    expect(stock.qty).toBe(5000 + 1000);
    const line = inv.lines[0]!;
    const rid = newId();
    await expect(d.receivePurchase({ id: newId(), invoiceId: id, items: [{ lineId: line.id, qty: 2 }] })).rejects.toThrow(/melebihi/);
    const after = await d.receivePurchase({ id: rid, invoiceId: id, items: [{ lineId: line.id, qty: 1 }] });
    expect(after.lines[0]!.receivedQty).toBe(2);
    await d.receivePurchase({ id: rid, invoiceId: id, items: [{ lineId: line.id, qty: 1 }] });   // kunci sama: tidak menggandakan
    expect((await d.listStock()).find((i) => i.productId === k.productId)!.qty).toBe(7000);
    const pid = newId();
    await expect(d.payPurchase({ id: newId(), invoiceId: id, accountId: 'acc-kas', amount: 700000 })).rejects.toThrow(/melebihi/);
    const p1 = await d.payPurchase({ id: pid, invoiceId: id, accountId: 'acc-kas', amount: 200000 });
    expect(p1.status).toBe('partially_paid'); expect(p1.outstanding).toBe(440000);
    await d.payPurchase({ id: pid, invoiceId: id, accountId: 'acc-kas', amount: 200000 });      // kunci sama
    expect((await d.getPurchaseInvoice(id))!.paidTotal).toBe(200000);
    const p2 = await d.payPurchase({ id: newId(), invoiceId: id, accountId: 'acc-bank', amount: 440000 });
    expect(p2.status).toBe('paid'); expect(p2.payments.map((p) => p.number)).toEqual(['BYR-000001', 'BYR-000002']);
    await expect(d.payPurchase({ id: newId(), invoiceId: id, accountId: 'acc-kas', amount: 1 })).rejects.toThrow(/tidak bisa dibayar/);
    expect(await d.listPurchaseInvoices({ supplierId: 'sp-susu' })).toHaveLength(0);
    expect(await d.listPurchaseInvoices({ status: 'paid' })).toHaveLength(1);
  });
  it('menolak satuan yang bukan milik barang dan barang tanpa stok', async () => {
    const d = mk();
    const k = await kopi(d);
    await expect(d.createPurchaseInvoice({ id: newId(), discount: 0, tax: 0, otherCost: 0, lines: [{ productId: k.productId, unitId: 'u-liter', qty: 1, unitPrice: 1 }] })).rejects.toThrow(/Satuan/);
    await expect(d.createPurchaseInvoice({ id: newId(), discount: 0, tax: 0, otherCost: 0, lines: [{ productId: 'tidak-ada', unitId: 'u', qty: 1, unitPrice: 1 }] })).rejects.toThrow(/tidak ditemukan/);
  });
});
