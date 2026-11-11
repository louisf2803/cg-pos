export type AppointmentKind = 'service' | 'facility' | 'table';
export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface Appointment {
  id: string;
  kind: AppointmentKind;
  /** ID produk jasa/fasilitas atau meja bila dipilih dari data master */
  targetId?: string;
  targetName: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  /** YYYY-MM-DD (tanggal lokal outlet) */
  date: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  /** YYYY-MM-DDTHH:mm */
  startAt: string;
  /** YYYY-MM-DDTHH:mm */
  endAt: string;
  status: AppointmentStatus;
  note?: string;
  createdAt: string;
}

export interface AppointmentInput {
  id?: string;
  kind: AppointmentKind;
  targetId?: string;
  targetName: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  date: string;
  startTime: string;
  endTime: string;
  status?: AppointmentStatus;
  note?: string;
}

export const APPOINTMENT_KIND_LABEL: Record<AppointmentKind, string> = {
  service: 'Jasa',
  facility: 'Fasilitas',
  table: 'Meja',
};

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: 'Menunggu',
  confirmed: 'Dikonfirmasi',
  completed: 'Selesai',
  cancelled: 'Batal',
};

export const CALENDAR_WEEKDAYS_ID = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] as const;

export interface CalendarDayCell {
  dateKey: string;
  day: number;
  appointments: Appointment[];
  activeCount: number;
}

export interface CalendarMonthGrid {
  year: number;
  /** 1..12 */
  month: number;
  label: string;
  /** Kelipatan 7 elemen, berisi `null` untuk tanggal kosong sebelum awal / sesudah akhir bulan. */
  cells: (CalendarDayCell | null)[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function toMinutesOfDay(hm: string): number {
  if (!TIME_RE.test(hm)) return NaN;
  const [hStr, mStr] = hm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (h < 0 || h > 23 || m < 0 || m > 59) return NaN;
  return h * 60 + m;
}

/** Cek apakah dua rentang tanggal-waktu (`YYYY-MM-DD` + `HH:mm`) tumpang tindih; ujung persis sama tidak bentrok. */
export function appointmentsOverlap(
  aDate: string,
  aStartTime: string,
  aEndTime: string,
  bDate: string,
  bStartTime: string,
  bEndTime: string,
): boolean {
  if (!DATE_RE.test(aDate) || !DATE_RE.test(bDate)) return false;
  if (aDate !== bDate) return false;
  const aS = toMinutesOfDay(aStartTime);
  const aE = toMinutesOfDay(aEndTime);
  const bS = toMinutesOfDay(bStartTime);
  const bE = toMinutesOfDay(bEndTime);
  if (!Number.isFinite(aS) || !Number.isFinite(aE) || !Number.isFinite(bS) || !Number.isFinite(bE)) {
    return false;
  }
  return aS < bE && bS < aE;
}

function sameAppointmentTarget(
  a: Pick<AppointmentInput, 'kind' | 'targetId' | 'targetName'>,
  b: Pick<Appointment, 'kind' | 'targetId' | 'targetName'>,
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.targetId && b.targetId) {
    return a.targetId === b.targetId;
  }
  const na = a.targetName.trim().toLowerCase();
  const nb = b.targetName.trim().toLowerCase();
  return Boolean(na) && na === nb;
}

/** Cari jadwal aktif yang bentrok untuk jenis dan slot/target yang sama. Mengabaikan status `cancelled`. */
export function findAppointmentConflict(
  candidate: AppointmentInput,
  existing: readonly Appointment[],
): Appointment | null {
  if (candidate.status === 'cancelled') return null;

  for (const item of existing) {
    if (candidate.id && item.id === candidate.id) continue;
    if (item.status === 'cancelled') continue;
    if (!sameAppointmentTarget(candidate, item)) continue;
    if (
      appointmentsOverlap(
        candidate.date,
        candidate.startTime,
        candidate.endTime,
        item.date,
        item.startTime,
        item.endTime,
      )
    ) {
      return item;
    }
  }
  return null;
}

/** Validasi isian reservasi baru atau perubahan jadwal. Mengembalikan pesan galat Bahasa Indonesia atau null bila sah. */
export function appointmentProblem(
  input: AppointmentInput,
  existing: readonly Appointment[],
): string | null {
  if (!input.targetName.trim()) {
    return `Pilih atau isi nama ${APPOINTMENT_KIND_LABEL[input.kind].toLowerCase()} terlebih dahulu.`;
  }
  if (!DATE_RE.test(input.date)) {
    return 'Tanggal reservasi tidak valid.';
  }
  const startMin = toMinutesOfDay(input.startTime);
  const endMin = toMinutesOfDay(input.endTime);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
    return 'Jam mulai dan jam selesai wajib diisi.';
  }
  if (endMin <= startMin) {
    return 'Jam selesai harus lebih akhir daripada jam mulai.';
  }
  if (!input.customerName.trim()) {
    return 'Nama pelanggan wajib diisi.';
  }
  if (input.customerName.trim().length > 120) {
    return 'Nama pelanggan maksimal 120 karakter.';
  }
  if (!input.customerPhone.trim()) {
    return 'Nomor kontak pelanggan wajib diisi.';
  }
  if (input.note && input.note.length > 240) {
    return 'Catatan maksimal 240 karakter.';
  }

  const conflict = findAppointmentConflict(input, existing);
  if (conflict) {
    return `Jadwal bentrok dengan reservasi ${conflict.customerName} pada ${conflict.startTime}–${conflict.endTime} untuk ${conflict.targetName}.`;
  }
  return null;
}

const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** Susun kisi kalender bulanan (mulai Senin) beserta pengelompokan reservasi per tanggal. */
export function buildCalendarMonth(
  year: number,
  month: number,
  appointments: readonly Appointment[],
): CalendarMonthGrid {
  const safeMonth = Math.min(12, Math.max(1, Math.trunc(month)));
  const safeYear = Math.trunc(year);
  const firstDay = new Date(Date.UTC(safeYear, safeMonth - 1, 1));
  const leadingEmpty = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(safeYear, safeMonth, 0)).getUTCDate();

  const byDate = new Map<string, Appointment[]>();
  for (const item of appointments) {
    const bucket = byDate.get(item.date);
    if (bucket) bucket.push(item);
    else byDate.set(item.date, [item]);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  const ym = `${safeYear}-${String(safeMonth).padStart(2, '0')}`;
  const cells: (CalendarDayCell | null)[] = Array.from({ length: leadingEmpty }, () => null);

  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${ym}-${String(d).padStart(2, '0')}`;
    const list = byDate.get(dateKey) ?? [];
    cells.push({
      dateKey,
      day: d,
      appointments: list,
      activeCount: list.filter((x) => x.status !== 'cancelled').length,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return {
    year: safeYear,
    month: safeMonth,
    label: `${MONTHS_ID[safeMonth - 1] ?? ''} ${safeYear}`.trim(),
    cells,
  };
}

