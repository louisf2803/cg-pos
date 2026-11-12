import { describe, expect, it } from 'vitest';
import {
  attendanceActionSuccessText,
  attendanceErrorText,
  attendanceMinutes,
  attendanceOpenMinutes,
  attendanceProblem,
  createFakeData,
  DataError,
  formatAttendanceTime,
  formatDuration,
  selfieTargetSize,
  summarizeAttendance,
  type AttendanceRecord,
} from '../src';

describe('helper absensi', () => {
  it('menghitung menit kerja hanya bila sudah clock out dan urutannya benar', () => {
    expect(attendanceMinutes('2026-11-12T01:00:00.000Z', '2026-11-12T09:05:30.000Z')).toBe(485);
    expect(attendanceMinutes('2026-11-12T01:00:00.000Z')).toBeUndefined();
    expect(attendanceMinutes('2026-11-12T09:00:00.000Z', '2026-11-12T01:00:00.000Z')).toBeUndefined();
    expect(attendanceMinutes('bukan-tanggal', '2026-11-12T01:00:00.000Z')).toBeUndefined();
  });
  it('memformat durasi', () => {
    expect(formatDuration(485)).toBe('8 jam 05 menit');
    expect(formatDuration(59)).toBe('59 menit');
    expect(formatDuration(0)).toBe('0 menit');
    expect(formatDuration(-5)).toBe('0 menit');
  });
  it('menolak koreksi yang tidak masuk akal', () => {
    const now = new Date('2026-11-12T05:00:00.000Z');
    expect(attendanceProblem({ clockInAt: '2026-11-12T01:00:00.000Z', clockOutAt: '2026-11-12T04:00:00.000Z' }, now)).toBeNull();
    expect(attendanceProblem({ clockInAt: '2026-11-12T01:00:00.000Z' }, now)).toBeNull();
    expect(attendanceProblem({ clockInAt: 'x' }, now)).toMatch(/jam masuk/i);
    expect(attendanceProblem({ clockInAt: '2026-11-12T04:00:00.000Z', clockOutAt: '2026-11-12T03:00:00.000Z' }, now)).toMatch(/sebelum jam masuk/i);
    expect(attendanceProblem({ clockInAt: '2026-11-12T06:00:00.000Z' }, now)).toMatch(/masa depan/i);
    expect(attendanceProblem({ clockInAt: '2026-11-12T01:00:00.000Z', clockOutAt: '2026-11-12T06:00:00.000Z' }, now)).toMatch(/masa depan/i);
    expect(attendanceProblem({ clockInAt: '2026-11-12T05:04:00.000Z' }, now)).toBeNull(); // dalam toleransi 5 menit
  });
  it('meringkas per karyawan: catatan, total menit (hanya yang selesai), dan yang masih terbuka', () => {
    const rec = (id: string, employeeId: string, name: string, inAt: string, outAt?: string): AttendanceRecord =>
      ({ id, employeeId, employeeName: name, outletId: 'o', clockInAt: inAt, ...(outAt ? { clockOutAt: outAt } : {}), edited: false });
    const rows = summarizeAttendance([
      rec('1', 'b', 'Budi', '2026-11-11T01:00:00.000Z', '2026-11-11T09:00:00.000Z'),
      rec('2', 'a', 'Ani', '2026-11-11T01:00:00.000Z', '2026-11-11T05:00:00.000Z'),
      rec('3', 'a', 'Ani', '2026-11-12T01:00:00.000Z'),
      rec('4', 'b', 'Budi', '2026-11-12T01:00:00.000Z', '2026-11-12T02:30:00.000Z'),
    ]);
    expect(rows).toEqual([
      { employeeId: 'a', employeeName: 'Ani', shifts: 2, minutes: 240, open: true },
      { employeeId: 'b', employeeName: 'Budi', shifts: 2, minutes: 570, open: false },
    ]);
  });
});

