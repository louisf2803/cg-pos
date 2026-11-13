import { describe, expect, it } from 'vitest';
import { createFakeData } from '../src/fake';

describe('A123: Outlet - Informasi Bisnis, Rekening, Grup, Multi-Outlet', () => {
  it('menyimpan dan membaca informasi bisnis, rekening bank, grup, dan logo outlet', async () => {
    const data = createFakeData();

    await data.saveOutletInfo({
      name: 'Kopi Kenangan Senopati',
      address: 'Jl. Senopati No. 45, Kebayoran Baru, Jakarta Selatan',
      phone: '081234567890',
      email: 'senopati@kopikenangan.id',
      taxIdNumber: '01.234.567.8-012.000',
      businessType: 'Kafe & Restoran',
      outletGroup: 'Jabodetabek Selatan',
      logoUrl: 'https://images.example.com/logo.png',
      bankName: 'BCA',
      bankAccountNumber: '8830123456',
      bankAccountName: 'PT Kopi Bersama',
    });

    const settings = await data.getOutletSettings();
    expect(settings.info.name).toBe('Kopi Kenangan Senopati');
    expect(settings.info.email).toBe('senopati@kopikenangan.id');
    expect(settings.info.taxIdNumber).toBe('01.234.567.8-012.000');
    expect(settings.info.businessType).toBe('Kafe & Restoran');
    expect(settings.info.outletGroup).toBe('Jabodetabek Selatan');
    expect(settings.info.logoUrl).toBe('https://images.example.com/logo.png');
    expect(settings.info.bankName).toBe('BCA');
    expect(settings.info.bankAccountNumber).toBe('8830123456');
    expect(settings.info.bankAccountName).toBe('PT Kopi Bersama');
  });

  it('mengelola daftar multi-outlet dan grup outlet', async () => {
    const data = createFakeData();
    const initial = await data.listOutlets();
    expect(initial.length).toBeGreaterThan(0);

    const created = await data.saveOutlet({
      code: 'BDG01',
      name: 'Outlet Bandung Riau',
      address: 'Jl. LLRE Martadinata No. 100, Bandung',
      phone: '0221234567',
      email: 'bandung@cgpos.id',
      outletGroup: 'Jawa Barat',
      bankName: 'Mandiri',
      bankAccountNumber: '131000123456',
      bankAccountName: 'PT Clean Room Bandung',
    });

    expect(created.code).toBe('BDG01');
    expect(created.outletGroup).toBe('Jawa Barat');

    const list = await data.listOutlets();
    expect(list.some((o) => o.code === 'BDG01')).toBe(true);

    const groups = await data.listOutletGroups();
    expect(groups).toContain('Jawa Barat');
  });
});
