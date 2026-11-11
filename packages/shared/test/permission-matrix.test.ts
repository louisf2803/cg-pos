import { describe, it, expect } from 'vitest';
import {
  availableDefaultPages,
  buildDefaultDashboardPerms,
  buildDefaultPosPerms,
  createBlankCustomRole,
  createDefaultRoleDefinitions,
  DASHBOARD_ACCESS_MODULES,
  duplicateRoleName,
  isBuiltInRole,
  mergeRoleOverrides,
  migrateRoleDefinition,
  POS_GRANULAR_PERMISSIONS,
  resolveRolePermissions,
  sanitizeDefaultPages,
  subFeatureKey,
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
    expect(resolved.dashboard.penjualan).toBe('none');
    expect(resolved.dashboard.produk).toBe('read');
    expect(resolved.dashboard.inventori).toBe('write');

    expect(resolved.pos.refund).toBe('approve');
    expect(resolved.pos.void_order).toBe('allow');
    expect(resolved.pos.open_cash_drawer).toBe('allow');
    expect(Object.keys(resolved.pos).length).toBe(POS_GRANULAR_PERMISSIONS.length);
  });

  it('mempertahankan peran bawaan dan memigrasikan struktur lama ke struktur A61 tanpa merusak data', () => {
    const legacySaved: RoleDefinition[] = [
      {
        id: 'cashier',
        name: 'Kasir Diubah',
        description: 'Kasir shift pagi',
        isBuiltIn: false,
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

    const merged = mergeRoleOverrides(legacySaved, SAMPLE_MODULES);
    expect(merged.length).toBe(4);
    const cashier = merged.find((r) => r.id === 'cashier')!;
    expect(cashier.name).toBe('Kasir');
    expect(cashier.isBuiltIn).toBe(true);
    expect(cashier.posModuleEnabled?.['pos-pengaturan']).toBe(true);
    expect(cashier.canAuthorizeRefund).toBe(false);

    const barista = merged.find((r) => r.id === 'barista')!;
    expect(barista.dashboardModuleEnabled?.penjualan).toBe(true);
    expect(barista.dashboardSubFeaturePerms?.[subFeatureKey('dash-overview', 'ringkasan')]?.lihat).toBe(true);
    expect(barista.dashboardSubFeaturePerms?.[subFeatureKey('dash-overview', 'ringkasan')]?.hapus).toBeNull();
  });

  it('hanya menampilkan halaman awal yang modul & fiturnya aktif dengan minimal satu akses LIHAT', () => {
    const blank = createBlankCustomRole(SAMPLE_MODULES, 'r-blank');
    expect(availableDefaultPages(blank, 'dashboard')).toEqual([]);
    // Pengaturan POS terkunci aktif secara bawaan
    expect(availableDefaultPages(blank, 'pos')).toEqual([]);

    // Aktifkan Akses POS -> Pengaturan POS punya akses LIHAT, maka muncul di pilihan halaman awal POS
    blank.posAppEnabled = true;
    const posPages = availableDefaultPages(blank, 'pos');
    expect(posPages.map((p) => p.pageId)).toContain('/pos/pengaturan');

    // Aktifkan modul Keuangan namun matikan akses LIHAT pada fitur Laporan Keuangan -> hanya Kas/Bank yang tampil
    blank.dashboardModuleEnabled!['keuangan'] = true;
    blank.dashboardFeatureEnabled!['keu-kas'] = true;
    blank.dashboardFeatureEnabled!['keu-akuntansi'] = true;
    blank.dashboardSubFeaturePerms![subFeatureKey('keu-kas', 'keu-kas-transaksi')] = {
      lihat: true,
      buat: false,
      ubah: false,
      hapus: null,
      void: false,
    };
    const dashPages = availableDefaultPages(blank, 'dashboard');
    expect(dashPages.map((p) => p.pageId)).toEqual(['/keuangan/kas']);

    // Bila halaman awal terlanjur diset ke halaman yang izin LIHAT-nya dicabut, sanitizeDefaultPages membersihkan otomatis
    const sanitized = sanitizeDefaultPages({
      ...blank,
      defaultDashboardPage: '/keuangan/laporan',
      defaultPosPage: '/pos/pengaturan',
    });
    expect(sanitized.defaultDashboardPage).toBeUndefined();
    expect(sanitized.defaultPosPage).toBe('/pos/pengaturan');
  });

  it('menyimpan flag otorisasi terpisah serta struktur fitur -> sub-fitur x aksi saat migrasi', () => {
    const migrated = migrateRoleDefinition(
      {
        id: 'spv',
        name: 'Supervisor Shift',
        baseRole: 'manager',
        canAuthorizeRefund: true,
        canAuthorizeVoid: false,
        canAuthorizeComplimentary: true,
      },
      SAMPLE_MODULES,
    );
    expect(migrated.canAuthorizeRefund).toBe(true);
    expect(migrated.canAuthorizeVoid).toBe(false);
    expect(migrated.canAuthorizeComplimentary).toBe(true);
    expect(DASHBOARD_ACCESS_MODULES.find((m) => m.id === 'penjualan')?.features.length).toBeGreaterThan(3);

    expect(buildDefaultDashboardPerms('owner', ['a']).a).toBe('write');
    expect(buildDefaultPosPerms('cashier').refund).toBe('approve');
  });
});
