import { describe, expect, it } from 'vitest';
import { createFakeData, newId, purchaseOrderProblem, purchaseInvoiceProblem } from '../src';

describe('A126 - Pemesanan (PO) & Faktur Pembelian Lanjutan', () => {
  it('validasi uang muka pada PO dan Faktur', () => {
    const lines = [{ productId: 'p1', unitId: 'u1', qty: 2, unitPrice: 50000 }];
    // Valid
    expect(purchaseOrderProblem({
      id: 'po-1', supplierId: 's1', discount: 0, tax: 0, otherCost: 0, status: 'ordered',
      lines, downPayment: 20000,
    })).toBeNull();

    // Negatif
    expect(purchaseOrderProblem({
      id: 'po-1', supplierId: 's1', discount: 0, tax: 0, otherCost: 0, status: 'ordered',
      lines, downPayment: -5000,
    })).toBe('Uang muka tidak boleh negatif.');

    // Melebihi total
    expect(purchaseOrderProblem({
      id: 'po-1', supplierId: 's1', discount: 0, tax: 0, otherCost: 0, status: 'ordered',
      lines, downPayment: 150000,
    })).toBe('Uang muka tidak boleh melebihi total pesanan.');

    // Faktur: negatif
    expect(purchaseInvoiceProblem({
      id: 'inv-1', discount: 0, tax: 0, otherCost: 0, lines, downPayment: -1000,
    })).toBe('Uang muka tidak boleh negatif.');

    // Faktur: melebihi total
    expect(purchaseInvoiceProblem({
      id: 'inv-1', discount: 0, tax: 0, otherCost: 0, lines, downPayment: 200000,
    })).toBe('Uang muka tidak boleh melebihi total faktur.');
  });

  it('alur lengkap PO referensi permintaan, uang muka, faktur lampiran, dan pembatalan faktur', async () => {
    const data = createFakeData();
    const items = await data.listPurchaseItems();
    const item = items[0]!;
    const suppliers = await data.listSuppliers();
    const sup = suppliers[0]!;

    // 1. Buat permintaan barang
    const req = await data.createStockRequest({
      requesterId: 'loc-outlet',
      sourceId: 'loc-gudang',
      lines: [{ productId: item.productId, qty: 5 }],
      note: 'Permintaan restock biji kopi',
    });
    expect(req.number).toMatch(/^REQ-/);

    // 2. Buat PO berdasar permintaan dengan uang muka
    const poId = newId();
    const po = await data.savePurchaseOrder({
      id: poId,
      supplierId: sup.id,
      status: 'ordered',
      discount: 0,
      tax: 0,
      otherCost: 0,
      requestId: req.id,
      downPayment: 15000,
      lines: [{
        productId: item.productId,
        unitId: item.units[0]!.unitId,
        qty: 5,
        unitPrice: 10000,
      }],
      note: 'PO pesan kopi dari permintaan',
    });

    expect(po.requestId).toBe(req.id);
    expect(po.requestNumber).toBe(req.number);
    expect(po.downPayment).toBe(15000);
    expect(po.total).toBe(50000);

    const poList = await data.listPurchaseOrders();
    const foundPo = poList.find((p) => p.id === poId);
    expect(foundPo?.requestId).toBe(req.id);
    expect(foundPo?.requestNumber).toBe(req.number);
    expect(foundPo?.downPayment).toBe(15000);

    // 3. Buat faktur dari PO dengan uang muka & lampiran
    const invId = newId();
    const inv = await data.createPurchaseInvoice({
      id: invId,
      supplierId: sup.id,
      orderId: po.id,
      supplierInvoiceNo: 'SUP-INV-888',
      discount: 0,
      tax: 0,
      otherCost: 0,
      downPayment: po.downPayment,
      attachmentName: 'nota_pembelian.pdf',
      attachmentDataUrl: 'data:application/pdf;base64,mock',
      lines: [{
        productId: item.productId,
        unitId: item.units[0]!.unitId,
        qty: 5,
        unitPrice: 10000,
        receivedQty: 5,
      }],
    });

    expect(inv.downPayment).toBe(15000);
    expect(inv.attachmentName).toBe('nota_pembelian.pdf');
    expect(inv.attachmentDataUrl).toBe('data:application/pdf;base64,mock');

    const poAfterInv = await data.getPurchaseOrder(poId);
    expect(poAfterInv?.status).toBe('received');

    // 4. Batalkan faktur (void)
    const voided = await data.cancelPurchaseInvoice(invId, 'Salah nomor surat jalan');
    expect(voided.status).toBe('void');
    expect(voided.voidReason).toBe('Salah nomor surat jalan');
    expect(voided.voidAt).toBeDefined();

    // PO harus dibuka kembali menjadi ordered
    const poAfterVoid = await data.getPurchaseOrder(poId);
    expect(poAfterVoid?.status).toBe('ordered');
  });
});
