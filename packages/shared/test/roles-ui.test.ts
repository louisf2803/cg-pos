import { describe, expect, it } from 'vitest';
import {
  countEmployeesForRole,
  createBlankCustomRole,
  createDefaultRoleDefinitions,
  extractLegacyCustomRoles,
  getCustomRoleForEmployee,
  mergeServerRoles,
  roleActionErrorMessage,
  roleDeletionWarningMessage,
  upsertCustomRole,
} from '../src';

const MODULE_IDS = ['penjualan-laporan', 'produk', 'karyawan'];

describe('roles-ui helpers', () => {
  it('mergeServerRoles keeps built-in roles first and appends server custom roles', () => {
    const custom = {
      ...createBlankCustomRole(MODULE_IDS, '550e8400-e29b-41d4-a716-446655440000'),
      name: 'Supervisor Shift',
      description: 'Kepala jaga',
    };
    const merged = mergeServerRoles([custom], MODULE_IDS);
    expect(merged.slice(0, 3).map((r) => r.id)).toEqual(['owner', 'manager', 'cashier']);
    expect(merged).toHaveLength(4);
    expect(merged[3]?.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(merged[3]?.isBuiltIn).toBe(false);
  });

  it('upsertCustomRole replaces temporary non-UUID client id with server UUID without duplicating', () => {
    const existing = {
      ...createBlankCustomRole(MODULE_IDS, '11111111-1111-1111-1111-111111111111'),
      name: 'Kasir Magang',
    };
    const tempRole = {
      ...createBlankCustomRole(MODULE_IDS, 'temp-client-id-123'),
      name: 'Head Bar',
    };
    const serverReturned = {
      ...tempRole,
      id: '22222222-2222-2222-2222-222222222222',
      ownerAppAccess: false,
    };

    const afterCreate = upsertCustomRole([existing], tempRole.id, serverReturned, MODULE_IDS);
    expect(afterCreate).toHaveLength(2);
    expect(afterCreate.map((r) => r.id)).toEqual([
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ]);

    const updatedServerReturned = {
      ...serverReturned,
      name: 'Head Bar Senior',
      description: 'Barista utama',
    };
    const afterUpdate = upsertCustomRole(
      afterCreate,
      serverReturned.id,
      updatedServerReturned,
      MODULE_IDS,
    );
    expect(afterUpdate).toHaveLength(2);
    expect(afterUpdate[1]?.name).toBe('Head Bar Senior');

    // Edge case: if tempRole somehow lingered alongside UUID in list, deduplicates to 1 row
    const withTempStillInList = [existing, tempRole];
    const deduped = upsertCustomRole(withTempStillInList, tempRole.id, serverReturned, MODULE_IDS);
    expect(deduped).toHaveLength(2);
    expect(deduped[1]?.id).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('extractLegacyCustomRoles ignores built-ins and invalid JSON, extracting only custom roles', () => {
    const defaults = createDefaultRoleDefinitions(MODULE_IDS);
    const custom1 = {
      ...createBlankCustomRole(MODULE_IDS, 'legacy-1'),
      name: 'Kasir Pagi',
    };
    const custom2 = {
      ...createBlankCustomRole(MODULE_IDS, 'legacy-2'),
      name: 'Barista',
    };
    const raw = JSON.stringify([...defaults, custom1, custom1, custom2]);
    const extracted = extractLegacyCustomRoles(raw, MODULE_IDS);
    expect(extracted.map((r) => r.id)).toEqual(['legacy-1', 'legacy-2']);
    expect(extracted.every((r) => !r.isBuiltIn)).toBe(true);

    expect(extractLegacyCustomRoles('not-json', MODULE_IDS)).toEqual([]);
    expect(extractLegacyCustomRoles(null, MODULE_IDS)).toEqual([]);
  });

  it('roleActionErrorMessage uses error message or falls back', () => {
    expect(roleActionErrorMessage(new Error('Nama peran sudah dipakai.'), 'Gagal')).toBe(
      'Nama peran sudah dipakai.',
    );
    expect(roleActionErrorMessage(null, 'Gagal menyimpan')).toBe('Gagal menyimpan');
  });

  it('countEmployeesForRole counts custom and built-in roles accurately', () => {
    const customRole = {
      ...createBlankCustomRole(MODULE_IDS, 'custom-uuid-1'),
      name: 'Supervisor',
    };
    const cashierBuiltIn = createDefaultRoleDefinitions(MODULE_IDS).find(
      (r) => r.id === 'cashier',
    )!;
    const managerBuiltIn = createDefaultRoleDefinitions(MODULE_IDS).find(
      (r) => r.id === 'manager',
    )!;

    const employees = [
      { id: 'e1', name: 'Budi', role: 'cashier', roleId: null, isActive: true },
      { id: 'e2', name: 'Siti', role: 'cashier', roleId: 'custom-uuid-1', isActive: true },
      { id: 'e3', name: 'Andi', role: 'cashier', roleId: 'custom-uuid-1', isActive: false },
      { id: 'e4', name: 'Rini', role: 'manager', roleId: null, isActive: true },
    ] as const;

    // Custom role: only employees with roleId === role.id
    expect(countEmployeesForRole(customRole, employees, { activeOnly: true })).toBe(1);
    expect(countEmployeesForRole(customRole, employees, { activeOnly: false })).toBe(2);

    // Built-in role: only employees without roleId whose baseRole matches
    // Note: e2 has role === 'cashier' but has roleId === 'custom-uuid-1', so e2 is NOT counted in cashier built-in!
    expect(countEmployeesForRole(cashierBuiltIn, employees, { activeOnly: true })).toBe(1); // e1 only
    expect(countEmployeesForRole(managerBuiltIn, employees, { activeOnly: true })).toBe(1); // e4 only
  });

  it('getCustomRoleForEmployee resolves custom role or returns null', () => {
    const custom1 = {
      ...createBlankCustomRole(MODULE_IDS, 'c-1'),
      name: 'Barista Utama',
    };
    const roles = [custom1];
    expect(
      getCustomRoleForEmployee(
        { id: 'e1', name: 'Ahmad', role: 'cashier', roleId: 'c-1', isActive: true },
        roles,
      )?.name,
    ).toBe('Barista Utama');
    expect(
      getCustomRoleForEmployee(
        { id: 'e2', name: 'Budi', role: 'cashier', roleId: null, isActive: true },
        roles,
      ),
    ).toBeNull();
    expect(
      getCustomRoleForEmployee(
        { id: 'e3', name: 'Citra', role: 'cashier', roleId: 'c-999', isActive: true },
        roles,
      ),
    ).toBeNull();
  });

  it('roleDeletionWarningMessage indicates number of affected employees or standard message', () => {
    const role = {
      ...createBlankCustomRole(MODULE_IDS, 'c-1'),
      name: 'Shift Lead',
    };
    const employees = [
      { id: 'e1', name: 'Staff 1', role: 'cashier', roleId: 'c-1', isActive: true },
      { id: 'e2', name: 'Staff 2', role: 'cashier', roleId: 'c-1', isActive: false },
      { id: 'e3', name: 'Staff 3', role: 'manager', roleId: null, isActive: true },
    ] as const;

    expect(roleDeletionWarningMessage(role, employees)).toContain(
      'Peran ini sedang digunakan oleh 2 karyawan',
    );
    expect(
      roleDeletionWarningMessage(
        { ...role, id: 'c-empty' },
        employees,
      ),
    ).toContain('Anda yakin ingin menghapus peran kustom "Shift Lead"');
  });
});

