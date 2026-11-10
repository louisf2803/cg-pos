import { describe, expect, it } from 'vitest';
import {
  initColumnPrefs,
  mergeColumnPrefs,
  moveColumn,
  toggleColumnVisibility,
  getActiveColumns,
  hasVisibleColumns,
  projectCsvRow,
  type ColumnDef,
} from '../src/columns';

describe('Column Prefs and Ordering Helpers (A32)', () => {
  const SAMPLE_COLUMNS: ColumnDef[] = [
    { key: 'col1', label: 'Kolom 1' },
    { key: 'col2', label: 'Kolom 2', defaultVisible: false },
    { key: 'col3', label: 'Kolom 3' },
    { key: 'col4', label: 'Kolom 4' },
  ];

  it('initializes column preferences with default visibility', () => {
    const prefs = initColumnPrefs(SAMPLE_COLUMNS);
    expect(prefs.order).toEqual(['col1', 'col2', 'col3', 'col4']);
    expect(prefs.visible).toEqual({
      col1: true,
      col2: false,
      col3: true,
      col4: true,
    });
  });

  it('safely merges corrupted or non-object saved storage', () => {
    expect(mergeColumnPrefs(SAMPLE_COLUMNS, null)).toEqual(initColumnPrefs(SAMPLE_COLUMNS));
    expect(mergeColumnPrefs(SAMPLE_COLUMNS, 'invalid json string')).toEqual(initColumnPrefs(SAMPLE_COLUMNS));
    expect(mergeColumnPrefs(SAMPLE_COLUMNS, 123)).toEqual(initColumnPrefs(SAMPLE_COLUMNS));
  });

  it('merges valid partial preferences and discards unknown keys', () => {
    const saved = {
      order: ['col3', 'unknown_col', 'col1'],
      visible: {
        col1: false,
        col3: true,
        unknown_col: true,
      },
    };

    const merged = mergeColumnPrefs(SAMPLE_COLUMNS, saved);
    // col3 and col1 ordered first, remaining SAMPLE_COLUMNS appended (col2, col4)
    expect(merged.order).toEqual(['col3', 'col1', 'col2', 'col4']);
    // visibility preserved for known keys, default used for missing keys
    expect(merged.visible).toEqual({
      col1: false,
      col2: false,
      col3: true,
      col4: true,
    });
  });

  it('moves column position up and down without mutating array', () => {
    const order = ['a', 'b', 'c', 'd'];

    // Move 'c' (index 2) up to index 1
    const movedUp = moveColumn(order, 2, 1);
    expect(movedUp).toEqual(['a', 'c', 'b', 'd']);
    expect(order).toEqual(['a', 'b', 'c', 'd']); // pure

    // Move 'a' (index 0) down to index 2
    const movedDown = moveColumn(order, 0, 2);
    expect(movedDown).toEqual(['b', 'c', 'a', 'd']);

    // Out of bounds or no-op returns shallow copy of same order
    expect(moveColumn(order, 0, 0)).toEqual(order);
    expect(moveColumn(order, -1, 2)).toEqual(order);
    expect(moveColumn(order, 1, 99)).toEqual(order);
  });

  it('toggles column visibility immutably', () => {
    const initial = initColumnPrefs(SAMPLE_COLUMNS);
    const toggled = toggleColumnVisibility(initial, 'col1');
    expect(toggled.visible.col1).toBe(false);
    expect(initial.visible.col1).toBe(true);

    const toggledBack = toggleColumnVisibility(toggled, 'col1');
    expect(toggledBack.visible.col1).toBe(true);
  });

  it('retrieves active columns filtered and sorted by preferences', () => {
    const prefs = {
      order: ['col4', 'col2', 'col3', 'col1'],
      visible: {
        col1: true,
        col2: true, // was default false, but set visible
        col3: false, // hidden
        col4: true,
      },
    };

    const active = getActiveColumns(SAMPLE_COLUMNS, prefs);
    expect(active.map((c) => c.key)).toEqual(['col4', 'col2', 'col1']);
  });

  it('checks whether any columns are currently visible', () => {
    const prefs = initColumnPrefs(SAMPLE_COLUMNS);
    expect(hasVisibleColumns(prefs)).toBe(true);

    const allHidden = {
      order: ['col1', 'col2', 'col3', 'col4'],
      visible: {
        col1: false,
        col2: false,
        col3: false,
        col4: false,
      },
    };
    expect(hasVisibleColumns(allHidden)).toBe(false);
  });

  it('projects row values in the exact order of active keys', () => {
    const row = {
      name: 'Budi',
      total: 50000,
      role: 'Kasir',
      unknown: 'ignore me',
    };

    const projected = projectCsvRow(row, ['role', 'name', 'total', 'missing'], '-');
    expect(projected).toEqual(['Kasir', 'Budi', 50000, '-']);
  });
});

