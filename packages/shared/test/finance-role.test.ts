import { describe, expect, it } from 'vitest';
import { DASHBOARD_ACCESS_MODULES, createFinanceRoleTemplate, subFeatureKey } from '../src';

describe('templat peran Finance', () => {
  const ids = DASHBOARD_ACCESS_MODULES.map((m) => m.id);
  const r = createFinanceRoleTemplate(ids);
  it('keuangan penuh, penjualan dan karyawan hanya lihat, lainnya mati', () => {
    expect(r.name).toBe('Finance');
    expect(r.isBuiltIn).toBe(false);
    expect(r.dashboardModuleEnabled!.keuangan).toBe(true);
    expect(r.dashboardModuleEnabled!.produk ?? false).toBe(false);
    const keu = DASHBOARD_ACCESS_MODULES.find((m) => m.id === 'keuangan')!.features[0]!;
    const sub = keu.subFeatures[0]!;
    expect(r.dashboardSubFeaturePerms![subFeatureKey(keu.id, sub.id)]!.lihat).toBe(true);
    expect(r.dashboardPerms.keuangan).toBe('write');
    expect(r.dashboardPerms.karyawan).toBe('read');
  });
  it('tanpa akses kasir', () => {
    expect(r.posAppEnabled).toBe(false);
    expect(Object.values(r.posModuleEnabled!).every((v) => v === false)).toBe(true);
  });
});
