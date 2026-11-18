/**
 * Rental PS di kafe (migrasi 0158; spesifikasi docs/queue/SPEK-PS-RENTAL.md).
 * Aturan (keputusan Louis): tanpa pembulatan waktu; tenggang awal (bawaan 5 menit) sebelum waktu sewa mulai dihitung;
 * sesi yang melewati beberapa pita tarif dipecah PER MENIT sesuai pita; paket jendela jam (mis. 18.00-21.00) harga tetap dan selesai
 * tepat di akhir jendela walau pelanggan datang terlambat. Waktu memakai jam tablet; zona waktu outlet tidak berubah (tanpa DST) selama satu sesi.
 */
export interface PsRateBand { startMin: number; endMin: number; ratePerHour: number; weekdays?: number[] }
export interface PsStation {
  tableId: string; floorId: string | null; name: string;
  consoleLabel: string; ratePerHour: number; isMaintenance: boolean; games: string[]; bands: PsRateBand[];
  /** false = meja di lantai PS yang belum pernah diatur tarifnya */
  configured: boolean;
}
export interface PsStationInput { tableId: string; consoleLabel: string; ratePerHour: number; isMaintenance: boolean; games: string[]; bands: PsRateBand[] }
export interface PsPackage {
  id: string; name: string; price: number;
  /** paket biasa: durasi tetap (menit); paket jendela: tidak diisi */
  durationMinutes?: number;
  /** paket jendela jam: menit dari tengah malam */
  windowStartMin?: number; windowEndMin?: number;
  /** kosong = semua station */
  tableIds: string[]; weekdays?: number[]; isActive: boolean; sort: number;
}
export interface PsPackageInput { id?: string; name: string; price: number; durationMinutes?: number; windowStartMin?: number; windowEndMin?: number; tableIds: string[]; weekdays?: number[]; isActive?: boolean; sort?: number }
export interface PsSettings { graceMinutes: number; bookingExpiryMinutes: number; bookingMessage?: string }

export const PS_DEFAULT_GRACE_MINUTES = 5;
export const PS_DEFAULT_BOOKING_EXPIRY_MINUTES = 120;
export const PS_WEEKDAY_LABEL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

/** "HH:MM" -> menit dari tengah malam; "24:00" -> 1440. null bila format salah. */
export function parseClock(v: string): number | null {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(v.trim());
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins <= 1440 ? mins : null;
}
export function formatClock(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Menit dari tengah malam dan hari dalam seminggu (0 = Minggu) untuk waktu `at` di zona `tz`. */
export function localClock(at: Date, tz: string): { minuteOfDay: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const h = Number(get('hour')) % 24;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { minuteOfDay: h * 60 + Number(get('minute')), weekday: wd < 0 ? 0 : wd };
}

const dayMatches = (days: number[] | undefined, weekday: number) => !days || days.length === 0 || days.includes(weekday);

/** Tanggal "yyyy-mm-dd" dan jam "HH:MM" menurut zona outlet menjadi saat yang tepat (tanpa DST). null bila tidak valid. */
export function zonedTime(dateKey: string, hhmm: string, tz: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const t = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!d || !t) return null;
  const asUtc = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(asUtc));
  const g = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
  const shown = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
  const result = new Date(asUtc - (shown - asUtc));
  return Number.isNaN(result.getTime()) ? null : result;
}

/** Tarif per jam yang berlaku pada hari dan menit tertentu: pita yang cocok, bila tidak ada pakai tarif dasar station. */
export function rateAtMinute(station: Pick<PsStation, 'ratePerHour' | 'bands'>, weekday: number, minuteOfDay: number): number {
  const band = station.bands.find((b) => dayMatches(b.weekdays, weekday) && minuteOfDay >= b.startMin && minuteOfDay < b.endMin);
  return band ? band.ratePerHour : station.ratePerHour;
}

/**
 * Harga sewa `durationMinutes` mulai `start` (waktu mulai dihitung, setelah tenggang): jumlah tarif/60 untuk tiap menit sesuai pita,
 * dibulatkan ke rupiah terdekat di akhir (bukan per menit).
 */
export function priceForDuration(station: Pick<PsStation, 'ratePerHour' | 'bands'>, start: Date, durationMinutes: number, tz: string): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 0;
  const { minuteOfDay, weekday } = localClock(start, tz);
  let perHourSum = 0;
  for (let i = 0; i < Math.floor(durationMinutes); i++) {
    const abs = minuteOfDay + i;
    perHourSum += rateAtMinute(station, (weekday + Math.floor(abs / 1440)) % 7, abs % 1440);
  }
  return Math.round(perHourSum / 60);
}

/** Paket boleh dipakai pada station dan waktu ini? (aktif, station cocok, hari cocok; paket jendela: waktu mulai di dalam jendela.) */
export function packageApplies(pkg: PsPackage, tableId: string, at: Date, tz: string): boolean {
  if (!pkg.isActive) return false;
  if (pkg.tableIds.length > 0 && !pkg.tableIds.includes(tableId)) return false;
  const { minuteOfDay, weekday } = localClock(at, tz);
  if (!dayMatches(pkg.weekdays, weekday)) return false;
  if (pkg.windowStartMin !== undefined && pkg.windowEndMin !== undefined) return minuteOfDay >= pkg.windowStartMin && minuteOfDay < pkg.windowEndMin;
  return true;
}

