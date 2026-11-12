import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeOrder, extrasLineTotal, newId, roundToStep } from '../src';
import { buildOrderPayload, buildRefundPayload, payloadFromStored } from '../src/supabase-map';
import { refundAmounts } from '../src/refund';

/**
 * Tes kontrak: menulis payload op yang dibuat kode klien ke packages/db/tests/fixtures/payloads.json.
 * tests/16_payload_contract.sql menjalankannya lewat pos.sync_push di database, jadi bila klien dan
 * database berbeda paham soal bentuk/angka payload, tes itu gagal (bukan baru ketahuan di toko).
 * Penanda "@nama" diganti oleh SQL dengan id fixture.
 */
const SETTINGS = {
  taxCalc: 'after_discount', taxMode: 'per_order', serviceChargePct: 5, serviceChargeTaxable: true,
  serviceChargeOrderTypes: ['dine_in'], roundingCashStep: 100, roundingNoncashStep: 0, requireOpenShift: true, allowNegativeStock: true,
} as const;

describe('harga dasar dan referensi diskon (migrasi 0034)', () => {
  const calc = computeOrder({
    orderType: 'takeaway', orderDiscount: 1000, roundingStep: 0, settings: SETTINGS,
    items: [{ id: 'i1', qty: 2, unitPrice: 20000 }], orderTaxes: [],
  });
  const base = { id: 'o1', number: 'OUT1/A/261112/001', orderType: 'takeaway' as const, cashierId: 'e1', openedAt: '2026-11-12T01:00:00.000Z', calc, orderDiscount: 1000, authorizedBy: 'e1' };
  it('mengirim base_price hanya untuk baris yang diubah dan reference hanya bila diisi', () => {
    const p = buildOrderPayload({
      ...base,
      items: [{ id: 'i1', productId: 'p1', productUnitId: 'u1', name: 'Kopi', qty: 2, unitPrice: 20000, basePrice: 22000 }, { id: 'i2', productId: 'p2', productUnitId: 'u2', name: 'Roti', qty: 1, unitPrice: 5000 }],
      discounts: [{ id: 'd1', source: 'coupon', couponId: 'c1', label: 'Kupon', amount: 1000, reference: 'CPN-001' }],
    });
    expect(p.items[0].base_price).toBe(22000);
    expect('base_price' in p.items[1]).toBe(false);
    expect(p.discounts[0].reference).toBe('CPN-001');
    const q = buildOrderPayload({ ...base, items: [{ id: 'i1', productId: 'p1', productUnitId: 'u1', name: 'Kopi', qty: 2, unitPrice: 20000 }], discounts: [{ id: 'd1', source: 'coupon', label: 'Kupon', amount: 1000 }] });
    expect('reference' in q.discounts[0]).toBe(false);
  });
  it('payloadFromStored mempertahankan base_price dan reference agar tidak hilang saat upsert ulang', () => {
    const p = buildOrderPayload({
      ...base,
      items: [{ id: 'i1', productId: 'p1', productUnitId: 'u1', name: 'Kopi', qty: 2, unitPrice: 20000, basePrice: 22000 }],
      discounts: [{ id: 'd1', source: 'coupon', couponId: 'c1', label: 'Kupon', amount: 1000, reference: 'CPN-001' }],
    });
    const stored = { ...p, version: 1, order_items: p.items, order_discounts: p.discounts, order_tax_lines: p.tax_lines };
    const again = payloadFromStored(stored, 0);
    expect(again.items[0].base_price).toBe(22000);
    expect(again.discounts[0].reference).toBe('CPN-001');
  });
});

