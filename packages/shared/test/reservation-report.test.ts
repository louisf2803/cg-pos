import { describe, expect, it } from 'vitest';
import type { Appointment } from '../src/appointment';
import { buildReservationReport, daysInRange, reservationReportProblem, toReservationReportCsv, weekdayIndex } from '../src/reservation-report';

const appt = (id: string, date: string, s: string, e: string, over: Partial<Appointment> = {}): Appointment => ({
  id, kind: 'facility', targetName: 'Ruang A', customerName: 'Budi', customerPhone: '08', date, startTime: s, endTime: e,
  startAt: `${date}T${s}`, endAt: `${date}T${e}`, status: 'confirmed', createdAt: '2026-11-01T00:00:00Z', ...over,
});
const opt = { from: '2026-11-09', to: '2026-11-15', openAt: '08:00', closeAt: '20:00' };

describe('pembantu tanggal', () => {
  it('jumlah hari dan hari dalam pekan', () => {
    expect(daysInRange('2026-11-09', '2026-11-15')).toBe(7);
    expect(daysInRange('2026-11-15', '2026-11-09')).toBe(0);
    expect(weekdayIndex('2026-11-09')).toBe(0);
    expect(weekdayIndex('2026-11-15')).toBe(6);
  });
  it('validasi pilihan', () => {
    expect(reservationReportProblem(opt)).toBeNull();
    expect(reservationReportProblem({ ...opt, to: '2026-11-01' })).toMatch(/Rentang/);
    expect(reservationReportProblem({ ...opt, closeAt: '07:00' })).toMatch(/setelah jam buka/);
    expect(reservationReportProblem({ ...opt, openAt: '8' })).toMatch(/JJ:MM/);
  });
});

describe('laporan reservasi', () => {
  it('menghitung total, status, pembatalan, dan pemakaian per ruangan', () => {
    const rows = [
      appt('1', '2026-11-09', '09:00', '11:00'),
      appt('2', '2026-11-10', '09:00', '10:00', { status: 'completed' }),
      appt('3', '2026-11-10', '13:00', '14:00', { status: 'cancelled' }),
      appt('4', '2026-11-10', '10:00', '11:00', { targetName: 'Ruang B' }),
      appt('5', '2026-12-01', '10:00', '11:00'),
    ];
    const r = buildReservationReport(rows, opt);
    expect(r.total).toBe(4);
    expect(r.byStatus).toMatchObject({ confirmed: 2, completed: 1, cancelled: 1, pending: 0 });
    expect(r.cancellationPct).toBe(25);
    const a = r.targets.find((t) => t.targetName === 'Ruang A')!;
    expect(a).toMatchObject({ bookings: 3, cancelled: 1, bookedMinutes: 180, availableMinutes: 7 * 12 * 60 });
    expect(a.utilizationPct).toBe(3.6);
    expect(r.targets[0]!.targetName).toBe('Ruang A');
  });
  it('memotong di luar jam operasional dan menghitung per jam dan per hari', () => {
    const r = buildReservationReport([appt('1', '2026-11-09', '07:00', '09:30'), appt('2', '2026-11-14', '19:00', '23:00')], opt);
    expect(r.targets[0]!.bookedMinutes).toBe(90 + 60);
    expect(r.byHour[8]).toBe(60);
    expect(r.byHour[9]).toBe(30);
    expect(r.byHour[7]).toBe(0);
    expect(r.byHour[19]).toBe(60);
    expect(r.byHour[20]).toBe(0);
    expect(r.byWeekday[0]).toBe(90);
    expect(r.byWeekday[5]).toBe(60);
  });
  it('tanpa data: nol, bukan NaN', () => {
    const r = buildReservationReport([], opt);
    expect(r).toMatchObject({ total: 0, cancellationPct: 0, targets: [] });
    expect(r.byHour.every((n) => n === 0)).toBe(true);
  });
  it('ekspor CSV memuat ruangan dan persen pemakaian', () => {
    const csv = toReservationReportCsv(buildReservationReport([appt('1', '2026-11-09', '09:00', '11:00')], opt), { service: 'Jasa', facility: 'Fasilitas', table: 'Meja' });
    expect(csv).toContain('Ruang A');
    expect(csv).toContain('Fasilitas');
    expect(csv).toContain('2.4');
  });
});
