import { describe, expect, it } from 'vitest';
import {
  absenceAdjustment, cashAdvanceBalance, COFFEE_GROUND_PAYROLL_RULES as R, computePayroll, dateRange, deriveAttendance, latenessAdjustment,
  operationalPenalty, payrollRulesProblem, scheduleProblem, splitStockOpnamePenalty, suggestedInstallment, weekdayOf,
  type PayrollPeriodInput,
} from '../src';

const period = (o: Partial<PayrollPeriodInput> = {}): PayrollPeriodInput => ({
  latenessCount: 0, absenceCount: 0, pastAbsencesInYear: 0, operationalMistakes: 0, hasStockan: false, hasDeepCleaning: false,
  cashAdvanceDeduction: 0, commission: 0, stockOpnamePenalty: 0, ...o,
});

describe('aturan dasar (nilai bawaan Coffee Ground)', () => {
  it('denda salah operasional bertingkat', () => {
    expect(operationalPenalty(0, R)).toBe(0);
    expect(operationalPenalty(1, R)).toBe(10000);
    expect(operationalPenalty(3, R)).toBe(10000 + 14000 + 18000);
  });
  it('telat: bonus bila nol, dimaafkan 1 sampai 3, denda per kali mulai 4', () => {
    expect(latenessAdjustment(0, R)).toEqual({ bonus: 50000, penalty: 0 });
    expect(latenessAdjustment(1, R)).toEqual({ bonus: 0, penalty: 0 });
    expect(latenessAdjustment(3, R)).toEqual({ bonus: 0, penalty: 0 });
    expect(latenessAdjustment(4, R)).toEqual({ bonus: 0, penalty: 60000 });
    expect(latenessAdjustment(6, R)).toEqual({ bonus: 0, penalty: 90000 });
  });
  it('absen: denda hanya untuk hari yang baru melewati kuota tahunan', () => {
    expect(absenceAdjustment(2, 0, R)).toEqual({ penalty: 0, remainingBefore: 12, remainingAfter: 10 });
    expect(absenceAdjustment(5, 10, R)).toEqual({ penalty: 3 * 50000, remainingBefore: 2, remainingAfter: 0 });
    expect(absenceAdjustment(2, 14, R)).toEqual({ penalty: 2 * 50000, remainingBefore: 0, remainingAfter: 0 });
    expect(absenceAdjustment(12, 0, R).penalty).toBe(0);
    expect(absenceAdjustment(13, 0, R).penalty).toBe(50000);
  });
  it('denda stock opname dibagi rata hanya ke karyawan tetap', () => {
    expect(splitStockOpnamePenalty(100001, ['permanent', 'permanent', 'probation', 'admin'])).toBe(50000);
    expect(splitStockOpnamePenalty(90000, ['probation', 'admin'])).toBe(0);
    expect(splitStockOpnamePenalty(-5, ['permanent'])).toBe(0);
  });
  it('aturan harus rupiah bulat dan batas wajar', () => {
    expect(payrollRulesProblem(R)).toBeNull();
    expect(payrollRulesProblem({ ...R, noLatenessBonus: -1 })).toMatch(/rupiah/i);
    expect(payrollRulesProblem({ ...R, absencePenaltyPerDay: 1.5 })).toMatch(/rupiah/i);
    expect(payrollRulesProblem({ ...R, absenceYearlyQuota: 400 })).toMatch(/0 sampai 366/);
  });
});

describe('gaji bersih', () => {
  const base = { basicSalary: 3000000, mealAllowance: 300000, bpjsAllowance: 100000 };
  const full = period({ operationalMistakes: 1, hasStockan: true, hasDeepCleaning: true, stockOpnamePenalty: 20000, cashAdvanceDeduction: 200000, commission: 80000 });

  it('karyawan tetap: semua komponen masuk rumus', () => {
    const r = computePayroll({ status: 'permanent', ...base }, full, R);
    expect(r).toMatchObject({ latenessBonus: 50000, operationalPenalty: 10000, stockanIncentive: 100000, deepCleaningIncentive: 150000, stockOpnamePenalty: 20000, commission: 80000, cashAdvanceDeduction: 200000 });
    expect(r.netSalary).toBe(3350000);
  });
  it('probasi: gaji pokok dan insentif tetap, tanpa bonus, denda, dan komisi', () => {
    const r = computePayroll({ status: 'probation', ...base }, { ...full, latenessCount: 9, absenceCount: 20 }, R);
    expect(r).toMatchObject({ latenessBonus: 0, latenessPenalty: 0, absencePenalty: 0, operationalPenalty: 0, stockOpnamePenalty: 0, commission: 0, stockanIncentive: 100000, deepCleaningIncentive: 150000 });
    expect(r.netSalary).toBe(3000000 + 300000 - 100000 + 100000 + 150000 - 200000);
  });
  it('admin: tanpa gaji pokok, tunjangan, bonus, denda, dan deep cleaning; insentif stokan dan komisi tetap', () => {
    const r = computePayroll({ status: 'admin', ...base }, { ...full, cashAdvanceDeduction: 0 }, R);
    expect(r).toMatchObject({ basicSalary: 0, mealAllowance: 0, bpjsAllowance: 0, deepCleaningIncentive: 0, latenessBonus: 0, operationalPenalty: 0 });
    expect(r.netSalary).toBe(100000 + 80000);
  });
  it('telat banyak dan absen melewati kuota mengurangi gaji', () => {
    const r = computePayroll({ status: 'permanent', ...base }, period({ latenessCount: 5, absenceCount: 3, pastAbsencesInYear: 11 }), R);
    expect(r.latenessPenalty).toBe(75000);
    expect(r.absencePenalty).toBe(2 * 50000);
    expect(r.netSalary).toBe(3000000 + 300000 - 100000 - 75000 - 100000);
  });
  it('aturan per org mengubah hasil tanpa mengubah kode', () => {
    const custom = { ...R, noLatenessBonus: 20000, stockanIncentive: 30000 };
    const r = computePayroll({ status: 'permanent', ...base }, period({ hasStockan: true }), custom);
    expect(r.netSalary).toBe(3000000 + 300000 - 100000 + 20000 + 30000);
  });
});