export type PsChoice = { kind: 'duration'; minutes: number } | { kind: 'package'; pkg: PsPackage };
export interface PsSchedule {
  /** saat tombol Mulai ditekan */ pressedAt: Date;
  /** awal waktu sewa dihitung (setelah tenggang; paket jendela tanpa tenggang di akhirnya) */ billableStart: Date;
  endsAt: Date; durationMinutes: number;
}

/**
 * Jadwal sesi. Durasi biasa dan paket berdurasi: mulai dihitung `graceMinutes` setelah ditekan, selesai = mulai + durasi
 * (tekan 15.21 + tenggang 5 menit + 1 jam -> 15.26 sampai 16.26). Paket jendela: selesai tepat di akhir jendela, tanpa toleransi.
 */
export function sessionSchedule(pressedAt: Date, graceMinutes: number, choice: PsChoice, tz: string): PsSchedule {
  const startMs = Math.floor(pressedAt.getTime() / 60000) * 60000;
  if (choice.kind === 'package' && choice.pkg.windowEndMin !== undefined) {
    const { minuteOfDay } = localClock(pressedAt, tz);
    const endsAt = new Date(startMs + (choice.pkg.windowEndMin - minuteOfDay) * 60000);
    return { pressedAt, billableStart: new Date(startMs), endsAt, durationMinutes: Math.max(0, Math.round((endsAt.getTime() - startMs) / 60000)) };
  }
  const minutes = choice.kind === 'duration' ? choice.minutes : (choice.pkg.durationMinutes ?? 0);
  const billableStart = new Date(startMs + graceMinutes * 60000);
  return { pressedAt, billableStart, endsAt: new Date(billableStart.getTime() + minutes * 60000), durationMinutes: minutes };
}

/**
 * Harga PS untuk satu tipe pelanggan (grup harga spesial, migrasi 0160). Kosong = ikut harga Normal.
 * rates: tarif per jam konsol (menggantikan tarif dasar dan pita jam); packages: harga paket.
 */
export interface PsGroupPricing { rates: Record<string, number>; packages: Record<string, number> }
export interface PsGroupPrices {
  rates: { groupId: string; tableId: string; ratePerHour: number }[];
  packages: { groupId: string; packageId: string; price: number }[];
}
export const NO_PS_GROUP_PRICING: PsGroupPricing = { rates: {}, packages: {} };
/** Harga PS satu grup dari daftar penggantian; grup Normal (atau tanpa penggantian) = kosong. */
export function psGroupPricing(prices: PsGroupPrices, groupId: string | null | undefined): PsGroupPricing {
  if (!groupId) return NO_PS_GROUP_PRICING;
  return {
    rates: Object.fromEntries(prices.rates.filter((r) => r.groupId === groupId).map((r) => [r.tableId, r.ratePerHour])),
    packages: Object.fromEntries(prices.packages.filter((p) => p.groupId === groupId).map((p) => [p.packageId, p.price])),
  };
}
/** Station dengan tarif grup: tarif per jam khusus menggantikan tarif dasar DAN pita jam. */
export function stationForGroup<T extends Pick<PsStation, 'tableId' | 'ratePerHour' | 'bands'>>(station: T, group: PsGroupPricing): T {
  const rate = group.rates[station.tableId];
  return rate === undefined ? station : { ...station, ratePerHour: rate, bands: [] };
}
export const packagePriceForGroup = (pkg: Pick<PsPackage, 'id' | 'price'>, group: PsGroupPricing): number => group.packages[pkg.id] ?? pkg.price;

/** Harga pilihan sewa: paket = harga tetap (atau harga paket grup); durasi = hitungan per menit menurut pita (atau tarif grup) mulai dihitung. */
export function priceForChoice(station: Pick<PsStation, 'tableId' | 'ratePerHour' | 'bands'>, choice: PsChoice, schedule: PsSchedule, tz: string, group: PsGroupPricing = NO_PS_GROUP_PRICING): number {
  if (choice.kind === 'package') return packagePriceForGroup(choice.pkg, group);
  return priceForDuration(stationForGroup(station, group), schedule.billableStart, schedule.durationMinutes, tz);
}

export type PsRunState = 'waiting' | 'active' | 'overtime';
/** Status timer: 'waiting' selama tenggang sebelum waktu sewa mulai dihitung, lalu mundur, lalu lewat waktu. */
export function runState(now: Date, billableStart: Date, endsAt: Date): { state: PsRunState; seconds: number } {
  const n = now.getTime();
  if (n < billableStart.getTime()) return { state: 'waiting', seconds: Math.ceil((endsAt.getTime() - n) / 1000) };
  const left = Math.ceil((endsAt.getTime() - n) / 1000);
  return left >= 0 ? { state: 'active', seconds: left } : { state: 'overtime', seconds: -left };
}
/** "1:25:03" untuk 5103 detik; dipakai sisa waktu dan lewat waktu. */
export function formatPsDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// Validasi pengaturan

