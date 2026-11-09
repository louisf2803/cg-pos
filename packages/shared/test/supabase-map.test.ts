import { describe, expect, it } from 'vitest';
import { computeOrder, createFakeData, DataError } from '../src';
import {
  buildOrderPayload, mapDbError, mapOpError, nextSeq, payloadFromStored, seqOf, summarizeSales, toOrder, toProduct, toShift,
} from '../src/supabase-map';

const SETTINGS = {
  taxCalc: 'after_discount', taxMode: 'per_order', serviceChargePct: 5, serviceChargeTaxable: true,
  serviceChargeOrderTypes: ['dine_in'], roundingCashStep: 100, roundingNoncashStep: 0, requireOpenShift: true, allowNegativeStock: true,
} as const;

describe('pemetaan galat', () => {
  it('penolakan op dari server menjadi kode yang dipahami layar', () => {
    const code = (m: string) => mapOpError(m).code;
    expect(code('order_locked: order already has payments or is closed')).toBe('order_locked');
    expect(code('only unpaid orders can be voided; use refund for paid orders')).toBe('order_locked');
    expect(code('version_conflict: server has version 3')).toBe('order_locked');
    expect(code('amount 50000 exceeds balance 49500')).toBe('bad_amount');
    expect(code('shift_closed: payment cannot join a closed shift')).toBe('no_open_shift');
    expect(code('gateway payments are created by the server, not by sync')).toBe('invalid');
    expect(code('duplicate key value violates unique constraint "orders_outlet_id_number_key"')).toBe('invalid');
    expect(code('duplicate key value violates unique constraint "shifts_one_open_per_device"')).toBe('shift_already_open');
    expect(code('')).toBe('invalid');
    expect(mapOpError('entah') instanceof DataError).toBe(true);
  });
  it('galat tabel/RPC: izin, sesi, duplikat', () => {
    expect(mapDbError({ code: '42501', message: 'permission denied for table employees' }).code).toBe('forbidden');
    expect(mapDbError({ message: 'new row violates row-level security policy' }).code).toBe('forbidden');
    expect(mapDbError({ code: 'PGRST301', message: 'JWT expired' }).code).toBe('forbidden');
    expect(mapDbError({ message: 'not your device' }).code).toBe('forbidden');
    expect(mapDbError({ code: '23505', message: 'dup' }).code).toBe('invalid');
  });
});

