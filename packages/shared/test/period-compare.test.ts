import { describe, expect, it } from 'vitest';
import {
  percentChange,
  getDaysInMonth,
  shiftDateDays,
  getPreviousPeriod,
  monthToDateAccumulation,
  projectMonthEnd,
} from '../src';

describe('period-compare: percentChange', () => {
  it('menghitung kenaikan dan penurunan standar', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(125, 100)).toBe(25);
    expect(percentChange(100, 100)).toBe(0);
  });

  it('menangani kasus tepi sebelumnya 0', () => {
    // Sebelumnya 0 -> 100% bila sekarang > 0
    expect(percentChange(500000, 0)).toBe(100);
    // Keduanya 0 -> 0%
    expect(percentChange(0, 0)).toBe(0);
    // Sebelumnya 0 dan sekarang < 0 -> -100%
    expect(percentChange(-1000, 0)).toBe(-100);
  });

  it('membulatkan 1 desimal', () => {
    expect(percentChange(133, 100)).toBe(33);
    expect(percentChange(133.33, 100)).toBe(33.3);
  });
});

describe('period-compare: getDaysInMonth & uji tepi Februari', () => {
  it('menghitung hari Februari pada tahun biasa vs tahun kabisat', () => {
    // 2024 kabisat: 29 hari
    expect(getDaysInMonth(2024, 2)).toBe(29);
    // 2026 bukan kabisat: 28 hari
    expect(getDaysInMonth(2026, 2)).toBe(28);
    // 2000 kabisat abad: 29 hari
    expect(getDaysInMonth(2000, 2)).toBe(29);
    // 2100 bukan kabisat abad: 28 hari
    expect(getDaysInMonth(2100, 2)).toBe(28);
  });

  it('menghitung bulan 30 dan 31 hari', () => {
    expect(getDaysInMonth(2026, 1)).toBe(31); // Jan
    expect(getDaysInMonth(2026, 4)).toBe(30); // Apr
    expect(getDaysInMonth(2026, 7)).toBe(31); // Jul
    expect(getDaysInMonth(2026, 8)).toBe(31); // Agu
    expect(getDaysInMonth(2026, 12)).toBe(31); // Des
  });
});

describe('period-compare: getPreviousPeriod & uji pergantian tahun', () => {
  it('harian: bergeser 1 hari sebelumnya termasuk melintasi batas bulan dan tahun', () => {
    expect(getPreviousPeriod('daily', { from: '2026-03-15', to: '2026-03-15' })).toEqual({
      from: '2026-03-14',
      to: '2026-03-14',
    });

    // Batas bulan: 1 Maret 2026 -> 28 Februari 2026 (non-kabisat)
    expect(getPreviousPeriod('daily', { from: '2026-03-01', to: '2026-03-01' })).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });

    // Batas bulan kabisat: 1 Maret 2024 -> 29 Februari 2024 (kabisat)
    expect(getPreviousPeriod('daily', { from: '2024-03-01', to: '2024-03-01' })).toEqual({
      from: '2024-02-29',
      to: '2024-02-29',
    });

    // Pergantian tahun: 1 Januari 2026 -> 31 Desember 2025
    expect(getPreviousPeriod('daily', { from: '2026-01-01', to: '2026-01-01' })).toEqual({
      from: '2025-12-31',
      to: '2025-12-31',
    });
  });

  it('mingguan: bergeser 7 hari sebelumnya', () => {
    expect(getPreviousPeriod('weekly', { from: '2026-03-08', to: '2026-03-14' })).toEqual({
      from: '2026-03-01',
      to: '2026-03-07',
    });

    // Melintasi pergantian tahun
    expect(getPreviousPeriod('weekly', { from: '2026-01-01', to: '2026-01-07' })).toEqual({
      from: '2025-12-25',
      to: '2025-12-31',
    });
  });

  it('bulanan: mengambil bulan kalender penuh sebelumnya termasuk pergantian tahun', () => {
    // Maret 2026 -> Februari 2026 (28 hari)
    expect(getPreviousPeriod('monthly', { from: '2026-03-01', to: '2026-03-31' })).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });

    // Maret 2024 -> Februari 2024 (29 hari kabisat)
    expect(getPreviousPeriod('monthly', { from: '2024-03-01', to: '2024-03-31' })).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });

    // Januari 2026 -> Desember 2025 (31 hari) - Pergantian tahun
    expect(getPreviousPeriod('monthly', { from: '2026-01-01', to: '2026-01-31' })).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });
});

describe('period-compare: monthToDateAccumulation', () => {
  const dailyData = [
    { date: '2026-02-28', value: 100_000 },
    { date: '2026-03-01', value: 200_000 },
    { date: '2026-03-02', value: 300_000 },
    { date: '2026-03-03', value: 250_000 },
    { date: '2026-03-04', value: 400_000 },
  ];

  it('mengakumulasikan hanya dari awal bulan berjalan sampai tanggal acuan', () => {
    // Hingga 3 Maret: 200k + 300k + 250k = 750k (28 Feb tidak ikut)
    expect(monthToDateAccumulation(dailyData, '2026-03-03')).toBe(750_000);
    // Hingga 1 Maret: 200k
    expect(monthToDateAccumulation(dailyData, '2026-03-01')).toBe(200_000);
  });

  it('mengembalikan 0 bila belum ada data di bulan tersebut', () => {
    expect(monthToDateAccumulation(dailyData, '2026-04-01')).toBe(0);
  });
});

describe('period-compare: projectMonthEnd & uji pembagi nol', () => {
  it('menghitung proyeksi linier akhir bulan secara wajar', () => {
    // Tanggal 10 dari 31 hari, akumulasi 10 jt -> rata-rata 1 jt/hari -> proyeksi 31 jt
    expect(projectMonthEnd(10_000_000, 10, 31)).toBe(31_000_000);

    // Tanggal 15 dari 30 hari, akumulasi 15 jt -> proyeksi 30 jt
    expect(projectMonthEnd(15_000_000, 15, 30)).toBe(30_000_000);
  });

  it('uji kasus tepi pembagi nol (hari berjalan <= 0)', () => {
    expect(projectMonthEnd(5_000_000, 0, 31)).toBe(0);
    expect(projectMonthEnd(5_000_000, -1, 31)).toBe(0);
  });

  it('hari berjalan >= total hari mengembalikan nilai akumulasi saat ini', () => {
    expect(projectMonthEnd(25_000_000, 31, 31)).toBe(25_000_000);
    expect(projectMonthEnd(25_000_000, 35, 31)).toBe(25_000_000);
  });
});

