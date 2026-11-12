import {
  buildSubFeatureActionSet, DASHBOARD_ACCESS_MODULES, POS_ACCESS_MODULES, subFeatureKey,
  type AccessModuleDef, type ActionPermissionSet, type DashboardAccessLevel, type PosAccessLevel, type RoleDefinition,
} from './permission-matrix';
import type { Role } from './permissions';

/**
 * Pemetaan peran kustom <-> tabel 0033 (roles, role_dashboard_perms, role_pos_perms_module, role_*_feature_perms).
 * Server hanya menyimpan peran KUSTOM; peran bawaan (owner, manager, cashier) tetap dari `createDefaultRoleDefinitions` dan digabung klien
 * dengan `mergeRoleOverrides`. Konvensi baris fitur: sub_feature_id = '' berarti TOGGLE fitur (can_view = fitur aktif); selain itu baris izin
 * sub-fitur. Aksi yang tidak didukung sub-fitur disimpan false di server dan dipulihkan menjadi null menurut katalog.
 */
type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRoleUuid = (id: string | undefined | null): boolean => !!id && UUID.test(id);

const BASE_ROLES: readonly Role[] = ['owner', 'manager', 'cashier'];

export function roleSaveProblem(role: RoleDefinition): string | null {
  if (role.isBuiltIn) return 'Peran bawaan tidak bisa diubah. Duplikasi dulu menjadi peran kustom.';
  const name = role.name.trim();
  if (!name) return 'Nama peran wajib diisi.';
  if (name.length > 60) return 'Nama peran maksimal 60 karakter.';
  if ((role.description ?? '').length > 300) return 'Deskripsi maksimal 300 karakter.';
  if (!BASE_ROLES.includes(role.baseRole)) return 'Peran dasar harus owner, manager, atau cashier.';
  return null;
}

function featureModuleMap(modules: readonly AccessModuleDef[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const mod of modules) for (const f of mod.features) m.set(f.id, mod.id);
  return m;
}

const permRow = (moduleId: string, featureId: string, subFeatureId: string, p: ActionPermissionSet) => ({
  moduleId, featureId, subFeatureId,
  canView: p.lihat === true, canCreate: p.buat === true, canEdit: p.ubah === true, canDelete: p.hapus === true, canVoid: p.void === true,
});

function featureRows(modules: readonly AccessModuleDef[], enabled: Record<string, boolean> | undefined, perms: Record<string, ActionPermissionSet> | undefined) {
  const rows: ReturnType<typeof permRow>[] = [];
  for (const mod of modules) {
    for (const f of mod.features) {
      if (enabled && f.id in enabled) rows.push(permRow(mod.id, f.id, '', { lihat: !!enabled[f.id], buat: false, ubah: false, hapus: false, void: false }));
      for (const s of f.subFeatures) {
        const p = perms?.[subFeatureKey(f.id, s.id)];
        if (p) rows.push(permRow(mod.id, f.id, s.id, p));
      }
    }
  }
  return rows;
}

const moduleRows = (m: Record<string, boolean> | undefined) => Object.entries(m ?? {}).map(([moduleId, enabled]) => ({ moduleId, enabled: !!enabled }));

/** Argumen RPC pos.save_role_permissions. p_id = null untuk peran baru (id klien bukan UUID server). */
export function roleToRpcArgs(role: RoleDefinition, orgId: string): Record<string, unknown> {
  return {
    p_id: isRoleUuid(role.id) ? role.id : null, p_org: orgId, p_name: role.name.trim(), p_description: role.description?.trim() || null,
    p_base_role: role.baseRole, p_owner_app_access: !!role.ownerAppAccess,
    p_default_dashboard_page: role.defaultDashboardPage ?? null, p_default_pos_page: role.defaultPosPage ?? null,
    p_can_authorize_refund: !!role.canAuthorizeRefund, p_can_authorize_void: !!role.canAuthorizeVoid, p_can_authorize_complimentary: !!role.canAuthorizeComplimentary,
    p_dashboard_modules: moduleRows(role.dashboardModuleEnabled), p_pos_modules: moduleRows(role.posModuleEnabled),
    p_dashboard_features: featureRows(DASHBOARD_ACCESS_MODULES, role.dashboardFeatureEnabled, role.dashboardSubFeaturePerms),
    p_pos_features: featureRows(POS_ACCESS_MODULES, role.posFeatureEnabled, role.posSubFeaturePerms),
    p_dashboard_perms_legacy: role.dashboardPerms ?? {}, p_pos_perms_legacy: role.posPerms ?? {}, p_pos_app_enabled: role.posAppEnabled !== false,
  };
}

