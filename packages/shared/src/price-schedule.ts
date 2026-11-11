export type PriceScheduleStatus = 'active' | 'upcoming' | 'expired';

export interface PriceSchedule {
  id: string;
  productId: string;
  newPrice: number;
  startAt: string;
  endAt?: string | null;
  note?: string;
  createdAt: string;
}

export interface PriceScheduleResolution {
  productId: string;
  basePrice: number;
  effectivePrice: number;
  isScheduled: boolean;
  activeSchedule: PriceSchedule | null;
}

function toMs(value: Date | number | string): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return Date.parse(value);
}

/** Memvalidasi data formulir penjadwalan harga produk. */
export function validatePriceScheduleInput(input: {
  productId: string;
  newPrice: number;
  startAt: string;
  endAt?: string | null;
}): string | null {
  if (!input.productId.trim()) {
    return 'Pilih produk terlebih dahulu.';
  }
  if (!Number.isInteger(input.newPrice) || input.newPrice < 0) {
    return 'Harga baru harus bilangan bulat minimal Rp0.';
  }
  const startMs = Date.parse(input.startAt);
  if (!Number.isFinite(startMs)) {
    return 'Tanggal dan jam mulai berlaku tidak valid.';
  }
  if (input.endAt && input.endAt.trim()) {
    const endMs = Date.parse(input.endAt);
    if (!Number.isFinite(endMs)) {
      return 'Tanggal dan jam berakhir tidak valid.';
    }
    if (endMs <= startMs) {
      return 'Waktu berakhir harus lebih akhir dari waktu mulai berlaku.';
    }
  }
  return null;
}

/** Mengklasifikasikan status jadwal harga pada waktu acuan `now`. */
export function getPriceScheduleStatus(
  schedule: Pick<PriceSchedule, 'startAt' | 'endAt'>,
  now: Date | number | string = Date.now(),
): PriceScheduleStatus {
  const nowMs = toMs(now);
  const startMs = Date.parse(schedule.startAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) {
    return 'expired';
  }
  if (nowMs < startMs) {
    return 'upcoming';
  }
  if (schedule.endAt && schedule.endAt.trim()) {
    const endMs = Date.parse(schedule.endAt);
    if (!Number.isFinite(endMs) || nowMs >= endMs) {
      return 'expired';
    }
  }
  return 'active';
}

/**
 * Menentukan harga aktif produk pada waktu `now`.
 * Bila lebih dari satu jadwal aktif bertumpuk, jadwal yang paling baru dibuat (`createdAt` terbesar) menang.
 * Jadwal yang sudah lewat diabaikan dan harga kembali ke `basePrice` jika tak ada jadwal aktif.
 */
export function resolveScheduledPrice(
  schedules: readonly PriceSchedule[],
  productId: string,
  basePrice: number,
  now: Date | number | string = Date.now(),
): PriceScheduleResolution {
  const safeBase = Math.max(0, Math.round(Number.isFinite(basePrice) ? basePrice : 0));

  const candidates = schedules
    .map((schedule, index) => ({ schedule, index }))
    .filter(
      ({ schedule }) =>
        schedule.productId === productId && getPriceScheduleStatus(schedule, now) === 'active',
    );

  if (candidates.length === 0) {
    return {
      productId,
      basePrice: safeBase,
      effectivePrice: safeBase,
      isScheduled: false,
      activeSchedule: null,
    };
  }

  candidates.sort((a, b) => {
    const createdDiff =
      (Date.parse(b.schedule.createdAt) || 0) - (Date.parse(a.schedule.createdAt) || 0);
    if (createdDiff !== 0) return createdDiff;
    const startDiff =
      (Date.parse(b.schedule.startAt) || 0) - (Date.parse(a.schedule.startAt) || 0);
    if (startDiff !== 0) return startDiff;
    return b.index - a.index;
  });

  const winner = candidates[0]!.schedule;
  return {
    productId,
    basePrice: safeBase,
    effectivePrice: Math.max(0, Math.round(winner.newPrice)),
    isScheduled: true,
    activeSchedule: winner,
  };
}

/** Memisahkan jadwal ke kelompok aktif, akan datang, dan sudah lewat. */
export function partitionPriceSchedules(
  schedules: readonly PriceSchedule[],
  now: Date | number | string = Date.now(),
): {
  active: PriceSchedule[];
  upcoming: PriceSchedule[];
  expired: PriceSchedule[];
} {
  const active: PriceSchedule[] = [];
  const upcoming: PriceSchedule[] = [];
  const expired: PriceSchedule[] = [];

  for (const item of schedules) {
    const status = getPriceScheduleStatus(item, now);
    if (status === 'active') active.push(item);
    else if (status === 'upcoming') upcoming.push(item);
    else expired.push(item);
  }

  return { active, upcoming, expired };
}

