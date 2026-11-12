import { describe, it, expect } from 'vitest';
import {
  flattenOrgTree,
  getEligibleParentUnits,
  countEmployeesWithHr,
  hrEntityDeleteWarning,
  evaluateLocationPreview,
} from '../src/hr-ui';
import type { OrgUnit, EmployeeHr } from '../src/hr';

describe('hr-ui helpers', () => {
  const units: OrgUnit[] = [
    { id: 'u1', name: 'Operasional' },
    { id: 'u2', name: 'Bar', parentId: 'u1' },
    { id: 'u3', name: 'Dapur', parentId: 'u1' },
    { id: 'u4', name: 'Pastry', parentId: 'u3' },
    { id: 'u5', name: 'Keuangan' },
  ];

  it('flattenOrgTree builds ordered tree with depth and indentation path', () => {
    const flat = flattenOrgTree(units);
    expect(flat.map((f) => f.unit.name)).toEqual([
      'Keuangan',
      'Operasional',
      'Bar',
      'Dapur',
      'Pastry',
    ]);
    const pastry = flat.find((f) => f.unit.name === 'Pastry')!;
    expect(pastry.depth).toBe(2);
    expect(pastry.path).toBe('— — Pastry');

    const operasional = flat.find((f) => f.unit.name === 'Operasional')!;
    expect(operasional.depth).toBe(0);
    expect(operasional.hasChildren).toBe(true);
  });

  it('getEligibleParentUnits excludes self and all descendants to prevent cycles', () => {
    // When editing 'u1' (Operasional), neither u1, u2 (Bar), u3 (Dapur), nor u4 (Pastry) can be parent
    const eligibleForU1 = getEligibleParentUnits('u1', units);
    expect(eligibleForU1.map((u) => u.id)).toEqual(['u5']);

    // When editing 'u3' (Dapur), u3 and u4 (Pastry) are excluded
    const eligibleForU3 = getEligibleParentUnits('u3', units);
    expect(eligibleForU3.map((u) => u.id).sort()).toEqual(['u1', 'u2', 'u5']);

    // When creating new unit (undefined id), all are eligible
    const eligibleForNew = getEligibleParentUnits(undefined, units);
    expect(eligibleForNew.length).toBe(units.length);
  });

  it('countEmployeesWithHr counts employees matching target id', () => {
    const profiles: EmployeeHr[] = [
      { employeeId: 'e1', jobLevelId: 'j1', orgUnitId: 'u1', employeeTypeId: 't1' },
      { employeeId: 'e2', jobLevelId: 'j1', orgUnitId: 'u2', employeeTypeId: 't2' },
      { employeeId: 'e3', jobLevelId: 'j2', orgUnitId: 'u1' },
    ];
    expect(countEmployeesWithHr('jobLevelId', 'j1', profiles)).toBe(2);
    expect(countEmployeesWithHr('jobLevelId', 'j2', profiles)).toBe(1);
    expect(countEmployeesWithHr('jobLevelId', 'j3', profiles)).toBe(0);
    expect(countEmployeesWithHr('orgUnitId', 'u1', profiles)).toBe(2);
    expect(countEmployeesWithHr('employeeTypeId', 't1', profiles)).toBe(1);
  });

  it('hrEntityDeleteWarning produces informative messages', () => {
    const noUsers = hrEntityDeleteWarning('jabatan', 'Kasir Senior', 0);
    expect(noUsers).toContain('Anda yakin ingin menghapus jabatan "Kasir Senior"?');

    const withUsers = hrEntityDeleteWarning('tipe karyawan', 'Magang', 3);
    expect(withUsers).toContain('3 karyawan');
    expect(withUsers).toContain('tautan tipe karyawan pada karyawan tersebut akan dilepas');
  });

  it('evaluateLocationPreview correctly determines within or outside radius', () => {
    // Jakarta Monas approx -6.175392, 106.827153
    const monasLat = -6.175392;
    const monasLng = 106.827153;

    // Test point ~30m away
    const testClose = evaluateLocationPreview(monasLat, monasLng, -6.1754, 106.8274, 100);
    expect(testClose.isInside).toBe(true);
    expect(testClose.message).toContain('DI DALAM radius');

    // Test point ~500m away
    const testFar = evaluateLocationPreview(monasLat, monasLng, -6.179, 106.8271, 100);
    expect(testFar.isInside).toBe(false);
    expect(testFar.message).toContain('DI LUAR radius');

    // Missing outlet coords
    const testMissing = evaluateLocationPreview(null, null, -6.1754, 106.8274, 100);
    expect(testMissing.distanceM).toBeNull();
    expect(testMissing.isInside).toBe(false);
  });
});