describe('kasbon', () => {
  it('saldo = pinjam - bayar (transfer dan potong gaji)', () => {
    expect(cashAdvanceBalance([{ type: 'BORROW', amount: 500000 }, { type: 'PAYMENT_TRANSFER', amount: 100000 }, { type: 'PAYMENT_PAYROLL', amount: 150000 }])).toBe(250000);
    expect(cashAdvanceBalance([])).toBe(0);
  });
  it('potongan cicilan tidak melebihi saldo dan tidak negatif', () => {
    expect(suggestedInstallment(250000, 300000)).toBe(250000);
    expect(suggestedInstallment(250000, 100000)).toBe(100000);
    expect(suggestedInstallment(-5000, 100000)).toBe(0);
    expect(suggestedInstallment(250000, 0)).toBe(0);
  });
});

describe('telat dan absen otomatis dari absensi dan jadwal', () => {
  const senin_jumat = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '08:00' }));
  const rec = (iso: string) => ({ clockInAt: iso });
  const records = [
    rec('2026-11-09T01:00:00.000Z'), // Senin 08.00 WIB: tepat waktu
    rec('2026-11-10T01:01:00.000Z'), // Selasa 08.01: telat
    // Rabu 11 Nov: tidak masuk
    rec('2026-11-12T02:00:00.000Z'), rec('2026-11-12T00:50:00.000Z'), // Kamis: masuk pertama 07.50
    rec('2026-11-14T01:30:00.000Z'), // Sabtu: bukan hari kerja
  ];

  it('mengenali telat, absen, dan hari masuk; akhir pekan diabaikan', () => {
    const d = deriveAttendance(records, senin_jumat, '2026-11-09', '2026-11-15', 'Asia/Jakarta', R, [], '2026-11-13');
    expect(d.lateDates).toEqual(['2026-11-10']);
    expect(d.absentDates).toEqual(['2026-11-11']);
    expect(d.workedDates).toEqual(['2026-11-09', '2026-11-10', '2026-11-12']);
  });
  it('hari yang belum lewat tidak dihitung absen, dan toleransi menit dipakai', () => {
    const d = deriveAttendance(records, senin_jumat, '2026-11-09', '2026-11-15', 'Asia/Jakarta', { latenessGraceMinutes: 5 }, [], '2026-11-12');
    expect(d.lateDates).toEqual([]);
    expect(d.absentDates).toEqual(['2026-11-11']);
    expect(deriveAttendance([], senin_jumat, '2026-11-12', '2026-11-13', 'Asia/Jakarta', R, [], '2026-11-12').absentDates).toEqual([]);
  });
  it('hari yang sudah diizinkan (cuti, izin, libur) tidak dihitung absen', () => {
    const d = deriveAttendance(records, senin_jumat, '2026-11-09', '2026-11-15', 'Asia/Jakarta', R, ['2026-11-11'], '2026-11-13');
    expect(d.absentDates).toEqual([]);
  });
  it('zona waktu menentukan tanggal lokal: masuk 23.30 UTC adalah 06.30 hari berikutnya di Jakarta (lebih awal, tidak telat)', () => {
    const d = deriveAttendance([rec('2026-11-09T23:30:00.000Z')], senin_jumat, '2026-11-09', '2026-11-11', 'Asia/Jakarta', R, [], '2026-11-12');
    expect(d.workedDates).toEqual(['2026-11-10']);
    expect(d.lateDates).toEqual([]);
    expect(d.absentDates).toEqual(['2026-11-09', '2026-11-11']);
  });
  it('jadwal kosong tidak menghasilkan apa pun', () => {
    expect(deriveAttendance(records, [], '2026-11-09', '2026-11-15', 'Asia/Jakarta', R)).toEqual({ lateDates: [], absentDates: [], workedDates: [] });
  });
  it('memeriksa jadwal dan menghitung hari', () => {
    expect(scheduleProblem(senin_jumat)).toBeNull();
    expect(scheduleProblem([{ weekday: 7, start: '08:00' }])).toMatch(/0 \(Minggu\)/);
    expect(scheduleProblem([{ weekday: 1, start: '8:00' }])).toMatch(/JJ:MM/);
    expect(scheduleProblem([{ weekday: 1, start: '08:00' }, { weekday: 1, start: '09:00' }])).toMatch(/satu jam mulai/);
    expect(weekdayOf('2026-11-09')).toBe(1);
    expect(dateRange('2026-11-28', '2026-12-02')).toEqual(['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  });
});
