import { describe, expect, it } from 'vitest';
import { autoCloseDue } from './AutoCloseWatcher';

const base = { enabled: true, time: '23:59', tz: 'Asia/Jakarta' };
// 15 Nov 2026 23.59 WIB = 16.59 UTC
const at = (hhmmWib: string, day = '2026-11-15') => new Date(`${day}T${hhmmWib}:00+07:00`);

describe('pengingat tutup kasir otomatis', () => {
  it('mati bila fitur tidak aktif', () => {
    expect(autoCloseDue({ ...base, enabled: false, now: at('23:59'), shiftOpenedAt: at('08:00').toISOString() })).toBe(false);
  });
  it('belum waktunya sebelum jam yang diatur', () => {
    expect(autoCloseDue({ ...base, now: at('23:58'), shiftOpenedAt: at('08:00').toISOString() })).toBe(false);
  });
  it('tampil tepat dan setelah jam yang diatur bila shift dibuka sebelum jam itu', () => {
    expect(autoCloseDue({ ...base, now: at('23:59'), shiftOpenedAt: at('08:00').toISOString() })).toBe(true);
    expect(autoCloseDue({ ...base, time: '22:00', now: at('22:30'), shiftOpenedAt: at('08:00').toISOString() })).toBe(true);
  });
  it('shift yang dibuka SETELAH jam tutup hari ini tidak langsung diganggu', () => {
    expect(autoCloseDue({ ...base, time: '22:00', now: at('22:40'), shiftOpenedAt: at('22:30').toISOString() })).toBe(false);
  });
  it('shift yang tertinggal dari hari sebelumnya tetap diingatkan', () => {
    expect(autoCloseDue({ ...base, time: '22:00', now: at('22:10'), shiftOpenedAt: at('23:00', '2026-11-14').toISOString() })).toBe(true);
  });
  it('memakai zona waktu outlet, bukan UTC', () => {
    // 16.00 UTC = 23.00 WIB: lewat jam 22.00 WIB
    expect(autoCloseDue({ ...base, time: '22:00', now: new Date('2026-11-15T16:00:00Z'), shiftOpenedAt: new Date('2026-11-15T01:00:00Z').toISOString() })).toBe(true);
  });
});
