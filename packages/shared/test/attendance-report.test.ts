import { describe, expect, it } from 'vitest';
import {
  attendanceTotals,
  filterAttendanceRecords,
  formatAttendanceClock,
  formatAttendanceDate,
  isoToOutletLocalInput,
  outletLocalInputToIso,
  type AttendanceRecord,
} from '../src';

const rec = (id: string, employeeId: string, name: string, inAt: string, outAt?: string, note?: string): AttendanceRecord => ({
  id,
  employeeId,
  employeeName: name,
  outletId: 'o1',
  clockInAt: inAt,
  ...(outAt ? { clockOutAt: outAt } : {}),
  ...(note ? { note } : {}),
  edited: false,
});

describe('helper laporan absensi dashboard', () => {
  it('menghitung 4 metrik ringkasan dengan benar', () => {
    const records = [
      rec('1', 'a', 'Sari', '2026-11-12T01:00:00.000Z', '2026-11-12T09:00:00.000Z'), // 480m
      rec('2', 'b', 'Budi', '2026-11-12T02:00:00.000Z', '2026-11-12T06:00:00.000Z'), // 240m
      rec('3', 'c', 'Dewi', '2026-11-12T03:00:00.000Z'), // masih masuk
    ];
    const open = [{ employeeId: 'c', clockInAt: '2026-11-12T03:00:00.000Z' }];
    expect(attendanceTotals(records, open)).toEqual({
      openCount: 1,
      recordCount: 3,
      completedCount: 2,
      totalMinutes: 720,
      avgMinutes: 360,
    });
    expect(attendanceTotals([], [])).toEqual({
      openCount: 0,
      recordCount: 0,
      completedCount: 0,
      totalMinutes: 0,
      avgMinutes: 0,
    });
  });

  it('menyaring catatan berdasar karyawan dan kata kunci nama/catatan', () => {
    const rows = [
      rec('1', 'e-sari', 'Sari', '2026-11-12T01:00:00.000Z', undefined, 'Shift pagi'),
      rec('2', 'e-budi', 'Budi', '2026-11-12T02:00:00.000Z', undefined, 'Ganti jadwal'),
    ];
    expect(filterAttendanceRecords(rows, { employeeId: 'e-sari' }).map((r) => r.id)).toEqual(['1']);
    expect(filterAttendanceRecords(rows, { search: 'jadwal' }).map((r) => r.id)).toEqual(['2']);
    expect(filterAttendanceRecords(rows, { search: 'sari' }).map((r) => r.id)).toEqual(['1']);
  });

  it('mengonversi ISO <-> datetime-local zona waktu outlet dan memformat tanggal/jam', () => {
    expect(formatAttendanceClock('2026-11-12T01:05:00.000Z', 'Asia/Jakarta')).toBe('08.05');
    expect(formatAttendanceClock('2026-11-12T01:05:00.000Z', 'Asia/Makassar')).toBe('09.05');
    expect(formatAttendanceDate('2026-11-12T01:05:00.000Z', 'Asia/Jakarta')).toContain('2026');
    expect(isoToOutletLocalInput('2026-11-12T01:05:00.000Z', 'Asia/Jakarta')).toBe('2026-11-12T08:05');
    expect(outletLocalInputToIso('2026-11-12T08:05', 'Asia/Jakarta')).toBe('2026-11-12T01:05:00.000Z');
    expect(outletLocalInputToIso('2026-11-12T09:05', 'Asia/Makassar')).toBe('2026-11-12T01:05:00.000Z');
    expect(outletLocalInputToIso('2026-02-30T10:00', 'Asia/Jakarta')).toBeNull();
    expect(outletLocalInputToIso('', 'Asia/Jakarta')).toBeNull();
  });
});

