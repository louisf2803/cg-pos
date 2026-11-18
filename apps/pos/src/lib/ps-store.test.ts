import { describe, expect, it } from 'vitest';
import type { PsBoard, PsChoice } from '@cgpos/shared';
import { EMPTY_PS_STATE, addBooking, boardInfo, cancelBooking, extendSession, finishSession, markBookingPaid, mergeBoard, pruneState, startSession } from './ps-store';

const TZ = 'Asia/Jakarta';
const at = (hhmm: string) => new Date(`2026-11-17T${hhmm}:00+07:00`);
const dur = (minutes: number): PsChoice => ({ kind: 'duration', minutes });
const start = (now: Date, minutes = 60, table = 't1') => startSession(EMPTY_PS_STATE, { tableId: table, choice: dur(minutes), label: `${minutes} menit`, price: 10000, graceMinutes: 5, tz: TZ, now });
const range = { from: at('00:00'), to: new Date(at('00:00').getTime() + 7 * 86400000) };

describe('sesi PS di tablet', () => {
  it('mulai 15.21: dihitung 15.26 sampai 16.26, masuk antrean kirim', () => {
    const st = start(at('15:21'));
    const s = st.sessions[0]!;
    expect(s.billableStart).toBe(at('15:26').toISOString());
    expect(s.endsAt).toBe(at('16:26').toISOString());
    expect(s.total).toBe(10000);
    expect(s.rev).toBe(1);
    expect(st.dirty.sessions).toEqual([s.id]);
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
  it('tambah waktu menyambung dan menaikkan rev', () => {
    const st = start(at('15:21'));
    const id = st.sessions[0]!.id;
    const a = extendSession(st, id, { minutes: 30, label: '+30', price: 5000, now: at('16:00') }).sessions[0]!;
    expect(a.endsAt).toBe(at('16:56').toISOString());
    expect(a.total).toBe(15000);
    expect(a.rev).toBe(2);
    const b = extendSession(st, id, { minutes: 30, label: '+30', price: 5000, now: at('16:40') }).sessions[0]!;
    expect(b.endsAt).toBe(at('17:10').toISOString());
  });
  it('selesai: sesi tetap ada (untuk jadwal) tetapi station kosong lagi', () => {
    const st = start(at('15:21'));
    const done = finishSession(st, st.sessions[0]!.id, at('16:00'));
    expect(done.sessions[0]).toMatchObject({ status: 'finished', rev: 2, finishedAt: at('16:00').toISOString() });
    expect(boardInfo('t1', false, done, at('16:01')).state).toBe('kosong');
    expect(() => startSession(done, { tableId: 't1', choice: dur(30), label: 'x', price: 1, graceMinutes: 0, tz: TZ, now: at('16:05') })).not.toThrow();
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
  it('booking tidak boleh menimpa sesi yang masih berjalan', () => {
    const running = start(at('18:00'), 120);
    expect(() => book(running, '19:00')).toThrow(/sedang dipakai/);
    expect(() => book(running, '20:30')).not.toThrow();
  });
  it('belum lunas melewati batas = hangus (disinkronkan), lunas bertahan, batal tidak tampil', () => {
    const st = book();
    const gone = pruneState(st, at('17:01'));
    expect(gone.bookings[0]!.status).toBe('expired');
    expect(gone.dirty.bookings).toContain(st.bookings[0]!.id);
    expect(pruneState(markBookingPaid(st, st.bookings[0]!.id), at('17:01')).bookings[0]!.status).toBe('active');
    expect(boardInfo('t1', false, cancelBooking(st, st.bookings[0]!.id), at('15:00')).state).toBe('kosong');
  });
  it('memulai sewa di station yang dibooking menandai booking itu started', () => {
    const st = book(EMPTY_PS_STATE, '15:10');
    const next = startSession(st, { tableId: 't1', choice: dur(60), label: 'x', price: 1, graceMinutes: 5, tz: TZ, now: at('15:05') });
    expect(next.bookings[0]).toMatchObject({ status: 'started', rev: 2 });
    expect(next.dirty.bookings).toHaveLength(1);
  });
});

describe('gabung jadwal dari server', () => {
  const synced = (st: ReturnType<typeof start>) => ({ ...st, dirty: { sessions: [], bookings: [] } });
  it('catatan belum terkirim tidak ditimpa server; yang sudah terkirim ditimpa rev lebih besar', () => {
    const st = start(at('15:21'));
    const id = st.sessions[0]!.id;
    const board: PsBoard = { sessions: [{ ...st.sessions[0]!, total: 99000, rev: 5 }], bookings: [] };
    expect(mergeBoard(st, board, range).sessions[0]!.total).toBe(10000); // masih dirty
    expect(mergeBoard(synced(st), board, range).sessions.find((s) => s.id === id)!.total).toBe(99000);
  });
  it('sesi dan booking dari tablet atau aplikasi lain ditambahkan', () => {
    const board: PsBoard = {
      sessions: [{ id: 'x', tableId: 't2', pressedAt: at('14:00').toISOString(), billableStart: at('14:05').toISOString(), endsAt: at('15:05').toISOString(), parts: [], total: 1000, paid: false, status: 'running', rev: 1 }],
      bookings: [{ id: 'y', tableId: 't3', name: 'Lina', startAt: at('16:00').toISOString(), durationMinutes: 120, label: '2 jam', price: 24000, paid: true, status: 'active', expiresAt: at('15:00').toISOString(), rev: 1 }],
    };
    const m = mergeBoard(EMPTY_PS_STATE, board, range);
    expect(m.sessions.map((s) => s.id)).toEqual(['x']);
    expect(m.bookings.map((b) => b.id)).toEqual(['y']);
  });
  it('booking aktif yang sudah tidak ada di server (dibatalkan di tempat lain) dibuang, kecuali belum terkirim', () => {
    const st = synced(addBooking(EMPTY_PS_STATE, { tableId: 't1', name: 'Budi', phone: '', startAt: at('19:00').toISOString(), durationMinutes: 60, label: '1 jam', price: 1, now: at('15:00'), expiryMinutes: 120 }));
    expect(mergeBoard(st, { sessions: [], bookings: [] }, range).bookings).toHaveLength(0);
    const dirty = addBooking(EMPTY_PS_STATE, { tableId: 't1', name: 'Budi', phone: '', startAt: at('19:00').toISOString(), durationMinutes: 60, label: '1 jam', price: 1, now: at('15:00'), expiryMinutes: 120 });
    expect(mergeBoard(dirty, { sessions: [], bookings: [] }, range).bookings).toHaveLength(1);
  });
});
