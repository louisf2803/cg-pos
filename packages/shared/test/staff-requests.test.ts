import { describe, expect, it } from 'vitest';
import { leaveEarliestStart, leaveProblem, requestErrorMessage } from '../src';

describe('pengajuan karyawan', () => {
  const today = '2026-11-17';
  it('cuti H-2, sakit mulai kemarin', () => {
    expect(leaveEarliestStart('leave', today)).toBe('2026-11-19');
    expect(leaveEarliestStart('sick', today)).toBe('2026-11-16');
  });
  it('memvalidasi bentuk pengajuan', () => {
    const base = { kind: 'leave' as const, start: '2026-11-19', end: '2026-11-20', reason: 'acara', today };
    expect(leaveProblem(base)).toBeNull();
    expect(leaveProblem({ ...base, start: '2026-11-18', end: '2026-11-18' })).toMatch(/2 hari/);
    expect(leaveProblem({ ...base, reason: ' ' })).toMatch(/Alasan/);
    expect(leaveProblem({ ...base, end: '2026-11-18' })).toMatch(/sebelum/);
    expect(leaveProblem({ ...base, end: '2026-12-10' })).toMatch(/Maksimal/);
    expect(leaveProblem({ ...base, kind: 'sick', start: today, end: today })).toBeNull();
    expect(leaveProblem({ ...base, kind: 'sick', start: '2026-11-25', end: '2026-11-25' })).toMatch(/Sakit/);
  });
  it('menerjemahkan galat server', () => {
    expect(requestErrorMessage('day full 2026-11-20')).toMatch(/2 orang/);
    expect(requestErrorMessage('active advance')).toMatch(/satu kasbon/);
    expect(requestErrorMessage('lain')).toBe('lain');
  });
});

import { staffAccountProblem, staffLoginEmail, staffUsername } from '../src';
describe('akun login karyawan', () => {
  it('username menjadi email bayangan dan sebaliknya', () => {
    expect(staffLoginEmail(' Sari.Barista ')).toBe('sari.barista@karyawan.cgpos.app');
    expect(staffLoginEmail('a@b.com')).toBe('a@b.com');
    expect(staffUsername('sari.barista@karyawan.cgpos.app')).toBe('sari.barista');
    expect(staffUsername('a@b.com')).toBe('a@b.com');
  });
  it('memvalidasi username dan kata sandi', () => {
    expect(staffAccountProblem({ username: 'sari', password: '12345678' })).toBeNull();
    expect(staffAccountProblem({ username: 'ab', password: '12345678' })).toMatch(/Username/);
    expect(staffAccountProblem({ username: 'Sari Barista', password: '12345678' })).toMatch(/Username/);
    expect(staffAccountProblem({ username: 'sari', password: '1234567' })).toMatch(/minimal 8/);
    expect(staffAccountProblem({ username: '', password: '12345678', reset: true })).toBeNull();
  });
});
