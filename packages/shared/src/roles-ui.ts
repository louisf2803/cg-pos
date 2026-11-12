import {
  createDefaultRoleDefinitions,
  isBuiltInRole,
  mergeRoleOverrides,
  migrateRoleDefinition,
  type RoleDefinition,
} from './permission-matrix';

/**
 * Gabungkan peran bawaan (owner, manager, cashier) dengan peran kustom dari server.
 * Pola resmi: built-in berasal dari klien, override/kustom dari server.
 */
export function mergeServerRoles(
  serverCustomRoles: RoleDefinition[],
  dashboardModuleIds: string[],
): RoleDefinition[] {
  const builtIns = createDefaultRoleDefinitions(dashboardModuleIds);
  const customOnly = serverCustomRoles.filter((r) => !isBuiltInRole(r));
  return mergeRoleOverrides([...builtIns, ...customOnly], dashboardModuleIds);
}

/**
 * Mutakhirkan daftar peran kustom lokal setelah `data.saveRolePermissions` berhasil.
 * Mengganti id sementara (non-UUID klien) dengan id UUID hasil server agar tidak muncul duplikat.
 */
export function upsertCustomRole(
  currentCustomRoles: RoleDefinition[],
  draftId: string,
  savedFromServer: RoleDefinition,
  dashboardModuleIds: string[],
): RoleDefinition[] {
  const normalized: RoleDefinition = {
    ...migrateRoleDefinition(savedFromServer, dashboardModuleIds),
    isBuiltIn: false,
  };
  let replaced = false;
  const next: RoleDefinition[] = [];
  for (const item of currentCustomRoles) {
    if (item.id === draftId || item.id === normalized.id) {
      if (!replaced) {
        next.push(normalized);
        replaced = true;
      }
      continue;
    }
    next.push(item);
  }
  if (!replaced) {
    next.push(normalized);
  }
  return next;
}

/**
 * Ekstrak peran kustom lama yang tersimpan di `localStorage` (format array `RoleDefinition`).
 * Peran bawaan (owner, manager, cashier) diabaikan karena sudah tetap dari bawaan aplikasi.
 */
export function extractLegacyCustomRoles(
  rawJson: string | null,
  dashboardModuleIds: string[],
): RoleDefinition[] {
  if (!rawJson) return [];
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    const seenIds = new Set<string>();
    const result: RoleDefinition[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as RoleDefinition;
      if (typeof candidate.id !== 'string' || !candidate.id.trim()) continue;
      if (typeof candidate.name !== 'string' || !candidate.name.trim()) continue;
      if (isBuiltInRole(candidate)) continue;
      if (seenIds.has(candidate.id)) continue;
      seenIds.add(candidate.id);
      result.push({
        ...migrateRoleDefinition(candidate, dashboardModuleIds),
        isBuiltIn: false,
      });
    }
    return result;
  } catch {
    return [];
  }
}

/** Terjemahkan galat aksi peran dari server menjadi pesan ringkas Bahasa Indonesia. */
export function roleActionErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }
  return fallback;
}

