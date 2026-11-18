import { describe, expect, it } from 'vitest';
import {
  bandsProblem, bookingWhatsAppLink, fillBookingMessage, formatPsDuration, formatClock, localClock, packageApplies, parseClock, priceForChoice,
  priceForDuration, psPackageProblem, psSettingsProblem, psStationProblem, rateAtMinute, runState, sessionSchedule, whatsappNumber,
  type PsPackage, type PsStation,
} from '../src';

const TZ = 'Asia/Jakarta';
// 17 Nov 2026 = Selasa. WIB = UTC+7.
const at = (hhmm: string, day = '2026-11-17') => new Date(`${day}T${hhmm}:00+07:00`);
const station: Pick<PsStation, 'ratePerHour' | 'bands'> = {
  ratePerHour: 10000,
  bands: [{ startMin: 600, endMin: 1020, ratePerHour: 6000 }, { startMin: 1020, endMin: 1440, ratePerHour: 12000 }],
};

describe('jam dan tarif pita', () => {
  it('membaca jam lokal dan hari', () => {
    expect(localClock(at('15:26'), TZ)).toEqual({ minuteOfDay: 15 * 60 + 26, weekday: 2 });
    expect(localClock(new Date('2026-11-17T20:00:00Z'), TZ)).toEqual({ minuteOfDay: 3 * 60, weekday: 3 }); // 03.00 Rabu WIB
    expect(parseClock('18:00')).toBe(1080);
    expect(parseClock('24:00')).toBe(1440);
    expect(parseClock('25:00')).toBeNull();
    expect(formatClock(1080)).toBe('18:00');
  });
  it('memilih pita yang cocok, selain itu tarif dasar', () => {
    expect(rateAtMinute(station, 2, 12 * 60)).toBe(6000);
    expect(rateAtMinute(station, 2, 17 * 60)).toBe(12000);
    expect(rateAtMinute(station, 2, 9 * 60)).toBe(10000); // sebelum pita pertama
  });
  it('pita khusus hari', () => {
    const s = { ratePerHour: 10000, bands: [{ startMin: 600, endMin: 1440, ratePerHour: 15000, weekdays: [0, 6] }] };
    expect(rateAtMinute(s, 6, 700)).toBe(15000);
    expect(rateAtMinute(s, 2, 700)).toBe(10000);
  });
});

describe('harga durasi dipecah per menit sesuai pita', () => {
  it('satu pita penuh', () => {
    expect(priceForDuration(station, at('12:00'), 120, TZ)).toBe(12000); // 2 jam x 6000
  });
  it('melewati dua pita: 16.30-17.30 = 30 menit 6000/jam + 30 menit 12000/jam', () => {
    expect(priceForDuration(station, at('16:30'), 60, TZ)).toBe(9000);
  });
  it('tanpa pembulatan waktu: 45 menit', () => {
    expect(priceForDuration(station, at('12:00'), 45, TZ)).toBe(4500);
  });
  it('melewati tengah malam memakai hari berikutnya', () => {
    const s = { ratePerHour: 10000, bands: [{ startMin: 0, endMin: 360, ratePerHour: 20000, weekdays: [3] }] }; // Rabu dini hari
    expect(priceForDuration(s, at('23:30'), 60, TZ)).toBe(15000); // 30 mnt 10000/jam + 30 mnt 20000/jam
  });
  it('durasi nol atau tidak valid = 0', () => {
    expect(priceForDuration(station, at('12:00'), 0, TZ)).toBe(0);
  });
});

describe('jadwal sesi', () => {
  it('tenggang 5 menit: tekan 15.21, satu jam = 15.26 sampai 16.26', () => {
    const s = sessionSchedule(at('15:21'), 5, { kind: 'duration', minutes: 60 }, TZ);
    expect(s.billableStart.toISOString()).toBe(at('15:26').toISOString());
    expect(s.endsAt.toISOString()).toBe(at('16:26').toISOString());
  });
  it('detik pada tombol Mulai dibuang (tanpa pembulatan menit lain)', () => {
    const s = sessionSchedule(new Date(at('15:21').getTime() + 40_000), 5, { kind: 'duration', minutes: 60 }, TZ);
    expect(s.endsAt.toISOString()).toBe(at('16:26').toISOString());
  });
  const win: PsPackage = { id: 'w', name: 'Malam', price: 30000, windowStartMin: 1080, windowEndMin: 1260, tableIds: [], isActive: true, sort: 0 };
  it('paket jendela selesai tepat di akhir jendela walau datang terlambat', () => {
    const s = sessionSchedule(at('20:00'), 5, { kind: 'package', pkg: win }, TZ);
    expect(s.endsAt.toISOString()).toBe(at('21:00').toISOString());
    expect(s.durationMinutes).toBe(60);
    expect(priceForChoice(station, { kind: 'package', pkg: win }, s, TZ)).toBe(30000); // harga tetap
  });
  it('paket berdurasi memakai harga paket', () => {
    const p: PsPackage = { id: 'p', name: '3 jam', price: 25000, durationMinutes: 180, tableIds: [], isActive: true, sort: 0 };
    const ch = { kind: 'package', pkg: p } as const;
    const s = sessionSchedule(at('12:00'), 5, ch, TZ);
    expect(s.endsAt.toISOString()).toBe(at('15:05').toISOString());
    expect(priceForChoice(station, ch, s, TZ)).toBe(25000);
  });
});

