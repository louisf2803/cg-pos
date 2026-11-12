import type { AttendanceRecord, AttendanceInput } from './types';

/** Lama kerja dalam menit penuh; kosong bila belum clock out atau waktunya tidak masuk akal. */
export function attendanceMinutes(clockInAt: string, clockOutAt?: string): number | undefined {
  if (!clockOutAt) return undefined;
  const a = Date.parse(clockInAt), b = Date.parse(clockOutAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return undefined;
  return Math.floor((b - a) / 60000);
}

/** "8 jam 05 menit" untuk tampilan; 0 menit tampil "0 menit". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? `${h} jam ${String(r).padStart(2, '0')} menit` : `${r} menit`;
}

/** Pesan galat untuk koreksi absensi oleh pengelola, atau null bila boleh. now dipakai untuk menolak jam di masa depan (toleransi 5 menit). */
export function attendanceProblem(input: Pick<AttendanceInput, 'clockInAt' | 'clockOutAt'>, now: Date = new Date()): string | null {
  const a = Date.parse(input.clockInAt);
  if (!Number.isFinite(a)) return 'Isi jam masuk yang valid.';
  const limit = now.getTime() + 5 * 60000;
  if (a > limit) return 'Jam masuk tidak boleh di masa depan.';
  if (input.clockOutAt) {
    const b = Date.parse(input.clockOutAt);
    if (!Number.isFinite(b)) return 'Isi jam pulang yang valid.';
    if (b < a) return 'Jam pulang tidak boleh sebelum jam masuk.';
    if (b > limit) return 'Jam pulang tidak boleh di masa depan.';
  }
  return null;
}

export interface AttendanceSummaryRow { employeeId: string; employeeName: string; shifts: number; minutes: number; open: boolean }

/** Ringkasan per karyawan: jumlah catatan, total menit (hanya yang sudah clock out), dan apakah masih ada yang terbuka. Urut nama. */
export function summarizeAttendance(records: AttendanceRecord[]): AttendanceSummaryRow[] {
  const by = new Map<string, AttendanceSummaryRow>();
  for (const r of records) {
    const row = by.get(r.employeeId) ?? { employeeId: r.employeeId, employeeName: r.employeeName, shifts: 0, minutes: 0, open: false };
    row.shifts += 1;
    if (r.clockOutAt) row.minutes += attendanceMinutes(r.clockInAt, r.clockOutAt) ?? 0;
    else row.open = true;
    by.set(r.employeeId, row);
  }
  return [...by.values()].sort((x, y) => x.employeeName.localeCompare(y.employeeName, 'id'));
}
