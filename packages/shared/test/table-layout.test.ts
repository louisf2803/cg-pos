import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TABLE_SETTINGS,
  MAX_TABLE_LABEL_LENGTH,
  clampPct,
  clampTablePosition,
  createDecorElement,
  defaultGridPositions,
  formatTableLabel,
  isValidTablePosition,
  sanitizeDecorElements,
  sanitizeTableSettings,
  summarizeTableSettings,
  tableSettingsProblem,
  type TableSettings,
} from '../src/table-layout';

describe('table-layout helpers', () => {
  it('clamps percentages and coordinates strictly within 0-100%', () => {
    expect(clampPct(-12)).toBe(0);
    expect(clampPct(134.56)).toBe(100);
    expect(clampPct(45.678)).toBe(45.7);
    expect(clampPct(Number.NaN)).toBe(0);

    expect(clampTablePosition({ xPct: -5, yPct: 120 })).toEqual({ xPct: 0, yPct: 100 });
    expect(clampTablePosition({ xPct: 33.34, yPct: 66.66 })).toEqual({ xPct: 33.3, yPct: 66.7 });
  });

  it('validates coordinates bounds', () => {
    expect(isValidTablePosition({ xPct: 0, yPct: 100 })).toBe(true);
    expect(isValidTablePosition({ xPct: 50.5, yPct: 22.3 })).toBe(true);
    expect(isValidTablePosition({ xPct: -0.1, yPct: 50 })).toBe(false);
    expect(isValidTablePosition({ xPct: 50, yPct: 100.1 })).toBe(false);
    expect(isValidTablePosition({ xPct: Number.POSITIVE_INFINITY, yPct: 10 })).toBe(false);
  });

  it('builds deterministic grid positions within 0-100% bounds', () => {
    const positions = defaultGridPositions(['m1', 'm2', 'm3', 'm4', 'm5'], 4);
    expect(Object.keys(positions)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    Object.values(positions).forEach((pos) => {
      expect(isValidTablePosition(pos)).toBe(true);
    });
    expect(positions.m1.xPct).toBeLessThan(positions.m2.xPct);
    expect(positions.m5.yPct).toBeGreaterThan(positions.m1.yPct);
  });

  it('formats labels up to 20 characters', () => {
    expect(formatTableLabel('  VIP Lantai 2  ')).toBe('VIP Lantai 2');
    const veryLong = 'Meja Khusus Keluarga Besar Sekali';
    const trimmed = formatTableLabel(veryLong);
    expect(trimmed.length).toBeLessThanOrEqual(MAX_TABLE_LABEL_LENGTH);
    expect(trimmed).toBe('Meja Khusus Keluarga');
  });

  it('enforces reminder dependency and time limit > reminder validation', () => {
    const sanitizedOff = sanitizeTableSettings({
      timeLimitEnabled: false,
      reminderEnabled: true,
    });
    expect(sanitizedOff.reminderEnabled).toBe(false);

    expect(
      tableSettingsProblem({
        ...DEFAULT_TABLE_SETTINGS,
        timeLimitEnabled: true,
        timeLimitMinutes: 30,
        reminderEnabled: true,
        reminderBeforeMinutes: 30,
      }),
    ).toBe('Batas waktu harus lebih besar dari pengingat waktu.');

    expect(
      tableSettingsProblem({
        ...DEFAULT_TABLE_SETTINGS,
        timeLimitEnabled: true,
        timeLimitMinutes: 20,
        reminderEnabled: true,
        reminderBeforeMinutes: 25,
      }),
    ).toBe('Batas waktu harus lebih besar dari pengingat waktu.');

    expect(
      tableSettingsProblem({
        ...DEFAULT_TABLE_SETTINGS,
        timeLimitEnabled: true,
        timeLimitMinutes: 90,
        reminderEnabled: true,
        reminderBeforeMinutes: 15,
      }),
    ).toBeNull();
  });

  it('validates minimum bill and label rules', () => {
    expect(
      tableSettingsProblem({
        ...DEFAULT_TABLE_SETTINGS,
        minBillEnabled: true,
        minBill: 0,
      }),
    ).toBe('Minimum tagihan harus lebih besar dari Rp 0.');

    expect(
      tableSettingsProblem({
        ...DEFAULT_TABLE_SETTINGS,
        labelEnabled: true,
        label: '   ',
      }),
    ).toBe('Label meja tidak boleh kosong saat diaktifkan.');

    expect(
      tableSettingsProblem({
        ...DEFAULT_TABLE_SETTINGS,
        labelEnabled: true,
        label: '123456789012345678901',
      }),
    ).toBe('Label meja maksimal 20 karakter.');
  });

  it('summarizes active table settings concisely', () => {
    const tags = summarizeTableSettings({
      timeLimitEnabled: true,
      timeLimitMinutes: 90,
      reminderEnabled: true,
      reminderBeforeMinutes: 10,
      minBillEnabled: true,
      minBill: 150000,
      labelEnabled: true,
      label: 'VIP Pojok',
    });
    expect(tags).toHaveLength(3);
    expect(tags[0]).toBe('VIP Pojok');
    expect(tags[1]).toBe('90 mnt (ingat -10)');
    expect(tags[2]).toContain('150');
  });

  it('defaults legacy settings without minBillMode to izinkan and validates modes when enabled', () => {
    const legacy = sanitizeTableSettings({
      minBillEnabled: true,
      minBill: 100000,
    });
    expect(legacy.minBillMode).toBe('izinkan');
    expect(tableSettingsProblem(legacy)).toBeNull();

    // Only relevant when minBillEnabled is true: invalid mode ignored when disabled
    const disabledWithWeirdMode = {
      ...DEFAULT_TABLE_SETTINGS,
      minBillEnabled: false,
      minBillMode: 'invalid' as TableSettings['minBillMode'],
    };
    expect(tableSettingsProblem(disabledWithWeirdMode)).toBeNull();

    const enabledWithWeirdMode = {
      ...DEFAULT_TABLE_SETTINGS,
      minBillEnabled: true,
      minBill: 50000,
      minBillMode: 'invalid' as TableSettings['minBillMode'],
    };
    expect(tableSettingsProblem(enabledWithWeirdMode)).toBe(
      'Mode perilaku minimum tagihan tidak valid.',
    );

    const wajibTags = summarizeTableSettings({
      ...DEFAULT_TABLE_SETTINGS,
      minBillEnabled: true,
      minBill: 75000,
      minBillMode: 'wajib',
    });
    expect(wajibTags[0]).toContain('Wajib');
  });

  it('creates and sanitizes decorative canvas elements safely', () => {
    const el = createDecorElement('dec-1', 'tanaman', 120, -10, 'floor-1');
    expect(el).toEqual({
      id: 'dec-1',
      type: 'tanaman',
      xPct: 100,
      yPct: 0,
      floorId: 'floor-1',
    });

    const cleaned = sanitizeDecorElements([
      el,
      { id: 'dec-2', type: 'dinding', xPct: 35, yPct: 45 },
      { id: 'bad', type: 'unknown', xPct: 10, yPct: 10 },
      null,
      { id: '', type: 'pintu', xPct: 20, yPct: 20 },
    ]);
    expect(cleaned).toHaveLength(2);
    expect(cleaned.map((c) => c.type)).toEqual(['tanaman', 'dinding']);
  });
});