export interface RoleRows { role: Row; dashModules: Row[]; posModules: Row[]; dashFeatures: Row[]; posFeatures: Row[] }

function hydrateSide(modules: readonly AccessModuleDef[], rows: Row[]) {
  const subs = new Map<string, { sub: AccessModuleDef['features'][number]['subFeatures'][number]; key: string }>();
  for (const mod of modules) for (const f of mod.features) for (const s of f.subFeatures) subs.set(`${mod.id}|${f.id}|${s.id}`, { sub: s, key: subFeatureKey(f.id, s.id) });
  const featureEnabled: Record<string, boolean> = {};
  const subPerms: Record<string, ActionPermissionSet> = {};
  for (const r of rows) {
    const feature = String(r.feature_id), sub = String(r.sub_feature_id ?? '');
    if (sub === '') { featureEnabled[feature] = r.can_view === true; continue; }
    const def = subs.get(`${r.module_id}|${feature}|${sub}`);
    if (!def) continue; // katalog sudah tidak punya sub-fitur ini: abaikan
    subPerms[def.key] = buildSubFeatureActionSet(def.sub, (a) => ({ lihat: r.can_view, buat: r.can_create, ubah: r.can_edit, hapus: r.can_delete, void: r.can_void } as Record<string, unknown>)[a] === true);
  }
  return { featureEnabled, subPerms };
}

const modMap = (rows: Row[]) => Object.fromEntries(rows.map((r) => [String(r.module_id), r.enabled === true]));

/** Bangun RoleDefinition dari baris tabel. Peran dari server selalu kustom (isBuiltIn=false). */
export function roleFromRows(x: RoleRows): RoleDefinition {
  const r = x.role;
  const d = hydrateSide(DASHBOARD_ACCESS_MODULES, x.dashFeatures), p = hydrateSide(POS_ACCESS_MODULES, x.posFeatures);
  const base = BASE_ROLES.includes(r.base_role as Role) ? (r.base_role as Role) : 'cashier';
  return {
    id: String(r.id), name: String(r.name), description: (r.description as string | null) ?? '', isBuiltIn: false, baseRole: base,
    ownerAppAccess: r.owner_app_access === true,
    dashboardPerms: (r.dashboard_perms_legacy as Record<string, DashboardAccessLevel> | undefined) ?? {},
    posPerms: (r.pos_perms_legacy as Record<string, PosAccessLevel> | undefined) ?? {},
    dashboardModuleEnabled: modMap(x.dashModules), dashboardFeatureEnabled: d.featureEnabled, dashboardSubFeaturePerms: d.subPerms,
    posAppEnabled: r.pos_app_enabled !== false, posModuleEnabled: modMap(x.posModules), posFeatureEnabled: p.featureEnabled, posSubFeaturePerms: p.subPerms,
    canAuthorizeRefund: r.can_authorize_refund === true, canAuthorizeVoid: r.can_authorize_void === true, canAuthorizeComplimentary: r.can_authorize_complimentary === true,
    ...(r.default_dashboard_page ? { defaultDashboardPage: String(r.default_dashboard_page) } : {}),
    ...(r.default_pos_page ? { defaultPosPage: String(r.default_pos_page) } : {}),
  };
}