describe('absensi di data demo', () => {
  function setup() {
    let t = new Date('2026-11-12T01:00:00.000Z').getTime();
    const d = createFakeData({ now: () => new Date(t) });
    return { d, advance: (min: number) => { t += min * 60000; } };
  }
  const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof DataError ? e.code : 'galat'));

  it('clock in lalu clock out dengan PIN benar, jam dari saat itu', async () => {
    const { d, advance } = setup();
    expect(await d.attendanceOpen()).toEqual([]);
    const inn = await d.attendanceClockIn('e-sari', '222222');
    expect(inn.clockInAt).toBe('2026-11-12T01:00:00.000Z');
    expect((await d.attendanceOpen()).map((x) => x.employeeId)).toEqual(['e-sari']);
    advance(485);
    const out = await d.attendanceClockOut('e-sari', '222222');
    expect(out.clockOutAt).toBe('2026-11-12T09:05:00.000Z');
    expect(await d.attendanceOpen()).toEqual([]);
    const list = await d.listAttendance({ from: '2026-11-12T00:00:00.000Z', to: '2026-11-13T00:00:00.000Z' });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ employeeName: 'Sari', minutes: 485, edited: false });
  });
  it('menolak PIN salah, clock in ganda, clock out tanpa clock in, dan karyawan tidak ada', async () => {
    const { d } = setup();
    expect(await code(d.attendanceClockIn('e-sari', '000000'))).toBe('bad_pin');
    expect(await code(d.attendanceClockOut('e-sari', '222222'))).toBe('invalid');
    expect(await code(d.attendanceClockIn('tidak-ada', '222222'))).toBe('not_found');
    await d.attendanceClockIn('e-sari', '222222');
    expect(await code(d.attendanceClockIn('e-sari', '222222'))).toBe('invalid');
    expect(await code(d.attendanceClockOut('e-sari', '999999'))).toBe('bad_pin');
  });
  it('menyimpan selfie sebagai tautan dan menolak foto yang tidak sah', async () => {
    const { d } = setup();
    const ok = { data: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' as const };
    await d.attendanceClockIn('e-sari', '222222', ok);
    const [r] = await d.listAttendance({ from: '2026-11-12T00:00:00.000Z', to: '2026-11-13T00:00:00.000Z' });
    expect(r!.clockInPhotoUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(await code(d.attendanceClockOut('e-sari', '222222', { data: new Uint8Array(), contentType: 'image/jpeg' }))).toBe('invalid');
  });
  it('koreksi pengelola: tambah, ubah, validasi, satu catatan terbuka per karyawan, hapus', async () => {
    const { d } = setup();
    const added = await d.saveAttendance({ employeeId: 'e-budi', clockInAt: '2026-11-11T01:00:00.000Z', clockOutAt: '2026-11-11T09:00:00.000Z', note: '  lupa absen  ' });
    expect(added).toMatchObject({ employeeName: 'Budi', minutes: 480, note: 'lupa absen', edited: true });
    const changed = await d.saveAttendance({ id: added.id, employeeId: 'e-budi', clockInAt: '2026-11-11T01:00:00.000Z', clockOutAt: '2026-11-11T10:00:00.000Z' });
    expect(changed.minutes).toBe(540);
    expect(changed.note).toBeUndefined();
    expect(await code(d.saveAttendance({ employeeId: 'e-budi', clockInAt: '2026-11-11T05:00:00.000Z', clockOutAt: '2026-11-11T04:00:00.000Z' }))).toBe('invalid');
    expect(await code(d.saveAttendance({ employeeId: 'e-budi', clockInAt: '2026-11-13T05:00:00.000Z' }))).toBe('invalid');
    expect(await code(d.saveAttendance({ employeeId: 'tidak-ada', clockInAt: '2026-11-11T05:00:00.000Z' }))).toBe('not_found');
    await d.saveAttendance({ employeeId: 'e-budi', clockInAt: '2026-11-12T00:30:00.000Z' });
    expect(await code(d.saveAttendance({ employeeId: 'e-budi', clockInAt: '2026-11-12T00:40:00.000Z' }))).toBe('invalid');
    await d.deleteAttendance(added.id);
    expect(await code(d.deleteAttendance(added.id))).toBe('not_found');
    expect(await d.listAttendance({ from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T00:00:00.000Z', }, 'e-sari')).toEqual([]);
  });
  it('daftar terbaru dulu, memfilter rentang dan karyawan, dan reset membersihkan', async () => {
    const { d, advance } = setup();
    await d.attendanceClockIn('e-sari', '222222'); advance(60); await d.attendanceClockOut('e-sari', '222222');
    advance(60); await d.attendanceClockIn('e-budi', '333333');
    const all = await d.listAttendance({ from: '2026-11-12T00:00:00.000Z', to: '2026-11-13T00:00:00.000Z' });
    expect(all.map((x) => x.employeeName)).toEqual(['Budi', 'Sari']);
    expect((await d.listAttendance({ from: '2026-11-12T00:00:00.000Z', to: '2026-11-13T00:00:00.000Z' }, 'e-sari')).map((x) => x.employeeName)).toEqual(['Sari']);
    expect(await d.listAttendance({ from: '2026-11-13T00:00:00.000Z', to: '2026-11-14T00:00:00.000Z' })).toEqual([]);
    d.reset();
    expect(await d.listAttendance({ from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T00:00:00.000Z' })).toEqual([]);
  });
});

describe('helper UI absensi POS', () => {
  it('menghitung ukuran pengecilan selfie tanpa melebihi max dan tidak memperbesar foto kecil', () => {
    expect(selfieTargetSize(1280, 720, 640)).toEqual({ width: 640, height: 360 });
    expect(selfieTargetSize(720, 1280, 640)).toEqual({ width: 360, height: 640 });
    expect(selfieTargetSize(640, 480, 640)).toEqual({ width: 640, height: 480 });
    expect(selfieTargetSize(320, 240, 640)).toEqual({ width: 320, height: 240 });
    expect(selfieTargetSize(0, 480, 640)).toEqual({ width: 0, height: 0 });
    expect(selfieTargetSize(-10, 480, 640)).toEqual({ width: 0, height: 0 });
  });

  it('memformat jam HH.MM sesuai zona waktu dan lama berjalan', () => {
    expect(formatAttendanceTime('2026-11-12T01:02:00.000Z', 'Asia/Jakarta')).toBe('08.02');
    expect(formatAttendanceTime('2026-11-12T09:10:00.000Z', 'Asia/Jakarta')).toBe('16.10');
    expect(formatAttendanceTime('bukan-tanggal', 'Asia/Jakarta')).toBe('—');
    expect(attendanceOpenMinutes('2026-11-12T01:00:00.000Z', new Date('2026-11-12T02:15:30.000Z'))).toBe(75);
    expect(attendanceOpenMinutes('2026-11-12T05:00:00.000Z', new Date('2026-11-12T04:00:00.000Z'))).toBe(0);
  });

  it('membuat pesan sukses masuk/pulang dan memetakan galat tanpa membocorkan sisa percobaan', () => {
    expect(attendanceActionSuccessText({
      kind: 'in',
      employeeName: 'Sari',
      clockInAt: '2026-11-12T01:02:00.000Z',
      timeZone: 'Asia/Jakarta',
    })).toBe('Sari masuk 08.02');
    expect(attendanceActionSuccessText({
      kind: 'out',
      employeeName: 'Sari',
      clockInAt: '2026-11-12T01:02:00.000Z',
      clockOutAt: '2026-11-12T09:10:00.000Z',
      timeZone: 'Asia/Jakarta',
    })).toBe('Sari pulang 16.10, lama kerja 8 jam 08 menit');

    expect(attendanceErrorText(new DataError('bad_pin', 'PIN salah, sisa 2 percobaan'))).toEqual({
      kind: 'bad_pin',
      message: 'PIN salah',
    });
    expect(attendanceErrorText(new DataError('invalid', 'Karyawan ini sudah clock in'))).toEqual({
      kind: 'other',
      message: 'Karyawan ini sudah clock in',
    });
    expect(attendanceErrorText(new DataError('network', 'fetch failed'))).toEqual({
      kind: 'other',
      message: 'Tidak ada koneksi, coba lagi',
    });
  });
});
