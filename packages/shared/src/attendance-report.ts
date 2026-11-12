import { attendanceMinutes } from './attendance';
import type { AttendanceOpen, AttendanceRecord } from './types';

const TZ_OFFSETS: Record<string, string> = {
  'Asia/Jakarta': '+07:00',
  'Asia/Makassar': '+08:00',
  'Asia/Jayapura': '+09:00',
};

export interface AttendanceStats {
  openCount: number;
  recordCount: number;
  completedCount: number;
  totalMinutes: number;
  avgMinutes: number;
}

/** Hitung ringkasan 4 kartu absensi (karyawan masuk, total catatan, total & rata-rata jam kerja). */
export function attendanceTotals(records: AttendanceRecord[], openList: AttendanceOpen[]): AttendanceStats {
  let completedCount = 0;
  let totalMinutes = 0;
  for (const r of records) {
    const mins = r.minutes ?? attendanceMinutes(r.clockInAt, r.clockOutAt);
    if (mins !== undefined) {
      completedCount += 1;
      totalMinutes += mins;
    }
  }
  return {
    openCount: openList.length,
    recordCount: records.length,
    completedCount,
    totalMinutes,
    avgMinutes: completedCount > 0 ? Math.round(totalMinutes / completedCount) : 0,
  };
}

/** Saring catatan absensi berdasarkan pilihan karyawan dan pencarian nama/catatan. */
export function filterAttendanceRecords(
  records: AttendanceRecord[],
  filter: { employeeId?: string; search?: string },
): AttendanceRecord[] {
  const empId = filter.employeeId?.trim() || '';
  const q = filter.search?.trim().toLowerCase() || '';
  return records.filter((r) => {
    if (empId && r.employeeId !== empId) return false;
    if (!q) return true;
    return r.employeeName.toLowerCase().includes(q) || (r.note ?? '').toLowerCase().includes(q);
  });
}

/** Format tanggal absensi di zona waktu outlet (mis. "12 Nov 2026"). */
export function formatAttendanceDate(iso: string, timeZone = 'Asia/Jakarta'): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ms));
}

/** Format jam absensi HH.MM di zona waktu outlet (mis. "08.05"). */
export function formatAttendanceClock(iso: string, timeZone = 'Asia/Jakarta'): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}.${m}`;
}

/** Ubah ISO UTC menjadi nilai input datetime-local "YYYY-MM-DDTHH:mm" dalam zona waktu outlet. */
export function isoToOutletLocalInput(iso: string, timeZone = 'Asia/Jakarta'): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Ubah nilai input datetime-local "YYYY-MM-DDTHH:mm" (zona outlet) ke ISO UTC, atau null bila tidak sah. */
export function outletLocalInputToIso(localValue: string, timeZone = 'Asia/Jakarta'): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localValue.trim());
  if (!m) return null;
  const [, yy, mm, dd, hh, mi, ss] = m;
  const offset = TZ_OFFSETS[timeZone] ?? '+07:00';
  const iso = `${yy}-${mm}-${dd}T${hh}:${mi}:${ss ?? '00'}${offset}`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const utc = new Date(ms).toISOString();
  if (isoToOutletLocalInput(utc, timeZone) !== `${yy}-${mm}-${dd}T${hh}:${mi}`) return null;
  return utc;
}

