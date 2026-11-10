import { describe, expect, it } from 'vitest';
import { accessFor, DEFAULT_IDLE_LOCK_MINUTES, IDLE_LOCK_CHOICES, normalizeIdleLock, PERMISSIONS, ROLE_ACCESS } from '../src';

describe('hak akses per peran', () => {
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
  });
  it('jeda kunci layar: nilai sah dipertahankan, selain itu kembali ke bawaan', () => {
    for (const m of IDLE_LOCK_CHOICES) expect(normalizeIdleLock(m)).toBe(m);
    for (const bad of [3, -1, '5', null, undefined, NaN]) expect(normalizeIdleLock(bad)).toBe(DEFAULT_IDLE_LOCK_MINUTES);
  });
});
