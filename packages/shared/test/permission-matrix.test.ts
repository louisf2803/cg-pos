import { describe, it, expect } from 'vitest';
import {
  buildDefaultDashboardPerms,
  buildDefaultPosPerms,
  createDefaultRoleDefinitions,
  duplicateRoleName,
  isBuiltInRole,
  mergeRoleOverrides,
  POS_GRANULAR_PERMISSIONS,
  resolveRolePermissions,
  validateRoleName,
  type RoleDefinition,
} from '../src/permission-matrix';

const SAMPLE_MODULES = ['penjualan', 'produk', 'inventori', 'keuangan', 'pengaturan'];

describe('permission-matrix', () => {
  it('mengenali peran bawaan dengan benar', () => {
    expect(isBuiltInRole('owner')).toBe(true);
    expect(isBuiltInRole('MANAGER')).toBe(true);
    expect(isBuiltInRole('cashier')).toBe(true);
    expect(isBuiltInRole('barista')).toBe(false);
    expect(isBuiltInRole({ id: 'custom-1', isBuiltIn: false })).toBe(false);
    expect(isBuiltInRole({ id: 'custom-2', isBuiltIn: true })).toBe(true);
  });

  it('memvalidasi nama peran unik, panjang maksimal, dan larangan ubah nama peran bawaan', () => {
    const defaults = createDefaultRoleDefinitions(SAMPLE_MODULES);

    expect(validateRoleName('', defaults)).toBe('Nama peran wajib diisi.');
    expect(validateRoleName('   ', defaults)).toBe('Nama peran wajib diisi.');
    expect(validateRoleName('A'.repeat(51), defaults)).toBe('Nama peran maksimal 50 karakter.');
    expect(validateRoleName('kasir', defaults)).toContain('sudah digunakan');
    expect(validateRoleName('Manajer', defaults, 'manager')).toBeNull();
    expect(validateRoleName('Manajer Toko', defaults, 'manager')).toContain('tidak dapat diubah');
    expect(validateRoleName('Kepala Bar', defaults)).toBeNull();
  });

  it('menghasilkan nama salinan unik saat duplikasi', () => {
    const roles = [{ name: 'Kasir' }, { name: 'Kasir (Salinan)' }];
    expect(duplicateRoleName('Kasir', roles)).toBe('Kasir (Salinan 2)');
    expect(duplicateRoleName('Manajer', roles)).toBe('Manajer (Salinan)');
  });

  it('menggabungkan izin bawaan dengan override per modul dan per aksi POS', () => {
    const custom: RoleDefinition = {
      id: 'supervisor-bar',
      name: 'Supervisor Bar',
      description: 'Pengawas shift sore',
      isBuiltIn: false,
      baseRole: 'cashier',
      dashboardPerms: {
        produk: 'read',
        inventori: 'write',
      },
      posPerms: {
        void_order: 'allow',
        open_cash_drawer: 'allow',
      },
    };

    const resolved = resolveRolePermissions(custom, SAMPLE_MODULES);
    // Default cashier adalah none untuk dashboard, override berlaku untuk produk & inventori
    expect(resolved.dashboard.penjualan).toBe('none');
    expect(resolved.dashboard.produk).toBe('read');
    expect(resolved.dashboard.inventori).toBe('write');

    // Default cashier untuk refund adalah approve, override berlaku untuk void_order & open_cash_drawer
    expect(resolved.pos.refund).toBe('approve');
    expect(resolved.pos.void_order).toBe('allow');
    expect(resolved.pos.open_cash_drawer).toBe('allow');
    expect(Object.keys(resolved.pos).length).toBe(POS_GRANULAR_PERMISSIONS.length);
  });

  it('mempertahankan peran bawaan saat menggabungkan dengan data tersimpan yang parsial atau rusak', () => {
    const partialSaved: RoleDefinition[] = [
      {
        id: 'cashier',
        name: 'Kasir Diubah', // nama bawaan tidak boleh tergantikan
        description: 'Kasir shift pagi',
        isBuiltIn: false, // tetap dianggap bawaan
        baseRole: 'cashier',
        dashboardPerms: { penjualan: 'read' },
        posPerms: { manual_discount: 'deny' },
      },
      {
        id: 'barista',
        name: 'Barista',
        description: 'Racik minuman',
        isBuiltIn: false,
        baseRole: 'cashier',
        dashboardPerms: { produk: 'read' },
        posPerms: {},
      },
    ];

    const merged = mergeRoleOverrides(partialSaved, SAMPLE_MODULES);
    expect(merged.length).toBe(4); // owner, manager, cashier + barista
    const cashier = merged.find((r) => r.id === 'cashier')!;
    expect(cashier.name).toBe('Kasir');
    expect(cashier.isBuiltIn).toBe(true);
    expect(cashier.description).toBe('Kasir shift pagi');
    expect(cashier.dashboardPerms.penjualan).toBe('read');
    expect(cashier.posPerms.manual_discount).toBe('deny');

    const barista = merged.find((r) => r.id === 'barista')!;
    expect(barista.isBuiltIn).toBe(false);
    expect(barista.dashboardPerms.produk).toBe('read');
    expect(barista.dashboardPerms.keuangan).toBe('none');
  });

  it('menyusun izin bawaan per baseRole secara konsisten', () => {
    const ownerDash = buildDefaultDashboardPerms('owner', SAMPLE_MODULES);
    const managerDash = buildDefaultDashboardPerms('manager', SAMPLE_MODULES);
    const cashierPos = buildDefaultPosPerms('cashier');

    expect(ownerDash.keuangan).toBe('write');
    expect(managerDash.keuangan).toBe('read');
    expect(managerDash.penjualan).toBe('write');
    expect(cashierPos.void_order).toBe('approve');
    expect(cashierPos.device_settings).toBe('deny');
  });
});

