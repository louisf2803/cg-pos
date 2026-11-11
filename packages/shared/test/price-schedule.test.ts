import { describe, expect, it } from 'vitest';
import {
  getPriceScheduleStatus,
  partitionPriceSchedules,
  resolveScheduledPrice,
  validatePriceScheduleInput,
  type PriceSchedule,
} from '../src/price-schedule';

const BASE_SCHEDULES: PriceSchedule[] = [
  {
    id: 'sch-old-active',
    productId: 'p1',
    newPrice: 22000,
    startAt: '2026-11-11T08:00:00+07:00',
    endAt: '2026-11-11T18:00:00+07:00',
    createdAt: '2026-11-10T10:00:00Z',
    note: 'Promo pagi',
  },
  {
    id: 'sch-newer-active',
    productId: 'p1',
    newPrice: 19500,
    startAt: '2026-11-11T10:00:00+07:00',
    endAt: '2026-11-11T15:00:00+07:00',
    createdAt: '2026-11-11T01:00:00Z',
    note: 'Flash sale siang (lebih baru dibuat)',
  },
  {
    id: 'sch-expired',
    productId: 'p1',
    newPrice: 15000,
    startAt: '2026-11-10T08:00:00+07:00',
    endAt: '2026-11-10T20:00:00+07:00',
    createdAt: '2026-11-11T02:00:00Z', // created recently, but already expired
    note: 'Sudah berakhir',
  },
  {
    id: 'sch-upcoming',
    productId: 'p1',
    newPrice: 21000,
    startAt: '2026-11-12T08:00:00+07:00',
    endAt: null,
    createdAt: '2026-11-11T03:00:00Z',
    note: 'Mulai besok tanpa batas akhir',
  },
];

describe('price-schedule', () => {
  it('validates inputs including optional endAt after startAt', () => {
    expect(
      validatePriceScheduleInput({
        productId: 'p1',
        newPrice: 18000,
        startAt: '2026-11-11T09:00:00+07:00',
        endAt: '2026-11-11T17:00:00+07:00',
      }),
    ).toBeNull();

    expect(
      validatePriceScheduleInput({
        productId: 'p1',
        newPrice: 18000,
        startAt: '2026-11-11T09:00:00+07:00',
        endAt: '',
      }),
    ).toBeNull();

    expect(
      validatePriceScheduleInput({
        productId: 'p1',
        newPrice: 18000,
        startAt: '2026-11-11T17:00:00+07:00',
        endAt: '2026-11-11T09:00:00+07:00',
      }),
    ).toContain('lebih akhir');
  });

  it('picks the most recently created schedule when two active schedules overlap', () => {
    const res = resolveScheduledPrice(BASE_SCHEDULES, 'p1', 25000, '2026-11-11T12:00:00+07:00');
    expect(res.isScheduled).toBe(true);
    expect(res.effectivePrice).toBe(19500);
    expect(res.activeSchedule?.id).toBe('sch-newer-active');
  });

  it('ignores expired schedules even if created later and reverts to older active or basePrice', () => {
    // At 16:00, sch-newer-active has ended, sch-expired is expired, sch-old-active is still active
    const at16 = resolveScheduledPrice(BASE_SCHEDULES, 'p1', 25000, '2026-11-11T16:00:00+07:00');
    expect(at16.isScheduled).toBe(true);
    expect(at16.effectivePrice).toBe(22000);
    expect(at16.activeSchedule?.id).toBe('sch-old-active');

    // At 18:00 exactly (half-open end boundary), all today schedules are expired -> basePrice
    const at18 = resolveScheduledPrice(BASE_SCHEDULES, 'p1', 25000, '2026-11-11T18:00:00+07:00');
    expect(at18.isScheduled).toBe(false);
    expect(at18.effectivePrice).toBe(25000);
    expect(at18.activeSchedule).toBeNull();
  });

  it('keeps open-ended schedule active once startAt is reached', () => {
    const tomorrow = '2026-11-20T10:00:00+07:00';
    expect(getPriceScheduleStatus(BASE_SCHEDULES[3]!, tomorrow)).toBe('active');
    const resolved = resolveScheduledPrice(BASE_SCHEDULES, 'p1', 25000, tomorrow);
    expect(resolved.effectivePrice).toBe(21000);

    const partitioned = partitionPriceSchedules(BASE_SCHEDULES, '2026-11-11T12:00:00+07:00');
    expect(partitioned.active.map((s) => s.id)).toEqual(['sch-old-active', 'sch-newer-active']);
    expect(partitioned.upcoming.map((s) => s.id)).toEqual(['sch-upcoming']);
    expect(partitioned.expired.map((s) => s.id)).toEqual(['sch-expired']);
  });
});

