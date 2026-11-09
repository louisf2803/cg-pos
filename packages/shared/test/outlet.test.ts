import { describe, expect, it } from 'vitest';
import { createFakeData, outletInfoProblem, outletOptionsProblem, type OutletOptions } from '../src';

const ok: OutletOptions = { serviceChargePct: 5, serviceChargeTaxable: false, serviceChargeOrderTypes: ['dine_in'], roundingCashStep: 100, roundingNoncashStep: 0, requireOpenShift: true, allowNegativeStock: true, receiptFooter: '' };

describe('pengaturan outlet', () => {
  it('validasi opsi', () => {
    expect(outletOptionsProblem(ok)).toBeNull();
    expect(outletOptionsProblem({ ...ok, serviceChargePct: 101 })).toMatch(/0 dan 100/);
    expect(outletOptionsProblem({ ...ok, serviceChargePct: NaN })).toMatch(/0 dan 100/);
    expect(outletOptionsProblem({ ...ok, serviceChargeOrderTypes: [] })).toMatch(/minimal satu/);
    expect(outletOptionsProblem({ ...ok, serviceChargePct: 0, serviceChargeOrderTypes: [] })).toBeNull();
    expect(outletOptionsProblem({ ...ok, roundingCashStep: -1 })).toMatch(/Pembulatan/);
    expect(outletOptionsProblem({ ...ok, roundingCashStep: 50.5 })).toMatch(/Pembulatan/);
    expect(outletOptionsProblem({ ...ok, receiptFooter: 'x'.repeat(301) })).toMatch(/300/);
  });
  it('validasi info', () => {
    expect(outletInfoProblem({ name: ' ', address: '', phone: '' })).toMatch(/wajib/);
    expect(outletInfoProblem({ name: 'A', address: '', phone: 'abc' })).toMatch(/telepon/);
    expect(outletInfoProblem({ name: 'A', address: 'Jl. X', phone: '+62 31 555-123' })).toBeNull();
  });
  it('fake: simpan dan baca ulang; biaya layanan mengubah total pesanan baru', async () => {
    const d = createFakeData({ now: () => new Date('2026-11-09T05:00:00Z') }); d.reset();
    await d.saveOutletInfo({ name: ' Coffee Ground Darmo ', address: 'Jl. Darmo 1', phone: '031 555' });
    await d.saveOutletOptions({ ...ok, serviceChargePct: 10, receiptFooter: ' Terima kasih ' });
    const s = await d.getOutletSettings();
    expect(s.info).toMatchObject({ name: 'Coffee Ground Darmo', address: 'Jl. Darmo 1', phone: '031 555' });
    expect(s.options.serviceChargePct).toBe(10);
    expect(s.options.receiptFooter).toBe('Terima kasih');
    expect((await d.getContext()).outletName).toBe('Coffee Ground Darmo');
    await expect(d.saveOutletOptions({ ...ok, serviceChargePct: -1 })).rejects.toThrow(/0 dan 100/);
    d.reset();
    expect((await d.getOutletSettings()).info.name).toBe('Outlet Contoh');
  });
});
