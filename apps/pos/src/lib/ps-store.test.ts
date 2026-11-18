import { describe, expect, it } from 'vitest';
import type { PsChoice } from '@cgpos/shared';
import { EMPTY_PS_STATE, addBooking, boardInfo, cancelBooking, extendSession, finishSession, markBookingPaid, pruneBookings, startSession } from './ps-store';

const TZ = 'Asia/Jakarta';
const at = (hhmm: string) => new Date(`2026-11-17T${hhmm}:00+07:00`);
const dur = (minutes: number): PsChoice => ({ kind: 'duration', minutes });
const start = (now: Date, minutes = 60, table = 't1') => startSession(EMPTY_PS_STATE, { tableId: table, choice: dur(minutes), label: `${minutes} menit`, price: 10000, graceMinutes: 5, tz: TZ, now });

describe('sesi PS di tablet', () => {
  it('mulai 15.21: dihitung 15.26 sampai 16.26', () => {
    const s = start(at('15:21')).sessions[0]!;
    expect(s.billableStart).toBe(at('15:26').toISOString());
    expect(s.endsAt).toBe(at('16:26').toISOString());
    expect(s.total).toBe(10000);
  });
  it('satu station tidak bisa disewa dua kali', () => {
    const st = start(at('15:21'));
    expect(() => startSession(st, { tableId: 't1', choice: dur(60), label: 'x', price: 1, graceMinutes: 5, tz: TZ, now: at('15:30') })).toThrow(/sedang disewa/);
  });
  it('status kartu: persiapan, berjalan, menit terakhir, lewat waktu', () => {
    const st = start(at('15:21'));
    expect(boardInfo('t1', false, st, at('15:23'))).toMatchObject({ state: 'aktif', waiting: true });
    expect(boardInfo('t1', false, st, at('15:40'))).toMatchObject({ state: 'aktif', waiting: false });
    expect(boardInfo('t1', false, st, at('16:20')).state).toBe('menit-terakhir');
    expect(boardInfo('t1', false, st, at('16:35'))).toMatchObject({ state: 'lewat', seconds: 540 });
    expect(boardInfo('t2', false, st, at('16:35')).state).toBe('kosong');
    expect(boardInfo('t1', true, EMPTY_PS_STATE, at('16:35')).state).toBe('perawatan');
  });
  it('tambah waktu menyambung dari waktu selesai, atau dari sekarang bila sudah lewat', () => {
    const st = start(at('15:21'));
    const id = st.sessions[0]!.id;
    const a = extendSession(st, id, { minutes: 30, label: '+30', price: 5000, now: at('16:00') }).sessions[0]!;
    expect(a.endsAt).toBe(at('16:56').toISOString());
    expect(a.total).toBe(15000);
    const b = extendSession(st, id, { minutes: 30, label: '+30', price: 5000, now: at('16:40') }).sessions[0]!;
    expect(b.endsAt).toBe(at('17:10').toISOString());
    expect(finishSession(st, id).sessions).toHaveLength(0);
  });
});

describe('booking PS', () => {
  const book = (st = EMPTY_PS_STATE, startHm = '19:00') => addBooking(st, { tableId: 't1', name: 'Budi', phone: '0812', startAt: at(startHm).toISOString(), durationMinutes: 120, label: '2 jam', price: 20000, now: at('15:00'), expiryMinutes: 120 });
  it('booking tampil di kartu dan bentrok ditolak', () => {
    const st = book();
    expect(boardInfo('t1', false, st, at('15:00'))).toMatchObject({ state: 'booking' });
    expect(() => book(st, '20:00')).toThrow(/sudah dibooking/);
    expect(() => book(st, '21:00')).not.toThrow();
  });
  it('hangus bila belum lunas melewati batas, tetap bila lunas', () => {
    const st = book();
    expect(pruneBookings(st, at('16:59')).bookings).toHaveLength(1);
    expect(pruneBookings(st, at('17:01')).bookings).toHaveLength(0);
    expect(pruneBookings(markBookingPaid(st, st.bookings[0]!.id), at('17:01')).bookings).toHaveLength(1);
    expect(cancelBooking(st, st.bookings[0]!.id).bookings).toHaveLength(0);
  });
  it('memulai sewa di station yang dibooking menghapus booking itu', () => {
    const st = book(EMPTY_PS_STATE, '15:10');
    const next = startSession(st, { tableId: 't1', choice: dur(60), label: 'x', price: 1, graceMinutes: 5, tz: TZ, now: at('15:05') });
    expect(next.bookings).toHaveLength(0);
  });
});
