import { describe, expect, it } from 'vitest';
import { ORDER_TYPES, createFakeData, orderTypeLabel, isInclusiveOrder, newId, taxDisplay, taxSettingsProblem } from '../src';

const mk = () => { const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') }); d.reset(); return d; };
const items = [{ id: newId(), productId: 'p1', name: 'Kopi', qty: 2, unitPrice: 20000 }];

describe('pengaturan pajak', () => {
  it('validasi', () => {
    const t = { enabled: true, name: 'PB1', rate: 10, inclusive: false };
    expect(taxSettingsProblem(t)).toBeNull();
    expect(taxSettingsProblem({ ...t, name: ' ' })).toMatch(/Nama/);
    expect(taxSettingsProblem({ ...t, rate: 101 })).toMatch(/0 dan 100/);
    expect(taxSettingsProblem({ ...t, rate: NaN })).toMatch(/0 dan 100/);
    expect(taxSettingsProblem({ ...t, rate: 0 })).toMatch(/matikan/);
    expect(taxSettingsProblem({ ...t, enabled: false, rate: 0 })).toBeNull();
  });

  it('mati: pesanan tanpa pajak; nyala eksklusif: pajak di atas; nyala inklusif: total = harga menu', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    await d.saveTaxSettings({ enabled: false, name: 'PB1', rate: 10, inclusive: false });
    expect((await d.getTaxSettings()).enabled).toBe(false);
    const off = await d.saveOrder({ id: newId(), type: 'takeaway', items: [{ ...items[0]!, id: newId() }] }, 'e-sari');
    expect(off.taxTotal).toBe(0); expect(off.total).toBe(40000);

    await d.saveTaxSettings({ enabled: true, name: 'PB1', rate: 10, inclusive: false });
    const ex = await d.saveOrder({ id: newId(), type: 'takeaway', items: [{ ...items[0]!, id: newId() }] }, 'e-sari');
    expect(ex.taxTotal).toBe(4000); expect(ex.total).toBe(44000);
    expect(isInclusiveOrder(ex)).toBe(false);

    await d.saveTaxSettings({ enabled: true, name: 'PB1', rate: 10, inclusive: true });
    expect(await d.getTaxSettings()).toEqual({ enabled: true, name: 'PB1', rate: 10, inclusive: true });
    const inc = await d.saveOrder({ id: newId(), type: 'takeaway', items: [{ ...items[0]!, id: newId() }] }, 'e-sari');
    expect(inc).toMatchObject({ subtotal: 36364, taxTotal: 3636, total: 40000 });
    expect(isInclusiveOrder(inc)).toBe(true);
    expect(taxDisplay(inc)).toEqual({ inclusive: true, subtotal: 40000, discount: 0, tax: 3636 });

    // kembali ke eksklusif memulihkan perilaku lama
    await d.saveTaxSettings({ enabled: true, name: 'PB1', rate: 10, inclusive: false });
    expect((await d.getTaxSettings()).inclusive).toBe(false);
  });

  it('taxDisplay: potongan inklusif ditampilkan dalam harga menu', () => {
    const o = { items: [{ qty: 1, unitPrice: 11000 }], subtotal: 10000, discountTotal: 1000, taxTotal: 900 };
    expect(taxDisplay(o)).toEqual({ inclusive: true, subtotal: 11000, discount: 1100, tax: 900 });
    expect(taxDisplay({ gross: 11000, subtotal: 10000, discountTotal: 1000, taxTotal: 900 })).toEqual({ inclusive: true, subtotal: 11000, discount: 1100, tax: 900 });
    // eksklusif: apa adanya
    expect(taxDisplay({ items: [{ qty: 2, unitPrice: 20000 }], subtotal: 40000, discountTotal: 0, taxTotal: 4000 })).toEqual({ inclusive: false, subtotal: 40000, discount: 0, tax: 4000 });
    // ekstra ikut dihitung sebagai harga menu
    expect(isInclusiveOrder({ items: [{ qty: 2, unitPrice: 20000, extras: [{ price: 5000 }] }], subtotal: 40909, taxTotal: 4091 })).toBe(true);
  });
});

describe('jenis order', () => {
  it('empat jenis, label konsisten di pengaturan dan laporan', () => {
    expect(ORDER_TYPES.map((t) => t.id)).toEqual(['dine_in', 'takeaway', 'delivery', 'service']);
    for (const t of ORDER_TYPES) expect(orderTypeLabel(t.id)).toBe(t.label);
  });
  it('delivery dan jasa tersimpan dengan nama/keterangan', async () => {
    const d = mk();
    await d.openShift({ id: newId(), cashierId: 'e-sari', openingCash: 0 });
    for (const type of ['delivery', 'service'] as const) {
      const o = await d.saveOrder({ id: newId(), type, label: 'Pak Dedi', items: [{ ...items[0]!, id: newId() }] }, 'e-sari');
      expect(o).toMatchObject({ type, label: 'Pak Dedi' });
    }
  });
});