describe('timer', () => {
  const start = at('15:26'), end = at('16:26');
  it('menunggu selama tenggang, mundur, lalu lewat waktu', () => {
    expect(runState(at('15:22'), start, end).state).toBe('waiting');
    expect(runState(at('15:26'), start, end)).toEqual({ state: 'active', seconds: 3600 });
    expect(runState(at('16:25'), start, end)).toEqual({ state: 'active', seconds: 60 });
    expect(runState(at('16:34'), start, end)).toEqual({ state: 'overtime', seconds: 480 });
  });
  it('memformat durasi', () => {
    expect(formatPsDuration(5103)).toBe('1:25:03');
    expect(formatPsDuration(59)).toBe('0:00:59');
  });
});

describe('paket berlaku', () => {
  const win: PsPackage = { id: 'w', name: 'Malam', price: 30000, windowStartMin: 1080, windowEndMin: 1260, tableIds: ['t1'], weekdays: [2], isActive: true, sort: 0 };
  it('hanya di jendela, hari, station, dan bila aktif', () => {
    expect(packageApplies(win, 't1', at('19:00'), TZ)).toBe(true);
    expect(packageApplies(win, 't1', at('21:00'), TZ)).toBe(false);
    expect(packageApplies(win, 't1', at('17:59'), TZ)).toBe(false);
    expect(packageApplies(win, 't2', at('19:00'), TZ)).toBe(false);
    expect(packageApplies(win, 't1', at('19:00', '2026-11-18'), TZ)).toBe(false); // Rabu
    expect(packageApplies({ ...win, isActive: false }, 't1', at('19:00'), TZ)).toBe(false);
  });
});

describe('validasi pengaturan', () => {
  it('pita bertumpuk ditolak, hari berbeda boleh', () => {
    expect(bandsProblem([{ startMin: 600, endMin: 900, ratePerHour: 1 }, { startMin: 800, endMin: 1000, ratePerHour: 2 }])).toMatch(/bertumpuk/);
    expect(bandsProblem([{ startMin: 600, endMin: 900, ratePerHour: 1, weekdays: [1] }, { startMin: 600, endMin: 900, ratePerHour: 2, weekdays: [2] }])).toBeNull();
    expect(bandsProblem([{ startMin: 900, endMin: 600, ratePerHour: 1 }])).toMatch(/setelah/);
  });
  it('station, paket, pengaturan', () => {
    expect(psStationProblem({ consoleLabel: 'PS5', ratePerHour: 10000, games: ['FIFA'], bands: [] })).toBeNull();
    expect(psStationProblem({ consoleLabel: ' ', ratePerHour: 10000, games: [], bands: [] })).toMatch(/Tipe/);
    expect(psStationProblem({ consoleLabel: 'PS5', ratePerHour: 10.5, games: [], bands: [] })).toMatch(/bulat/);
    expect(psPackageProblem({ name: '2 jam', price: 20000, durationMinutes: 120 })).toBeNull();
    expect(psPackageProblem({ name: 'x', price: 20000 })).toMatch(/Durasi/);
    expect(psPackageProblem({ name: 'Malam', price: 30000, windowStartMin: 1080, windowEndMin: 1260 })).toBeNull();
    expect(psPackageProblem({ name: 'Malam', price: 30000, windowStartMin: 1260, windowEndMin: 1080 })).toMatch(/setelah/);
    expect(psPackageProblem({ name: 'Campur', price: 1, durationMinutes: 60, windowStartMin: 1, windowEndMin: 60 })).toMatch(/tidak memakai durasi/);
    expect(psSettingsProblem({ graceMinutes: 5, bookingExpiryMinutes: 120 })).toBeNull();
    expect(psSettingsProblem({ graceMinutes: 40, bookingExpiryMinutes: 120 })).toMatch(/Tenggang/);
    expect(psSettingsProblem({ graceMinutes: 5, bookingExpiryMinutes: 5 })).toMatch(/hangus/);
  });
});

describe('tautan WhatsApp booking', () => {
  it('menormalkan nomor Indonesia', () => {
    expect(whatsappNumber('0812-3456-7890')).toBe('6281234567890');
    expect(whatsappNumber('+62 812 3456 7890')).toBe('6281234567890');
    expect(whatsappNumber('81234567890')).toBe('6281234567890');
    expect(whatsappNumber('12345')).toBeNull();
  });
  it('mengisi templat dan membuat tautan wa.me', () => {
    const msg = fillBookingMessage(undefined, { nama: 'Budi', station: 'PS5-1', tanggal: '17 Nov', jam: '19.00', durasi: '2 jam', total: 'Rp 24.000', batas: '17.00', rekening: 'BCA 123' });
    expect(msg).toContain('Halo Budi, booking PS5-1');
    expect(msg).not.toContain('{');
    const link = bookingWhatsAppLink('081234567890', msg)!;
    expect(link.startsWith('https://wa.me/6281234567890?text=')).toBe(true);
    expect(decodeURIComponent(link.split('?text=')[1]!)).toBe(msg);
    expect(bookingWhatsAppLink('abc', msg)).toBeNull();
  });
  it('templat khusus dipakai', () => {
    expect(fillBookingMessage('Transfer {total} ya {nama}', { total: 'Rp 5', nama: 'Ani' })).toBe('Transfer Rp 5 ya Ani');
  });
});
