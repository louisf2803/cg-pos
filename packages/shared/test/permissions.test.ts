import { describe, expect, it } from 'vitest';
import { accessFor, DEFAULT_IDLE_LOCK_MINUTES, formatRole, IDLE_LOCK_CHOICES, normalizeIdleLock, PERMISSIONS, ROLE_ACCESS } from '../src';

describe('hak akses per peran', () => {
  it('formatRole memetakan peran bahasa Inggris ke Bahasa Indonesia', () => {
    expect(formatRole('owner')).toBe('Pemilik');
    expect(formatRole('Owner')).toBe('Pemilik');
    expect(formatRole('manager')).toBe('Manajer');
    expect(formatRole('Manager')).toBe('Manajer');
    expect(formatRole('cashier')).toBe('Kasir');
    expect(formatRole('Cashier')).toBe('Kasir');
    expect(formatRole('pemilik')).toBe('Pemilik');
    expect(formatRole('manajer')).toBe('Manajer');
    expect(formatRole('kasir')).toBe('Kasir');
    expect(formatRole(undefined)).toBe('Kasir');
    expect(formatRole(null)).toBe('Kasir');
    expect(formatRole('')).toBe('Kasir');
  });

  it('setiap peran punya jawaban untuk setiap izin', () => {
    for (const role of ['owner', 'manager', 'cashier'] as const) {
      for (const p of PERMISSIONS) expect(['allow', 'approve', 'deny']).toContain(ROLE_ACCESS[role][p.id]);
    }
  });
  it('pemilik dan manajer boleh langsung; kasir perlu persetujuan untuk tindakan sensitif', () => {
    for (const p of PERMISSIONS) { expect(accessFor('owner', p.id)).toBe('allow'); expect(accessFor('manager', p.id)).toBe('allow'); }
    expect(accessFor('cashier', 'sell')).toBe('allow');
    expect(accessFor('cashier', 'move_table')).toBe('allow');
    expect(accessFor('cashier', 'close_shift')).toBe('allow');
    for (const p of ['void_order', 'refund', 'merge_tables', 'discard_pending'] as const) expect(accessFor('cashier', p)).toBe('approve');
    expect(accessFor('cashier', 'device_settings')).toBe('deny');
    expect(accessFor('cashier', 'see_expected_cash')).toBe('deny');
  });
  it('jeda kunci layar: nilai sah dipertahankan, selain itu kembali ke bawaan', () => {
    for (const m of IDLE_LOCK_CHOICES) expect(normalizeIdleLock(m)).toBe(m);
    for (const bad of [3, -1, '5', null, undefined, NaN]) expect(normalizeIdleLock(bad)).toBe(DEFAULT_IDLE_LOCK_MINUTES);
  });
});
