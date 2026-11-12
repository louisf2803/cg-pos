import { describe, expect, it } from 'vitest';
import {
  createBlankCustomRole, createDefaultRoleDefinitions, createFakeData, DASHBOARD_ACCESS_MODULES, DataError, isRoleUuid, mergeRoleOverrides,
  POS_ACCESS_MODULES, roleFromRows, roleSaveProblem, roleToRpcArgs, subFeatureKey, type RoleDefinition,
} from '../src';

const DASH_IDS = DASHBOARD_ACCESS_MODULES.map((m) => m.id);
const ORG = '11111111-1111-4111-8111-111111111111';
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof DataError ? e.code : 'galat'));

/** Meniru apa yang dikembalikan PostgREST dari tabel 0033 untuk argumen RPC save_role_permissions. */
function serverRows(args: Record<string, unknown>, id: string) {
  const mod = (xs: unknown) => (xs as { moduleId: string; enabled: boolean }[]).map((x) => ({ role_id: id, module_id: x.moduleId, enabled: x.enabled }));
  const feat = (xs: unknown) => (xs as Record<string, unknown>[]).map((x) => ({ role_id: id, module_id: x.moduleId, feature_id: x.featureId, sub_feature_id: x.subFeatureId, can_view: x.canView, can_create: x.canCreate, can_edit: x.canEdit, can_delete: x.canDelete, can_void: x.canVoid }));
  return {
    role: {
      id, org_id: ORG, name: args.p_name, description: args.p_description, is_built_in: false, base_role: args.p_base_role, owner_app_access: args.p_owner_app_access,
      pos_app_enabled: args.p_pos_app_enabled, default_dashboard_page: args.p_default_dashboard_page, default_pos_page: args.p_default_pos_page,
      can_authorize_refund: args.p_can_authorize_refund, can_authorize_void: args.p_can_authorize_void, can_authorize_complimentary: args.p_can_authorize_complimentary,
      dashboard_perms_legacy: args.p_dashboard_perms_legacy, pos_perms_legacy: args.p_pos_perms_legacy,
    },
    dashModules: mod(args.p_dashboard_modules), posModules: mod(args.p_pos_modules), dashFeatures: feat(args.p_dashboard_features), posFeatures: feat(args.p_pos_features),
  };
}

function sampleRole(): RoleDefinition {
  const r = createBlankCustomRole(DASH_IDS, 'role-lokal-1');
  r.name = '  Supervisor Gudang  '; r.description = 'Mengawasi stok'; r.baseRole = 'manager'; r.ownerAppAccess = true; r.posAppEnabled = true;
  r.canAuthorizeRefund = true; r.canAuthorizeVoid = false; r.canAuthorizeComplimentary = true;
  r.defaultDashboardPage = '/inventori'; r.defaultPosPage = '/pos';
  // nyalakan sebagian modul, fitur, dan aksi di kedua sisi
  const dm = DASHBOARD_ACCESS_MODULES[0]!, dFeat = dm.features[0]!, dSub = dFeat.subFeatures[0]!;
  r.dashboardModuleEnabled![dm.id] = true; r.dashboardFeatureEnabled![dFeat.id] = true;
  r.dashboardSubFeaturePerms![subFeatureKey(dFeat.id, dSub.id)] = { ...r.dashboardSubFeaturePerms![subFeatureKey(dFeat.id, dSub.id)]!, lihat: true, buat: dSub.supportedActions.includes('buat') ? true : null, ubah: dSub.supportedActions.includes('ubah') ? true : null };
  const pm = POS_ACCESS_MODULES[POS_ACCESS_MODULES.length - 1]!, pFeat = pm.features[0]!, pSub = pFeat.subFeatures[0]!;
  r.posModuleEnabled![pm.id] = true; r.posFeatureEnabled![pFeat.id] = true;
  r.posSubFeaturePerms![subFeatureKey(pFeat.id, pSub.id)] = { ...r.posSubFeaturePerms![subFeatureKey(pFeat.id, pSub.id)]!, lihat: true };
  r.dashboardPerms = { ...r.dashboardPerms, [DASH_IDS[0]!]: 'write' };
  return r;
}

