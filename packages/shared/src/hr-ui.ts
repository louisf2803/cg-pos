import type { JobLevel, OrgUnit, EmployeeType, EmployeeHr } from './hr';
import { distanceMeters } from './hr';

export interface OrgTreeNode {
  unit: OrgUnit;
  depth: number;
  hasChildren: boolean;
  path: string;
}

/** Flatten hierarchical org units with depth for indented select and table display */
export function flattenOrgTree(units: readonly OrgUnit[], parentId?: string, depth = 0): OrgTreeNode[] {
  const result: OrgTreeNode[] = [];
  const children = units
    .filter((u) => (parentId ? u.parentId === parentId : !u.parentId))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const child of children) {
    const hasChildren = units.some((u) => u.parentId === child.id);
    result.push({
      unit: child,
      depth,
      hasChildren,
      path: depth === 0 ? child.name : `${'— '.repeat(depth)}${child.name}`,
    });
    if (hasChildren) {
      result.push(...flattenOrgTree(units, child.id, depth + 1));
    }
  }

  // Also include any orphaned units (whose parentId points to a non-existent unit) if depth === 0
  if (!parentId) {
    const allIds = new Set(units.map((u) => u.id));
    const processedIds = new Set(result.map((r) => r.unit.id));
    const orphans = units.filter((u) => !processedIds.has(u.id) && u.parentId && !allIds.has(u.parentId));
    for (const orphan of orphans) {
      result.push({
        unit: orphan,
        depth: 0,
        hasChildren: false,
        path: orphan.name,
      });
    }
  }

  return result;
}

/** Get eligible parents for an org unit, excluding itself and any of its descendants to prevent cycles */
export function getEligibleParentUnits(currentUnitId: string | undefined, allUnits: readonly OrgUnit[]): OrgUnit[] {
  if (!currentUnitId) return [...allUnits].sort((a, b) => a.name.localeCompare(b.name));

  const descendantIds = new Set<string>();
  const findDescendants = (id: string) => {
    descendantIds.add(id);
    for (const u of allUnits) {
      if (u.parentId === id && !descendantIds.has(u.id)) {
        findDescendants(u.id);
      }
    }
  };
  findDescendants(currentUnitId);

  return allUnits.filter((u) => !descendantIds.has(u.id)).sort((a, b) => a.name.localeCompare(b.name));
}

/** Count employees assigned to a specific job level, org unit, or employee type */
export function countEmployeesWithHr(
  field: 'jobLevelId' | 'orgUnitId' | 'employeeTypeId',
  targetId: string,
  profiles: readonly EmployeeHr[],
): number {
  return profiles.filter((p) => p[field] === targetId).length;
}

/** Human-readable delete confirmation warning for HR entities */
export function hrEntityDeleteWarning(
  entityType: 'jabatan' | 'unit organisasi' | 'tipe karyawan',
  name: string,
  employeeCount: number,
): string {
  if (employeeCount <= 0) {
    return `Anda yakin ingin menghapus ${entityType} "${name}"? Tindakan ini tidak dapat dibatalkan.`;
  }
  return `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} "${name}" sedang digunakan oleh ${employeeCount} karyawan. Jika dihapus, data karyawan tetap ada namun tautan ${entityType} pada karyawan tersebut akan dilepas (dikosongkan).`;
}

/** Formatted test preview of GPS location against outlet settings */
export function evaluateLocationPreview(
  outletLat: number | null | undefined,
  outletLng: number | null | undefined,
  testLat: number,
  testLng: number,
  radiusM: number | null | undefined,
): {
  distanceM: number | null;
  isInside: boolean;
  message: string;
} {
  if (outletLat == null || outletLng == null) {
    return {
      distanceM: null,
      isInside: false,
      message: 'Koordinat lokasi outlet belum diisi.',
    };
  }
  const dist = distanceMeters(outletLat, outletLng, testLat, testLng);
  const maxRadius = radiusM ?? 50;
  const isInside = dist <= maxRadius;
  return {
    distanceM: dist,
    isInside,
    message: isInside
      ? `Titik ujian ${dist} m dari outlet: DI DALAM radius (Maks. ${maxRadius} m).`
      : `Titik ujian ${dist} m dari outlet: DI LUAR radius (Maks. ${maxRadius} m).`,
  };
}

