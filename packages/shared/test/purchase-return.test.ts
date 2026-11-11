import { describe, expect, it } from 'vitest';
import {
  maxReturnableQty,
  purchaseReturnProblem,
  purchaseReturnTotal,
  returnedQtyByLine,
} from '../src/purchase-return';

const INVOICE_LINES = [
  { id: 'l1', name: 'Biji Kopi Arabika', receivedQty: 10, unitPrice: 120000 },
  { id: 'l2', name: 'Susu UHT', receivedQty: 5, unitPrice: 18000 },
  { id: 'l3', name: 'Gula Aren (belum diterima)', receivedQty: 0, unitPrice: 25000 },
];

describe('purchase-return helpers', () => {
  it('computes max returnable qty minus prior returns', () => {
    expect(maxReturnableQty(10, 3)).toBe(7);
    expect(maxReturnableQty(5, 8)).toBe(0);

    const byLine = returnedQtyByLine(
      [
        {
          invoiceId: 'inv-1',
          lines: [{ lineId: 'l1', productId: 'p1', name: 'Biji Kopi', unit: 'kg', unitPrice: 120000, qty: 3, lineTotal: 360000 }],
        },
        {
          invoiceId: 'inv-other',
          lines: [{ lineId: 'l1', productId: 'p1', name: 'Biji Kopi', unit: 'kg', unitPrice: 120000, qty: 4, lineTotal: 480000 }],
        },
      ],
      'inv-1',
    );
    expect(byLine.get('l1')).toBe(3);
  });

  it('rejects negative qty, zero-only selection, missing reason, and qty exceeding returnable remainder', () => {
    const prior = new Map<string, number>([['l1', 4]]); // l1 max left = 6

    expect(
      purchaseReturnProblem(
        {
          invoiceId: 'inv-1',
          returnDate: '2026-11-11',
          resolution: 'reduce_payable',
          reason: 'Kemasan rusak',
          lines: [{ lineId: 'l1', qty: -1 }],
        },
        INVOICE_LINES,
        prior,
      ),
    ).toBe('Jumlah retur tidak boleh negatif.');

    expect(
      purchaseReturnProblem(
        {
          invoiceId: 'inv-1',
          returnDate: '2026-11-11',
          resolution: 'reduce_payable',
          reason: 'Kemasan rusak',
          lines: [{ lineId: 'l1', qty: 7 }],
        },
        INVOICE_LINES,
        prior,
      ),
    ).toContain('melebihi sisa yang dapat diretur (6)');

    expect(
      purchaseReturnProblem(
        {
          invoiceId: 'inv-1',
          returnDate: '2026-11-11',
          resolution: 'reduce_payable',
          reason: 'Kemasan rusak',
          lines: [{ lineId: 'l3', qty: 1 }],
        },
        INVOICE_LINES,
        prior,
      ),
    ).toContain('melebihi sisa yang dapat diretur (0)');

    expect(
      purchaseReturnProblem(
        {
          invoiceId: 'inv-1',
          returnDate: '2026-11-11',
          resolution: 'reduce_payable',
          reason: '   ',
          lines: [{ lineId: 'l1', qty: 2 }],
        },
        INVOICE_LINES,
        prior,
      ),
    ).toBe('Alasan retur wajib diisi.');

    expect(
      purchaseReturnProblem(
        {
          invoiceId: 'inv-1',
          returnDate: '2026-11-11',
          resolution: 'reduce_payable',
          reason: 'Kadaluwarsa',
          lines: [{ lineId: 'l1', qty: 0 }],
        },
        INVOICE_LINES,
        prior,
      ),
    ).toBe('Isi minimal satu barang dengan jumlah retur lebih dari 0.');
  });

  it('accepts valid return quantities and calculates total return value', () => {
    const prior = new Map<string, number>([['l1', 4]]);
    const lines = [
      { lineId: 'l1', qty: 2 },
      { lineId: 'l2', qty: 1.5 },
    ];
    expect(
      purchaseReturnProblem(
        {
          invoiceId: 'inv-1',
          returnDate: '2026-11-11',
          resolution: 'cash_refund',
          reason: 'Produk cacat pengiriman',
          lines,
        },
        INVOICE_LINES,
        prior,
      ),
    ).toBeNull();

    expect(purchaseReturnTotal(lines, INVOICE_LINES)).toBe(2 * 120000 + 1.5 * 18000);
  });
});