describe('peran kustom: pemetaan ke tabel 0033', () => {
  it('bolak-balik tanpa kehilangan data, termasuk aksi yang tidak didukung (null)', () => {
    const role = sampleRole();
    const args = roleToRpcArgs(role, ORG);
    const id = '22222222-2222-4222-8222-222222222222';
    const back = roleFromRows(serverRows(args, id));
    expect(back.id).toBe(id);
    expect(back).toMatchObject({
      name: 'Supervisor Gudang', description: 'Mengawasi stok', isBuiltIn: false, baseRole: 'manager', ownerAppAccess: true, posAppEnabled: true,
      canAuthorizeRefund: true, canAuthorizeVoid: false, canAuthorizeComplimentary: true, defaultDashboardPage: '/inventori', defaultPosPage: '/pos',
    });
    expect(back.dashboardModuleEnabled).toEqual(role.dashboardModuleEnabled);
    expect(back.posModuleEnabled).toEqual(role.posModuleEnabled);
    expect(back.dashboardFeatureEnabled).toEqual(role.dashboardFeatureEnabled);
    expect(back.posFeatureEnabled).toEqual(role.posFeatureEnabled);
    expect(back.dashboardSubFeaturePerms).toEqual(role.dashboardSubFeaturePerms);
    expect(back.posSubFeaturePerms).toEqual(role.posSubFeaturePerms);
    expect(back.dashboardPerms).toEqual(role.dashboardPerms);
  });
  it('id klien non-UUID menjadi p_id null (peran baru); UUID dipertahankan', () => {
    const r = sampleRole();
    expect(roleToRpcArgs(r, ORG).p_id).toBeNull();
    expect(roleToRpcArgs({ ...r, id: '33333333-3333-4333-8333-333333333333' }, ORG).p_id).toBe('33333333-3333-4333-8333-333333333333');
    expect(isRoleUuid('owner')).toBe(false);
    expect(isRoleUuid('')).toBe(false);
  });
  it('baris sub-fitur yang tidak ada lagi di katalog diabaikan saat memuat', () => {
    const rows = serverRows(roleToRpcArgs(sampleRole(), ORG), '22222222-2222-4222-8222-222222222222');
    rows.dashFeatures.push({ role_id: 'x', module_id: 'modul-lama', feature_id: 'fitur-lama', sub_feature_id: 'sub-lama', can_view: true, can_create: true, can_edit: true, can_delete: true, can_void: true });
    const back = roleFromRows(rows);
    expect(Object.keys(back.dashboardSubFeaturePerms!).some((k) => k.includes('fitur-lama'))).toBe(false);
  });
  it('validasi simpan: bawaan ditolak, nama wajib, batas panjang, peran dasar sah', () => {
    expect(roleSaveProblem(sampleRole())).toBeNull();
    expect(roleSaveProblem({ ...sampleRole(), isBuiltIn: true })).toMatch(/bawaan/i);
    expect(roleSaveProblem({ ...sampleRole(), name: '   ' })).toMatch(/wajib/i);
    expect(roleSaveProblem({ ...sampleRole(), name: 'x'.repeat(61) })).toMatch(/60/);
    expect(roleSaveProblem({ ...sampleRole(), description: 'x'.repeat(301) })).toMatch(/300/);
    expect(roleSaveProblem({ ...sampleRole(), baseRole: 'kitchen' as never })).toMatch(/dasar/i);
  });
  it('hasil digabung dengan peran bawaan lewat mergeRoleOverrides', () => {
    const custom = roleFromRows(serverRows(roleToRpcArgs(sampleRole(), ORG), '22222222-2222-4222-8222-222222222222'));
    const merged = mergeRoleOverrides([...createDefaultRoleDefinitions(DASH_IDS), custom], DASH_IDS);
    expect(merged.map((r) => r.id)).toEqual(['owner', 'manager', 'cashier', custom.id]);
    expect(merged.find((r) => r.id === custom.id)!.name).toBe('Supervisor Gudang');
  });
});

describe('peran kustom di data demo', () => {
  it('menyimpan, mengubah, mendaftar, dan menghapus; nama ganda dan peran bawaan ditolak', async () => {
    const d = createFakeData();
    expect(await d.listRoles()).toEqual([]);
    const saved = await d.saveRolePermissions({ ...sampleRole(), id: '' });
    expect(saved.id).not.toBe('');
    expect(saved.name).toBe('Supervisor Gudang');
    expect((await d.listRoles()).map((r) => r.id)).toEqual([saved.id]);
    const changed = await d.saveRolePermissions({ ...saved, description: 'Diubah' });
    expect(changed.id).toBe(saved.id);
    expect((await d.listRoles())).toHaveLength(1);
    expect((await d.listRoles())[0]!.description).toBe('Diubah');
    expect(await code(d.saveRolePermissions({ ...sampleRole(), id: 'lain', name: 'supervisor gudang' }))).toBe('invalid');
    expect(await code(d.saveRolePermissions({ ...sampleRole(), id: 'owner', isBuiltIn: true }))).toBe('forbidden');
    expect(await code(d.saveRolePermissions({ ...sampleRole(), id: 'baru', name: '' }))).toBe('invalid');
    expect(await code(d.deleteRole('owner'))).toBe('forbidden');
    await d.deleteRole(saved.id);
    expect(await d.listRoles()).toEqual([]);
    expect(await code(d.deleteRole(saved.id))).toBe('not_found');
  });
});
