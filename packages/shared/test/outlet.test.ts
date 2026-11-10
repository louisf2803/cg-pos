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

describe('kas kasir (S122)', () => {
  const base: OutletOptions = { serviceChargePct: 0, serviceChargeTaxable: false, serviceChargeOrderTypes: ['dine_in'], roundingCashStep: 0, roundingNoncashStep: 0, requireOpenShift: true, allowNegativeStock: true, receiptFooter: '' };
  it('batas dan modal awal boleh kosong', () => { expect(outletOptionsProblem(base)).toBeNull(); expect(outletOptionsProblem({ ...base, cashOutDailyLimit: null, defaultOpeningCash: null })).toBeNull(); });
  it('nol dan angka bulat sah', () => { expect(outletOptionsProblem({ ...base, cashOutDailyLimit: 0, defaultOpeningCash: 200000 })).toBeNull(); });
  it('negatif, pecahan, dan terlalu besar ditolak', () => {
    expect(outletOptionsProblem({ ...base, cashOutDailyLimit: -1 })).toMatch(/Batas kas keluar/);
    expect(outletOptionsProblem({ ...base, defaultOpeningCash: 10.5 })).toMatch(/Modal awal/);
    expect(outletOptionsProblem({ ...base, defaultOpeningCash: 2_000_000_000 })).toMatch(/Modal awal/);
  });
});

describe('tampilan struk (S123)', () => {
  const base: OutletOptions = { serviceChargePct: 0, serviceChargeTaxable: false, serviceChargeOrderTypes: ['dine_in'], roundingCashStep: 0, roundingNoncashStep: 0, requireOpenShift: true, allowNegativeStock: true, receiptFooter: '' };
  it('menolak teks kepala >200 karakter atau >4 baris, menerima yang sah', () => {
    expect(outletOptionsProblem({ ...base, receiptHeader: 'x'.repeat(201) })).toMatch(/200/);
    expect(outletOptionsProblem({ ...base, receiptHeader: 'a\nb\nc\nd\ne' })).toMatch(/4 baris/);
    expect(outletOptionsProblem({ ...base, receiptHeader: 'Buka 08.00-22.00\nWi-Fi: kopi123' })).toBeNull();
    expect(outletOptionsProblem(base)).toBeNull();
  });
  it('lapisan data demo menyimpan dan membaca kembali pilihan struk', async () => {
    const d = createFakeData();
    const before = await d.getOutletSettings();
    expect(before.options.receiptHeader).toBe('');
    expect(before.options.receiptShowCashier).toBe(true);
    await d.saveOutletOptions({ ...before.options, receiptHeader: '  Buka setiap hari  ', receiptShowCashier: false });
    const after = await d.getOutletSettings();
    expect(after.options.receiptHeader).toBe('Buka setiap hari');
    expect(after.options.receiptShowCashier).toBe(false);
    expect(after.options.receiptShowCustomer).toBe(true);
    const ctx = await d.getContext();
    expect(ctx.receiptHeader).toBe('Buka setiap hari');
    expect(ctx.receiptShowCashier).toBe(false);
  });
});
