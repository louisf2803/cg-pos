import { describe, expect, it } from 'vitest';
import {
  createBlankCustomRole,
  createDefaultRoleDefinitions,
  extractLegacyCustomRoles,
  mergeServerRoles,
  roleActionErrorMessage,
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
});

