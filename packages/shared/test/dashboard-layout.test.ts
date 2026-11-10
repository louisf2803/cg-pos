import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FINANCE_WIDGETS,
  FINANCE_LAYOUT_SCHEMA_VERSION,
  FINANCE_WIDGET_CATALOG,
  addWidgetToLayout,
  getAvailableWidgets,
  getFinanceLayoutStorageKey,
  moveWidgetInLayout,
  removeWidgetFromLayout,
  serializeFinanceLayout,
  validateAndMigrateLayout,
  type FinanceWidgetId,
} from '../src/dashboard-layout';

describe('dashboard-layout helper murni', () => {
  it('validateAndMigrateLayout mengembalikan default layout saat data kosong atau tidak valid', () => {
    expect(validateAndMigrateLayout(null)).toEqual(DEFAULT_FINANCE_WIDGETS);
    expect(validateAndMigrateLayout(undefined)).toEqual(DEFAULT_FINANCE_WIDGETS);
    expect(validateAndMigrateLayout('')).toEqual(DEFAULT_FINANCE_WIDGETS);
    expect(validateAndMigrateLayout('bukan json valid {')).toEqual(DEFAULT_FINANCE_WIDGETS);
    expect(validateAndMigrateLayout(12345)).toEqual(DEFAULT_FINANCE_WIDGETS);
    expect(validateAndMigrateLayout({})).toEqual(DEFAULT_FINANCE_WIDGETS);
  });

  it('validateAndMigrateLayout memigrasi array polos lama (versi 0) dan memfilter ID tidak valid', () => {
    const legacyArray = ['laba-rugi', 'unknown-widget', 'arus-kas', 'laba-rugi', 'umur-hutang'];
    const result = validateAndMigrateLayout(legacyArray);

    expect(result).toEqual(['laba-rugi', 'arus-kas', 'umur-hutang']);
  });

  it('validateAndMigrateLayout memproses payload terstruktur dengan benar', () => {
    const payload = {
      version: FINANCE_LAYOUT_SCHEMA_VERSION,
      widgets: ['saldo-kas', 'posisi-neraca', 'arus-ringkas'],
    };
    const result = validateAndMigrateLayout(JSON.stringify(payload));
    expect(result).toEqual(['saldo-kas', 'posisi-neraca', 'arus-ringkas']);
  });

  it('addWidgetToLayout menambah widget baru dan mengabaikan duplikat serta ID asing', () => {
    const initial: FinanceWidgetId[] = ['laba-rugi', 'arus-kas'];

    // Tambah widget valid
    const added = addWidgetToLayout(initial, 'umur-hutang');
    expect(added).toEqual(['laba-rugi', 'arus-kas', 'umur-hutang']);

    // Tambah widget yang sudah ada (duplikat diabaikan)
    const duplicate = addWidgetToLayout(added, 'laba-rugi');
    expect(duplicate).toEqual(added);

    // Tambah ID tidak valid (diabaikan)
    const invalid = addWidgetToLayout(added, 'non-existent' as FinanceWidgetId);
    expect(invalid).toEqual(added);
  });

  it('removeWidgetFromLayout menghapus widget yang dipilih', () => {
    const initial: FinanceWidgetId[] = ['laba-rugi', 'arus-kas', 'saldo-kas'];
    const removed = removeWidgetFromLayout(initial, 'arus-kas');
    expect(removed).toEqual(['laba-rugi', 'saldo-kas']);

    // Hapus yang tidak ada tidak mengubah apa pun
    expect(removeWidgetFromLayout(removed, 'umur-hutang')).toEqual(removed);
  });

  it('moveWidgetInLayout menukar urutan ke atas dan ke bawah dengan batas yang aman', () => {
    const list: FinanceWidgetId[] = ['laba-rugi', 'arus-kas', 'saldo-kas'];

    // Geser arus-kas ke atas
    const up = moveWidgetInLayout(list, 'arus-kas', 'up');
    expect(up).toEqual(['arus-kas', 'laba-rugi', 'saldo-kas']);

    // Geser arus-kas ke bawah
    const down = moveWidgetInLayout(list, 'arus-kas', 'down');
    expect(down).toEqual(['laba-rugi', 'saldo-kas', 'arus-kas']);

    // Batas atas (elemen pertama geser ke atas tidak berubah)
    expect(moveWidgetInLayout(list, 'laba-rugi', 'up')).toEqual(list);

    // Batas bawah (elemen terakhir geser ke bawah tidak berubah)
    expect(moveWidgetInLayout(list, 'saldo-kas', 'down')).toEqual(list);

    // ID tidak ditemukan
    expect(moveWidgetInLayout(list, 'umur-hutang', 'up')).toEqual(list);
  });

  it('getAvailableWidgets mengembalikan widget katalog yang belum ada di layout', () => {
    const active: FinanceWidgetId[] = ['laba-rugi', 'arus-kas'];
    const available = getAvailableWidgets(active);

    expect(available.map((w) => w.id)).not.toContain('laba-rugi');
    expect(available.map((w) => w.id)).not.toContain('arus-kas');
    expect(available.length).toBe(FINANCE_WIDGET_CATALOG.length - 2);
  });

  it('serializeFinanceLayout dan getFinanceLayoutStorageKey berfungsi semestinya', () => {
    const serialized = serializeFinanceLayout(['laba-rugi', 'saldo-kas']);
    const parsed = JSON.parse(serialized);
    expect(parsed.version).toBe(FINANCE_LAYOUT_SCHEMA_VERSION);
    expect(parsed.widgets).toEqual(['laba-rugi', 'saldo-kas']);
    expect(parsed.updatedAt).toBeDefined();

    expect(getFinanceLayoutStorageKey('user-123')).toBe('cgpos_finance_layout_user-123');
    expect(getFinanceLayoutStorageKey('')).toBe('cgpos_finance_layout_default');
    expect(getFinanceLayoutStorageKey(undefined)).toBe('cgpos_finance_layout_default');
  });
});