/** Pita tidak boleh bertumpuk pada hari yang sama dan harus berurutan (mulai < selesai). */
export function bandsProblem(bands: readonly PsRateBand[]): string | null {
  for (const b of bands) {
    if (!Number.isInteger(b.startMin) || !Number.isInteger(b.endMin) || b.startMin < 0 || b.endMin > 1440 || b.endMin <= b.startMin) return 'Jam selesai pita harus setelah jam mulai (pita yang melewati tengah malam dipecah dua).';
    if (!Number.isInteger(b.ratePerHour) || b.ratePerHour < 0 || b.ratePerHour > 100_000_000) return 'Tarif pita harus rupiah bulat.';
  }
  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      const a = bands[i]!, b = bands[j]!;
      const share = [0, 1, 2, 3, 4, 5, 6].some((d) => dayMatches(a.weekdays, d) && dayMatches(b.weekdays, d));
      if (share && a.startMin < b.endMin && b.startMin < a.endMin) return 'Ada dua pita tarif yang jamnya bertumpuk pada hari yang sama.';
    }
  }
  return null;
}

export function psStationProblem(i: Pick<PsStationInput, 'consoleLabel' | 'ratePerHour' | 'games' | 'bands'>): string | null {
  if (!i.consoleLabel.trim()) return 'Tipe konsol wajib diisi, mis. PS5.';
  if (i.consoleLabel.trim().length > 30) return 'Tipe konsol maksimal 30 huruf.';
  if (!Number.isInteger(i.ratePerHour) || i.ratePerHour < 0 || i.ratePerHour > 100_000_000) return 'Tarif per jam harus rupiah bulat.';
  if (i.games.length > 80) return 'Maksimal 80 game per station.';
  if (i.games.some((g) => g.trim().length === 0 || g.length > 60)) return 'Nama game wajib diisi dan maksimal 60 huruf.';
  return bandsProblem(i.bands);
}

export function psPackageProblem(i: Pick<PsPackageInput, 'name' | 'price' | 'durationMinutes' | 'windowStartMin' | 'windowEndMin'>): string | null {
  if (!i.name.trim()) return 'Nama paket wajib diisi.';
  if (i.name.trim().length > 60) return 'Nama paket maksimal 60 huruf.';
  if (!Number.isInteger(i.price) || i.price < 0 || i.price > 100_000_000) return 'Harga paket harus rupiah bulat.';
  const isWindow = i.windowStartMin !== undefined || i.windowEndMin !== undefined;
  if (isWindow) {
    if (i.windowStartMin === undefined || i.windowEndMin === undefined) return 'Isi jam mulai dan jam selesai jendela.';
    if (i.windowStartMin < 0 || i.windowEndMin > 1440 || i.windowEndMin <= i.windowStartMin) return 'Jam selesai jendela harus setelah jam mulai.';
    if (i.durationMinutes !== undefined) return 'Paket jendela jam tidak memakai durasi.';
  } else if (i.durationMinutes === undefined || !Number.isInteger(i.durationMinutes) || i.durationMinutes < 5 || i.durationMinutes > 1440) {
    return 'Durasi paket 5 menit sampai 24 jam.';
  }
  return null;
}

export function psSettingsProblem(s: PsSettings): string | null {
  if (!Number.isInteger(s.graceMinutes) || s.graceMinutes < 0 || s.graceMinutes > 30) return 'Tenggang awal 0 sampai 30 menit.';
  if (!Number.isInteger(s.bookingExpiryMinutes) || s.bookingExpiryMinutes < 15 || s.bookingExpiryMinutes > 1440) return 'Batas hangus booking 15 menit sampai 24 jam.';
  if ((s.bookingMessage ?? '').length > 600) return 'Pesan booking maksimal 600 huruf.';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Pesan WhatsApp untuk pembayaran booking (tautan wa.me; dikirim manual oleh kasir)

/** Nomor telepon Indonesia ke format wa.me (hanya angka, awalan 62). null bila tidak masuk akal. */
export function whatsappNumber(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
  let n = digits;
  if (n.startsWith('0')) n = `62${n.slice(1)}`;
  else if (n.startsWith('8')) n = `62${n}`;
  return /^62\d{8,13}$/.test(n) ? n : null;
}

export const PS_DEFAULT_BOOKING_MESSAGE =
  'Halo {nama}, booking {station} pada {tanggal} pukul {jam} ({durasi}) total {total}. Mohon transfer penuh sebelum {batas} ke {rekening}. Booking hangus bila belum dibayar. Terima kasih.';

/** Isi templat pesan dengan nilai; kunci yang tidak ada dibiarkan kosong. */
export function fillBookingMessage(template: string | undefined, vars: Record<string, string>): string {
  return (template?.trim() || PS_DEFAULT_BOOKING_MESSAGE).replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}

/** Tautan https://wa.me/<nomor>?text=<pesan>; null bila nomor tidak valid. */
export function bookingWhatsAppLink(phone: string, message: string): string | null {
  const n = whatsappNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null;
}