describe('payload klien -> database', () => {
  it('menulis fixture untuk tes SQL', () => {
    const shiftId = newId();
    const items = [
      { id: newId(), productId: '@kopi', productUnitId: '@kopi_pu', name: 'Kopi Susu', sku: null, qty: 2, unitPrice: 20000 },
      { id: newId(), productId: '@air', productUnitId: '@air_pu', name: 'Air Mineral', sku: null, qty: 1, unitPrice: 5000, note: 'dingin' },
    ];
    const calc = computeOrder({
      orderType: 'dine_in', orderDiscount: 2000, roundingStep: 0, settings: SETTINGS,
      items: items.map((i) => ({ id: i.id, qty: i.qty, unitPrice: i.unitPrice })), orderTaxes: [{ taxId: null as unknown as string, name: 'PB1', rate: 10 }],
    });
    expect(calc.total).toBe(49665);

    const base = { orderType: 'dine_in' as const, cashierId: '@emp', shiftId, openedAt: '2026-11-10T03:00:00.000Z', calc, orderDiscount: 2000, authorizedBy: '@emp' };
    const idA = newId();
    const idB = newId();
    // setiap pesanan punya id baris sendiri (calc dihitung per id baris, jadi petakan ulang)
    const withFreshIds = () => {
      const fresh = items.map((i) => ({ ...i, id: newId() }));
      const remap = new Map(items.map((i, k) => [i.id, fresh[k]!.id]));
      return { items: fresh, calc: { ...calc, lines: calc.lines.map((l) => ({ ...l, id: remap.get(l.id)! })) } };
    };
    const a = withFreshIds();
    const b = withFreshIds();
    const payloadA = buildOrderPayload({ ...base, ...a, id: idA, number: 'OUT1/A/261110/101' });
    const payloadB = buildOrderPayload({ ...base, ...b, id: idB, number: 'OUT1/A/261110/102' });
    // pembayaran tunai pertama menentukan pembulatan: upsert ulang dari baris tersimpan (version 1)
    const stored = { ...payloadB, version: 1, order_items: payloadB.items, order_discounts: payloadB.discounts, order_tax_lines: payloadB.tax_lines };
    const step = 100;
    const rounded = roundToStep(calc.total, step);
    const payloadB2 = payloadFromStored(stored, rounded - calc.total);
    expect(payloadB2.total).toBe(49700);

    const idC = newId();
    // pesanan C membawa Ekstra: 2 kopi masing-masing + Extra shot 5000 (dibatalkan di akhir, jadi tidak mengubah kas)
    const shot = [{ optionId: '@opt_shot', name: 'Extra shot', price: 5000 }];
    const cItems = items.map((i, k) => ({ ...i, id: newId(), ...(k === 0 ? { extras: shot } : {}) }));
    const calcC = computeOrder({
      orderType: 'dine_in', orderDiscount: 2000, roundingStep: 0, settings: SETTINGS,
      items: cItems.map((i) => ({ id: i.id, qty: i.qty, unitPrice: i.unitPrice, extrasTotal: extrasLineTotal(i.qty, 'extras' in i ? i.extras : undefined) })), orderTaxes: [{ taxId: null as unknown as string, name: 'PB1', rate: 10 }],
    });
    const payloadC = buildOrderPayload({ ...base, items: cItems, calc: calcC, id: idC, number: 'OUT1/A/261110/103' });
    expect(payloadC.items[0].extras_total).toBe(10000);
    // pesanan D: harga sudah termasuk pajak (mode inklusif). Subtotal bersih 36364 + pajak 3636 = 40000; dibatalkan agar kas tidak berubah
    const idD = newId();
    const dItems = [{ ...items[0]!, id: newId() }];
    const calcD = computeOrder({
      orderType: 'dine_in', orderDiscount: 0, roundingStep: 0, settings: { ...SETTINGS, taxCalc: 'inclusive', serviceChargePct: 0 },
      items: dItems.map((i) => ({ id: i.id, qty: i.qty, unitPrice: i.unitPrice })), orderTaxes: [{ taxId: null as unknown as string, name: 'PB1', rate: 10 }],
    });
    expect(calcD).toMatchObject({ subtotal: 36364, taxTotal: 3636, total: 40000, grossTotal: 40000 });
    const payloadD = buildOrderPayload({ ...base, orderDiscount: 0, items: dItems, calc: calcD, id: idD, number: 'OUT1/A/261110/104' });
    const op = (type: string, entityId: string, payload: unknown) => ({ op_id: newId(), type, entity_id: entityId, payload });
    // refund 1 dari 2 kopi pada pesanan A (tunai): nilai dihitung oleh kode klien, kas harapan berkurang sebesar itu
    const orderA = { id: idA, status: 'paid', total: 49665, paidTotal: 49665, items: a.items.map((i) => ({ id: i.id, qty: i.qty, unitPrice: i.unitPrice, lineTotal: a.calc.lines.find((l) => l.id === i.id)!.lineTotal })) } as never;
    const refundLines = refundAmounts(orderA, [{ orderItemId: a.items[0]!.id, qty: 1 }]);
    const refundTotal = refundLines.reduce((x, l) => x + l.amount, 0);
    expect(refundTotal).toBeGreaterThan(0);
    const refundId = newId();
    const refundPayload = buildRefundPayload({ id: refundId, orderId: idA, shiftId, number: 'R1-OUT1/A/261110/101', methodId: '@cash', restock: false, authorizedBy: '@emp', reason: 'salah pesan', items: refundLines });
    const payA = newId();
    const payB = newId();
    const fixture = {
      ids: { orderA: idA, orderB: idB, orderC: idC, orderD: idD, shift: shiftId, refund: refundId },
      // kas tunai = modal 100000 + 49665 + 49700; dihitung 199000 -> selisih -365
      expected: { totalA: 49665, totalB: 49700, roundingB: 35, refundTotal, expectedCash: 199365 - refundTotal, counted: 199000 - refundTotal, variance: -365 + (refundTotal - refundTotal) },
      ops: [
        op('shift.open', shiftId, { id: shiftId, cashier_id: '@emp', opened_at: '2026-11-10T02:00:00.000Z', opening_cash: 100000 }),
        op('order.upsert', idA, payloadA),
        op('order.upsert', idB, payloadB),
        op('order.upsert', idB, payloadB2),
        op('payment.add', payA, { id: payA, order_id: idA, method_id: '@cash', shift_id: shiftId, amount: 49665, tendered: 50000, paid_at: '2026-11-10T03:05:00.000Z', created_by: '@emp' }),
        op('payment.add', payB, { id: payB, order_id: idB, method_id: '@cash', shift_id: shiftId, amount: 49700, tendered: 50000, paid_at: '2026-11-10T03:06:00.000Z', created_by: '@emp' }),
        op('refund.add', refundId, refundPayload),
        op('order.upsert', idC, payloadC),
        op('order.upsert', idD, payloadD),
        op('order.void', idD, { order_id: idD, authorized_by: '@emp', auth_method: 'pin', reason: 'uji inklusif', voided_by: '@emp', voided_at: '2026-11-10T03:11:00.000Z' }),
        op('order.void', idC, { order_id: idC, authorized_by: '@emp', auth_method: 'pin', reason: 'salah input', voided_by: '@emp', voided_at: '2026-11-10T03:10:00.000Z' }),
        op('shift.close', shiftId, { id: shiftId, closed_by: '@emp', counted: 199000 - refundTotal, closed_at: '2026-11-10T09:00:00.000Z' }),
      ],
    };
    const out = resolve(__dirname, '../../db/tests/fixtures/payloads.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n');
  });
});
