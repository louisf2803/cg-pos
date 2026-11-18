import { describe, expect, it } from 'vitest';
import { blockHours, dayRangeUtc, freeUntil, overlapsBlocks, psBlocks, psScheduleError, timelineHours, type PsBookingRow, type PsSessionRow } from '../src';

const TZ = 'Asia/Jakarta';
const at = (hhmm: string, day = '2026-11-18') => new Date(`${day}T${hhmm}:00+07:00`);
const sess = (over: Partial<PsSessionRow>): PsSessionRow => ({ id: 's', tableId: 't1', pressedAt: at('14:21').toISOString(), billableStart: at('14:26').toISOString(), endsAt: at('16:26').toISOString(), parts: [], total: 20000, paid: false, status: 'running', rev: 1, ...over });
const book = (over: Partial<PsBookingRow>): PsBookingRow => ({ id: 'b', tableId: 't1', name: 'Budi', startAt: at('19:00').toISOString(), durationMinutes: 120, label: '2 jam', price: 24000, paid: false, status: 'active', expiresAt: at('17:00').toISOString(), rev: 1, ...over });

describe('blok waktu jadwal PS', () => {
  it('sesi berjalan, hampir habis, dan lewat waktu', () => {
    expect(psBlocks([sess({})], [], at('15:00'))[0]!.kind).toBe('running');
    expect(psBlocks([sess({})], [], at('16:20'))[0]!.kind).toBe('warning');
    const over = psBlocks([sess({})], [], at('16:35'))[0]!;
    expect(over.kind).toBe('overtime');
    expect(over.overtimeEnd!.toISOString()).toBe(at('16:35').toISOString());
  });
  it('booking lunas dan belum lunas; batal dan hangus tidak tampil', () => {
    const blocks = psBlocks([], [book({ paid: true }), book({ id: 'b2', paid: false, startAt: at('21:00').toISOString() }), book({ id: 'b3', status: 'cancelled' }), book({ id: 'b4', status: 'expired' })], at('15:00'));
    expect(blocks.map((b) => b.kind)).toEqual(['booking-paid', 'booking-unpaid']);
    expect(blocks[0]!.end.toISOString()).toBe(at('21:00').toISOString());
  });
  it('sesi selesai tampil abu-abu sampai waktu selesai sebenarnya', () => {
    const b = psBlocks([sess({ status: 'finished', finishedAt: at('15:30').toISOString() })], [], at('16:00'))[0]!;
    expect(b.kind).toBe('finished');
    expect(b.end.toISOString()).toBe(at('15:30').toISOString());
  });
  it('urut menurut waktu mulai', () => {
    const blocks = psBlocks([sess({ id: 'late', billableStart: at('18:00').toISOString(), endsAt: at('19:00').toISOString() }), sess({ id: 'early' })], [], at('13:00'));
    expect(blocks.map((b) => b.id)).toEqual(['early', 'late']);
  });
});

describe('rentang dan posisi', () => {
  it('rentang hari lokal outlet dalam UTC', () => {
    const r = dayRangeUtc('2026-11-18', TZ);
    expect(r.from.toISOString()).toBe('2026-11-17T17:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-11-18T17:00:00.000Z');
  });
  it('jam blok relatif terhadap awal hari', () => {
    const { from } = dayRangeUtc('2026-11-18', TZ);
    const h = blockHours({ start: at('14:30'), end: at('16:30') }, from);
    expect(h).toEqual({ start: 14.5, end: 16.5 });
  });
  it('rentang jam melebar bila ada blok di luar 10 sampai 24', () => {
    const { from } = dayRangeUtc('2026-11-18', TZ);
    const early = psBlocks([sess({ billableStart: at('08:30').toISOString(), endsAt: at('09:30').toISOString() })], [], at('09:00'));
    expect(timelineHours(early, from, TZ)).toEqual({ start: 8, end: 24 });
    const late = psBlocks([], [book({ startAt: at('23:00').toISOString(), durationMinutes: 180 })], at('09:00'));
    expect(timelineHours(late, from, TZ).end).toBe(26);
    expect(timelineHours([], from, TZ)).toEqual({ start: 10, end: 24 });
  });
});

describe('kosong dan tumpang tindih', () => {
  const blocks = psBlocks([sess({})], [book({ startAt: at('19:00').toISOString() })], at('15:00'));
  it('station kosong sampai booking berikutnya', () => {
    expect(freeUntil('t1', blocks, at('15:00')).free).toBe(false);
    const f = freeUntil('t1', blocks, at('17:00'));
    expect(f.free).toBe(true);
    expect(f.until!.toISOString()).toBe(at('19:00').toISOString());
    expect(freeUntil('t2', blocks, at('17:00'))).toEqual({ free: true });
  });
  it('mendeteksi tumpang tindih booking baru', () => {
    expect(overlapsBlocks('t1', at('20:00'), at('21:00'), blocks)?.title).toBe('Budi');
    expect(overlapsBlocks('t1', at('21:00'), at('22:00'), blocks)).toBeNull();
    expect(overlapsBlocks('t2', at('20:00'), at('21:00'), blocks)).toBeNull();
  });
  it('menerjemahkan galat server', () => {
    expect(psScheduleError('booking clash')).toMatch(/sudah dibooking/);
    expect(psScheduleError('station busy')).toMatch(/sedang dipakai/);
  });
});
