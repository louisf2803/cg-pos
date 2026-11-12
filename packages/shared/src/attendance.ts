import { DataError, type AttendanceRecord, type AttendanceInput } from './types';

export const SELFIE_MAX_SIDE = 640;
export const SELFIE_JPEG_QUALITY = 0.7;

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

/** Hitung ukuran pengecilan selfie agar sisi terpanjang tidak melebihi `max` px dan tidak memperbesar foto kecil. */
export function selfieTargetSize(width: number, height: number, max: number = SELFIE_MAX_SIDE): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(max) || width <= 0 || height <= 0 || max <= 0) {
    return { width: 0, height: 0 };
  }
  const longest = Math.max(width, height);
  if (longest <= max) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = max / longest;
  return {
    width: Math.min(max, Math.max(1, Math.round(width * scale))),
    height: Math.min(max, Math.max(1, Math.round(height * scale))),
  };
}

/** Format jam absensi HH.MM sesuai zona waktu outlet (mis. "08.02"). */
export function formatAttendanceTime(iso: string, timeZone = 'Asia/Jakarta'): string {
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

/** Lama berjalan sejak clock in dalam menit penuh (minimal 0). */
export function attendanceOpenMinutes(clockInAt: string, now: Date = new Date()): number {
  const a = Date.parse(clockInAt);
  if (!Number.isFinite(a)) return 0;
  return Math.max(0, Math.floor((now.getTime() - a) / 60000));
}

/** Pesan konfirmasi setelah absen masuk / pulang berhasil. */
export function attendanceActionSuccessText(input: {
  kind: 'in' | 'out';
  employeeName: string;
  clockInAt: string;
  clockOutAt?: string;
  timeZone?: string;
}): string {
  const tz = input.timeZone ?? 'Asia/Jakarta';
  if (input.kind === 'in') {
    return `${input.employeeName} masuk ${formatAttendanceTime(input.clockInAt, tz)}`;
  }
  const outTime = formatAttendanceTime(input.clockOutAt ?? input.clockInAt, tz);
  const mins = attendanceMinutes(input.clockInAt, input.clockOutAt) ?? 0;
  return `${input.employeeName} pulang ${outTime}, lama kerja ${formatDuration(mins)}`;
}

/** Pesan galat ramah untuk layar absensi POS (tidak pernah menyebut sisa percobaan PIN). */
export function attendanceErrorText(err: unknown): { kind: 'bad_pin' | 'other'; message: string } {
  if (err instanceof DataError) {
    if (err.code === 'bad_pin') return { kind: 'bad_pin', message: 'PIN salah' };
    if (err.code === 'network') return { kind: 'other', message: 'Tidak ada koneksi, coba lagi' };
    if (err.code === 'invalid') return { kind: 'other', message: err.message };
    if (err.code === 'forbidden') return { kind: 'other', message: err.message || 'Tidak diizinkan mencatat absensi.' };
    return { kind: 'other', message: err.message };
  }
  return {
    kind: 'other',
    message: err instanceof Error && err.message ? err.message : 'Gagal menyimpan absensi.',
  };
}
