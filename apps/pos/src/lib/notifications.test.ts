import { describe, expect, it } from 'vitest';
import { notificationsFor, unreadCount } from './notifications';

const n = (id: string, at: string, employeeId?: string) => ({ id, title: id, body: 'x', createdAt: at, ...(employeeId ? { employeeId } : {}) });
describe('pesan karyawan di kasir', () => {
  const all = [n('a', '2026-11-01T01:00:00Z'), n('b', '2026-11-02T01:00:00Z', 'e1'), n('c', '2026-11-03T01:00:00Z', 'e2')];
  it('menyaring untuk karyawan: miliknya dan untuk semua, terbaru dulu', () => {
    expect(notificationsFor(all, 'e1').map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('menghitung yang belum dibaca', () => {
    expect(unreadCount(all, null)).toBe(3);
    expect(unreadCount(notificationsFor(all, 'e1'), '2026-11-01T01:00:00Z')).toBe(1);
  });
});
