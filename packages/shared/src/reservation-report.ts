// Laporan reservasi dan utilisasi (A136): dihitung dari data reservasi (A143). Murni; tanpa akses data.
import type { Appointment, AppointmentKind, AppointmentStatus } from './appointment';
import { toMinutesOfDay } from './appointment';
import { toCsv } from './report';

export interface ReservationReportOptions {
  /** rentang tanggal lokal, kedua ujung termasuk (YYYY-MM-DD) */
  from: string;
  to: string;
  /** jam operasional harian (HH:mm); dasar menghitung tingkat pemakaian */
  openAt: string;
  closeAt: string;
}

export interface TargetUsage {
  kind: AppointmentKind; targetName: string;
  bookings: number; cancelled: number;
  /** menit terpakai oleh reservasi yang tidak dibatalkan (dipotong pada jam operasional) */
  bookedMinutes: number; availableMinutes: number;
  /** 0-100, satu angka di belakang koma */
  utilizationPct: number;
}

export interface ReservationReport {
  days: number; openMinutesPerDay: number;
  total: number; byStatus: Record<AppointmentStatus, number>;
  /** persentase pembatalan terhadap semua reservasi (0 bila belum ada) */
  cancellationPct: number;
  targets: TargetUsage[];
  /** menit terpakai per jam (indeks 0-23) */
  byHour: number[];
  /** menit terpakai per hari; indeks 0 = Senin ... 6 = Minggu */
  byWeekday: number[];
}

/** Jumlah hari dalam rentang (kedua ujung termasuk); 0 bila terbalik atau tidak valid. */
export function daysInRange(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** 0 = Senin ... 6 = Minggu untuk tanggal YYYY-MM-DD. */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function reservationReportProblem(o: ReservationReportOptions): string | null {
  if (daysInRange(o.from, o.to) === 0) return 'Rentang tanggal tidak valid.';
  const open = toMinutesOfDay(o.openAt), close = toMinutesOfDay(o.closeAt);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return 'Jam operasional harus berformat JJ:MM.';
  if (close <= open) return 'Jam tutup harus setelah jam buka.';
  return null;
}

export function buildReservationReport(rows: readonly Appointment[], o: ReservationReportOptions): ReservationReport {
  const open = toMinutesOfDay(o.openAt), close = toMinutesOfDay(o.closeAt);
  const days = daysInRange(o.from, o.to);
  const openPerDay = Math.max(0, close - open);
  const inRange = rows.filter((r) => r.date >= o.from && r.date <= o.to);
  const byStatus: Record<AppointmentStatus, number> = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
  const byHour = new Array<number>(24).fill(0);
  const byWeekday = new Array<number>(7).fill(0);
  const map = new Map<string, TargetUsage>();
  for (const r of inRange) {
    byStatus[r.status] += 1;
    const key = `${r.kind}|${(r.targetId ?? r.targetName).toLowerCase()}`;
    const t = map.get(key) ?? { kind: r.kind, targetName: r.targetName, bookings: 0, cancelled: 0, bookedMinutes: 0, availableMinutes: days * openPerDay, utilizationPct: 0 };
    t.bookings += 1;
    if (r.status === 'cancelled') { t.cancelled += 1; map.set(key, t); continue; }
    const s = Math.max(toMinutesOfDay(r.startTime), open), e = Math.min(toMinutesOfDay(r.endTime), close);
    if (e > s) {
      t.bookedMinutes += e - s;
      byWeekday[weekdayIndex(r.date)]! += e - s;
      for (let h = Math.floor(s / 60); h * 60 < e; h++) byHour[h]! += Math.min(e, (h + 1) * 60) - Math.max(s, h * 60);
    }
    map.set(key, t);
  }
  const targets = [...map.values()].map((t) => ({ ...t, utilizationPct: t.availableMinutes > 0 ? Math.round((t.bookedMinutes / t.availableMinutes) * 1000) / 10 : 0 }))
    .sort((a, b) => b.bookedMinutes - a.bookedMinutes || a.targetName.localeCompare(b.targetName));
  return {
    days, openMinutesPerDay: openPerDay, total: inRange.length, byStatus,
    cancellationPct: inRange.length > 0 ? Math.round((byStatus.cancelled / inRange.length) * 1000) / 10 : 0,
    targets, byHour, byWeekday,
  };
}

export function toReservationReportCsv(r: ReservationReport, kindLabel: Record<AppointmentKind, string>): string {
  return toCsv([
    ['Jenis', 'Nama', 'Reservasi', 'Dibatalkan', 'Menit terpakai', 'Menit tersedia', 'Pemakaian (%)'],
    ...r.targets.map((t) => [kindLabel[t.kind], t.targetName, t.bookings, t.cancelled, t.bookedMinutes, t.availableMinutes, t.utilizationPct]),
  ]);
}