describe('pemetaan baris', () => {
  it('produk memakai satuan dasar dan membawa induk varian', () => {
    const p = toProduct({
      id: 'p1', name: 'Kopi (M)', category_id: 'c1', kind: 'goods', track_stock: false, is_active: true, is_favorite: false,
      parent_id: 'p0',
      product_units: [{ id: 'u2', price: '99999', sku: 'X', is_base: false, deleted_at: null }, { id: 'u1', price: '26000.00', sku: 'KP-1', is_base: true, deleted_at: null }],
    });
    expect(p).toMatchObject({ id: 'p1', price: 26000, sku: 'KP-1', parentId: 'p0', categoryId: 'c1', kind: 'goods', trackStock: false });
    expect(toProduct({ id: 'p2', name: 'X', kind: 'service', product_units: [] }).price).toBe(0);
  });
  it('shift: angka teks jadi angka, kolom kosong jadi undefined', () => {
    const s = toShift({ id: 's', cashier_id: 'e', opened_at: 't', opening_cash: '100000.00', status: 'open', closing_cash_counted: null, expected_cash: null, cash_variance: null });
    expect(s).toMatchObject({ openingCash: 100000, status: 'open' });
    expect(s.counted).toBeUndefined();
    expect(toShift({ id: 's', cashier_id: 'e', opened_at: 't', opening_cash: 0, status: 'closed', closing_cash_counted: 0, expected_cash: 50, cash_variance: -50 }).variance).toBe(-50);
  });
  it('pesanan: baris dibatalkan dan pembayaran gagal tidak ikut, urut sesuai sort', () => {
    const o = toOrder({
      id: 'o', number: 'CG/K1/261109/001', order_type: 'dine_in', cashier_id: 'e', status: 'paid', subtotal: '45000', discount_total: 0,
      service_charge: 0, tax_total: '4500', rounding: 0, total: '49500', paid_total: '49500', opened_at: 'a', closed_at: 'b',
      order_items: [
        { id: 'i2', product_id: 'p2', name: 'Air', qty: '1', unit_price: '5000', line_total: '5000', sort: 1, voided_at: null },
        { id: 'i1', product_id: 'p1', name: 'Kopi', qty: '2', unit_price: '20000', line_total: '40000', sort: 0, voided_at: null },
        { id: 'i3', product_id: 'p3', name: 'Batal', qty: '1', unit_price: '1000', line_total: '1000', sort: 2, voided_at: 'x' },
      ],
      payments: [
        { id: 'y2', method_id: 'm', amount: '9500', tendered: '10000', change_given: '500', status: 'succeeded', paid_at: '2026-11-09T05:02:00Z', payment_methods: { name: 'Tunai', kind: 'cash' } },
        { id: 'y1', method_id: 'm2', amount: '40000', tendered: null, change_given: '0', status: 'succeeded', paid_at: '2026-11-09T05:01:00Z', payment_methods: { name: 'Kartu', kind: 'noncash' } },
        { id: 'y3', method_id: 'm', amount: '1', status: 'failed', paid_at: null, payment_methods: { name: 'Tunai', kind: 'cash' } },
      ],
    });
    expect(o.items.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(o.payments.map((p) => p.id)).toEqual(['y1', 'y2']);
    expect(o.payments[1]).toMatchObject({ tendered: 10000, change: 500, methodName: 'Tunai', kind: 'cash' });
    expect(o).toMatchObject({ total: 49500, paidTotal: 49500, type: 'dine_in', status: 'paid' });
  });
});

describe('nomor pesanan', () => {
  it('urutan dibaca dari segmen terakhir dan tidak pernah mundur', () => {
    expect(seqOf('CG/K1/261109/007')).toBe(7);
    expect(seqOf('rusak')).toBe(0);
    expect(nextSeq([], 0)).toBe(1);
    expect(nextSeq(['CG/K1/261109/007', 'CG/K1/261109/003'], 0)).toBe(8);
    expect(nextSeq(['CG/K1/261109/002'], 5)).toBe(6);           // cache lokal lebih tinggi dari database
  });
});

describe('payload op order.upsert', () => {
  const items = [
    { id: 'i1', productId: 'p1', productUnitId: 'u1', name: 'Kopi', sku: 'KP-1', qty: 2, unitPrice: 20000 },
    { id: 'i2', productId: 'p2', productUnitId: 'u2', name: 'Air', sku: null, qty: 1, unitPrice: 5000, note: 'dingin' },
  ];
  const calc = computeOrder({
    orderType: 'dine_in', orderDiscount: 2000, roundingStep: 0, settings: { ...SETTINGS, serviceChargeOrderTypes: ['dine_in'] },
    items: items.map((i) => ({ id: i.id, qty: i.qty, unitPrice: i.unitPrice })), orderTaxes: [{ taxId: 't1', name: 'PB1', rate: 10 }],
  });
  const payload = buildOrderPayload({ id: 'o1', number: 'CG/K1/261109/001', orderType: 'dine_in', cashierId: 'e1', shiftId: 's1', openedAt: '2026-11-09T05:00:00Z', calc, orderDiscount: 2000, authorizedBy: 'e1', items });

  it('memenuhi aturan server: subtotal = jumlah baris dan total = rumus CHECK database', () => {
    const sumLines = (payload.items as { line_total: number }[]).reduce((a, i) => a + i.line_total, 0);
    expect(payload.subtotal).toBe(sumLines);
    expect(payload.total).toBe(payload.subtotal - payload.discount_total + payload.service_charge + payload.tax_total + payload.rounding);
    for (const i of payload.items as { qty: number; unit_price: number; extras_total: number; discount: number; line_total: number }[]) {
      expect(Math.abs(i.qty * i.unit_price + i.extras_total - i.discount - i.line_total)).toBeLessThanOrEqual(0.01);
    }
  });
  it('membawa diskon, baris pajak, dan nomor perangkat; versi dasar hanya untuk ubah', () => {
    expect(payload.discount_total).toBe(2000);
    expect(payload.discounts).toHaveLength(1);
    expect(payload.discounts[0]).toMatchObject({ source: 'manual', amount: 2000 });
    expect(payload.tax_lines).toEqual([expect.objectContaining({ tax_id: 't1', name: 'PB1', rate: 10 })]);
    expect('base_version' in payload).toBe(false);
    expect(buildOrderPayload({ id: 'o1', number: 'n', orderType: 'takeaway', cashierId: 'e', openedAt: 'x', calc, orderDiscount: 0, baseVersion: 3, items }).base_version).toBe(3);
    expect(buildOrderPayload({ id: 'o1', number: 'n', orderType: 'takeaway', cashierId: 'e', openedAt: 'x', calc: computeOrder({ orderType: 'takeaway', items: [{ id: 'i1', qty: 1, unitPrice: 1000 }], settings: SETTINGS }), orderDiscount: 0, items: [items[0]!] }).discounts).toEqual([]);
  });
  it('payloadFromStored hanya mengganti pembulatan dan total', () => {
    const raw = {
      id: 'o1', number: 'CG/K1/261109/001', order_type: 'dine_in', cashier_id: 'e1', shift_id: 's1', opened_at: 'a', version: 2,
      subtotal: '45000', discount_total: '2000', service_charge: '2150', tax_total: '4515', rounding: '0', total: '49665',
      order_items: [{ id: 'i1', product_id: 'p1', product_unit_id: 'u1', name: 'Kopi', qty: '2', unit_price: '20000', extras_total: '0', discount: '0', tax_amount: '0', line_total: '40000', sort: 0 }],
      order_discounts: [{ id: 'd1', source: 'manual', amount: '2000', points_used: 0 }],
      order_tax_lines: [{ tax_id: 't1', name: 'PB1', rate: '10', base_amount: '45150', amount: '4515' }],
    };
    const p = payloadFromStored(raw, 35);
    expect(p).toMatchObject({ base_version: 2, subtotal: 45000, discount_total: 2000, service_charge: 2150, tax_total: 4515, rounding: 35, total: 49700 });
    expect(p.items[0]).toMatchObject({ product_unit_id: 'u1', qty: 2, line_total: 40000 });
    expect(p.discounts[0]).toMatchObject({ id: 'd1', amount: 2000 });
    expect(p.tax_lines[0]).toMatchObject({ rate: 10, amount: 4515 });
  });
});

describe('ringkasan penjualan', () => {
  it('sama persis dengan hitungan data palsu', async () => {
    const at = new Date('2026-11-09T09:00:00Z');
    const fake = createFakeData({ now: () => at });
    const range = { from: '2026-11-08T17:00:00.000Z', to: '2026-11-09T17:00:00.000Z' };
    const expected = await fake.salesSummary(range);
    const paid = (await fake.listOrders({ status: 'paid' }));
    expect(paid.length).toBeGreaterThan(3);
    expect(summarizeSales(paid, 'Asia/Jakarta')).toEqual(expected);
  });
});
