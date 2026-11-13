export interface TableGroup {
  id: string;
  name: string;
  tableIds: string[];
  primaryTableId: string;
  createdAt: string;
}

/**
 * Membuat grup meja gabungan (misal Meja 1 + Meja 2 disatukan untuk rombongan).
 */
export function createTableGroup(
  id: string,
  name: string,
  tableIds: string[],
  primaryTableId?: string,
): TableGroup {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Nama grup meja wajib diisi.');
  const uniqueIds = Array.from(new Set(tableIds.filter(Boolean)));
  if (uniqueIds.length < 2) throw new Error('Grup meja minimal terdiri dari 2 meja.');
  const primary =
    primaryTableId && uniqueIds.includes(primaryTableId) ? primaryTableId : uniqueIds[0]!;
  return {
    id,
    name: trimmed,
    tableIds: uniqueIds,
    primaryTableId: primary,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Mencari grup meja tempat meja tertentu tergabung.
 */
export function findGroupForTable(
  tableId: string,
  groups: TableGroup[],
): TableGroup | undefined {
  return groups.find((g) => g.tableIds.includes(tableId));
}

/**
 * Melepaskan meja dari grup. Bila sisa meja < 2, grup otomatis dibubarkan (return null).
 */
export function removeTableFromGroup(
  tableId: string,
  group: TableGroup,
): TableGroup | null {
  const remaining = group.tableIds.filter((id) => id !== tableId);
  if (remaining.length < 2) return null;
  const primary = remaining.includes(group.primaryTableId)
    ? group.primaryTableId
    : remaining[0]!;
  return {
    ...group,
    tableIds: remaining,
    primaryTableId: primary,
  };
}

/**
 * Menggabungkan nama-nama meja dalam grup untuk label ringkas (misal "Meja 1 + 2").
 */
export function formatTableGroupLabel(
  group: TableGroup,
  names: Record<string, string>,
): string {
  const tableNames = group.tableIds
    .map((id) => names[id] ?? id)
    .filter(Boolean);
  return `${group.name} (${tableNames.join(' + ')})`;
}

