import { describe, expect, it } from 'vitest';
import {
  createTableGroup,
  findGroupForTable,
  formatTableGroupLabel,
  removeTableFromGroup,
} from '../src/table-group';

describe('TableGroup helper', () => {
  it('berhasil membuat grup meja dengan minimal 2 meja unik', () => {
    const group = createTableGroup('grp-1', 'Rombongan VIP', ['t1', 't2', 't1']);
    expect(group.id).toBe('grp-1');
    expect(group.name).toBe('Rombongan VIP');
    expect(group.tableIds).toEqual(['t1', 't2']);
    expect(group.primaryTableId).toBe('t1');
  });

  it('menolak grup meja dengan nama kosong atau meja kurang dari 2', () => {
    expect(() => createTableGroup('grp-1', '  ', ['t1', 't2'])).toThrow(
      'Nama grup meja wajib diisi.',
    );
    expect(() => createTableGroup('grp-1', 'VIP', ['t1'])).toThrow(
      'Grup meja minimal terdiri dari 2 meja.',
    );
  });

  it('dapat mencari grup untuk meja tertentu', () => {
    const g1 = createTableGroup('grp-1', 'VIP 1', ['t1', 't2']);
    const g2 = createTableGroup('grp-2', 'VIP 2', ['t3', 't4']);
    expect(findGroupForTable('t2', [g1, g2])).toBe(g1);
    expect(findGroupForTable('t3', [g1, g2])).toBe(g2);
    expect(findGroupForTable('t5', [g1, g2])).toBeUndefined();
  });

  it('melepaskan meja dan membubarkan grup jika sisa meja < 2', () => {
    const g1 = createTableGroup('grp-1', 'Grup A', ['t1', 't2', 't3']);
    const reduced = removeTableFromGroup('t1', g1);
    expect(reduced).not.toBeNull();
    expect(reduced?.tableIds).toEqual(['t2', 't3']);

    const dissolved = removeTableFromGroup('t2', reduced!);
    expect(dissolved).toBeNull();
  });

  it('memformat label grup meja dengan nama meja gabungan', () => {
    const g = createTableGroup('grp-1', 'Rombongan', ['t1', 't2']);
    const names = { t1: 'Meja 1', t2: 'Meja 2' };
    expect(formatTableGroupLabel(g, names)).toBe('Rombongan (Meja 1 + Meja 2)');
  });
});

