import {
  createDefaultRoleDefinitions,
  isBuiltInRole,
  mergeRoleOverrides,
  migrateRoleDefinition,
  type RoleDefinition,
} from './permission-matrix';
import type { ManagedEmployee } from './types';

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

/**
 * Hitung jumlah karyawan untuk peran tertentu (bawaan atau kustom).
 * - Peran kustom: karyawan dengan roleId === role.id.
 * - Peran bawaan: karyawan tanpa roleId kustom (!roleId) dan role === role.baseRole.
 * Bawaannya hanya menghitung karyawan aktif (activeOnly = true) untuk konsistensi kartu metrik.
 */
export function countEmployeesForRole(
  role: RoleDefinition,
  employees: readonly ManagedEmployee[],
  options?: { activeOnly?: boolean },
): number {
  const activeOnly = options?.activeOnly ?? true;
  if (!role.isBuiltIn) {
    return employees.filter(
      (e) => e.roleId === role.id && (!activeOnly || e.isActive),
    ).length;
  }
  return employees.filter(
    (e) => !e.roleId && e.role === role.baseRole && (!activeOnly || e.isActive),
  ).length;
}

/**
 * Ambil peran kustom yang sedang terpasang pada karyawan, atau null jika memakai peran bawaan / tidak ditemukan.
 */
export function getCustomRoleForEmployee(
  employee: ManagedEmployee,
  customRoles: readonly RoleDefinition[],
): RoleDefinition | null {
  if (!employee.roleId) return null;
  return customRoles.find((r) => r.id === employee.roleId && !r.isBuiltIn) ?? null;
}

/**
 * Pesan peringatan saat menghapus peran kustom:
 * Menampilkan jumlah karyawan yang akan kehilangan tautan bila masih ada karyawan yang menggunakannya.
 */
export function roleDeletionWarningMessage(
  role: RoleDefinition,
  employees: readonly ManagedEmployee[],
): string {
  const linkedCount = employees.filter((e) => e.roleId === role.id).length;
  if (linkedCount > 0) {
    return `Peran ini sedang digunakan oleh ${linkedCount} karyawan. Jika dihapus, tautan peran kustom pada karyawan tersebut akan dilepas dan mereka otomatis kembali ke peran bawaan.`;
  }
  return `Anda yakin ingin menghapus peran kustom "${role.name}" dari server? Peran yang dihapus tidak dapat dipulihkan.`;
}


