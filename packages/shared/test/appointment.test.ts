import { describe, expect, it } from 'vitest';
import {
  appointmentProblem,
  appointmentsOverlap,
  buildCalendarMonth,
  findAppointmentConflict,
  type Appointment,
} from '../src/appointment';

const EXISTING: Appointment[] = [
  {
    id: 'apt-1',
    kind: 'table',
    targetId: 't-1',
    targetName: 'Meja 1',
    customerName: 'Rina',
    customerPhone: '081234567890',
    date: '2026-11-15',
    startTime: '18:00',
    endTime: '20:00',
    startAt: '2026-11-15T18:00',
    endAt: '2026-11-15T20:00',
    status: 'confirmed',
    createdAt: '2026-11-11T08:00:00Z',
  },
  {
    id: 'apt-2',
    kind: 'service',
    targetName: 'Potong rambut pria',
    customerName: 'Andi',
    customerPhone: '081200001111',
    date: '2026-11-15',
    startTime: '10:00',
    endTime: '11:00',
    startAt: '2026-11-15T10:00',
    endAt: '2026-11-15T11:00',
    status: 'cancelled',
    createdAt: '2026-11-11T08:00:00Z',
  },
];

describe('appointment helpers', () => {
  it('detects overlapping intervals cleanly and allows adjacent slots', () => {
    expect(appointmentsOverlap('2026-11-15', '18:00', '20:00', '2026-11-15', '19:00', '21:00')).toBe(true);
    expect(appointmentsOverlap('2026-11-15', '18:00', '20:00', '2026-11-15', '20:00', '21:30')).toBe(false);
    expect(appointmentsOverlap('2026-11-15', '18:00', '20:00', '2026-11-16', '18:30', '19:30')).toBe(false);
  });

  it('finds conflict on active same kind & target, and ignores cancelled or different target', () => {
    const conflict = findAppointmentConflict(
      {
        kind: 'table',
        targetId: 't-1',
        targetName: 'Meja 1',
        customerName: 'Budi',
        customerPhone: '0813',
        date: '2026-11-15',
        startTime: '19:00',
        endTime: '20:30',
      },
      EXISTING,
    );
    expect(conflict?.id).toBe('apt-1');

    // Adjacent table slot allowed
    expect(
      findAppointmentConflict(
        {
          kind: 'table',
          targetId: 't-1',
          targetName: 'Meja 1',
          customerName: 'Budi',
          customerPhone: '0813',
          date: '2026-11-15',
          startTime: '20:00',
          endTime: '21:00',
        },
        EXISTING,
      ),
    ).toBeNull();

    // Cancelled appointment on same service slot should not block new booking
    expect(
      findAppointmentConflict(
        {
          kind: 'service',
          targetName: 'potong rambut pria',
          customerName: 'Citra',
          customerPhone: '0814',
          date: '2026-11-15',
          startTime: '10:00',
          endTime: '11:00',
        },
        EXISTING,
      ),
    ).toBeNull();
  });

  it('validates times, required fields, and conflicting schedules in appointmentProblem', () => {
    expect(
      appointmentProblem(
        {
          kind: 'table',
          targetId: 't-1',
          targetName: 'Meja 1',
          customerName: 'Budi',
          customerPhone: '0813999888',
          date: '2026-11-15',
          startTime: '20:00',
          endTime: '19:00',
        },
        EXISTING,
      ),
    ).toMatch(/lebih akhir/i);

    expect(
      appointmentProblem(
        {
          kind: 'table',
          targetId: 't-1',
          targetName: 'Meja 1',
          customerName: 'Budi',
          customerPhone: '0813999888',
          date: '2026-11-15',
          startTime: '17:30',
          endTime: '18:30',
        },
        EXISTING,
      ),
    ).toMatch(/Jadwal bentrok/i);

    expect(
      appointmentProblem(
        {
          kind: 'table',
          targetId: 't-2',
          targetName: 'Meja 2',
          customerName: 'Budi',
          customerPhone: '0813999888',
          date: '2026-11-15',
          startTime: '18:00',
          endTime: '20:00',
        },
        EXISTING,
      ),
    ).toBeNull();
  });

  it('builds a Monday-first calendar grid with active counts ignoring cancelled', () => {
    // 2026-11-01 is Sunday -> 6 leading nulls (Mon..Sat), 30 days, padded to multiple of 7
    const grid = buildCalendarMonth(2026, 11, EXISTING);
    expect(grid.label).toBe('November 2026');
    expect(grid.cells.length % 7).toBe(0);
    expect(grid.cells.slice(0, 6).every((c) => c === null)).toBe(true);
    const nov15 = grid.cells.find((c) => c?.dateKey === '2026-11-15');
    expect(nov15).toBeTruthy();
    expect(nov15?.appointments.length).toBe(2);
    expect(nov15?.activeCount).toBe(1);
  });
});

