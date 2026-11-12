import { describe, expect, it } from 'vitest';
import {
  buildWorksheet, cashAdvanceBalances, COFFEE_GROUND_PAYROLL_RULES as R, createFakeData, DataError, incidentProblem, mergePayrollRules,
  pastAbsencesInYear, payrollRowToRpc, type EmployeeCompensation, type PayrollRecordInput,
} from '../src';

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof DataError ? e.code : 'galat'));
const fake = () => createFakeData({ now: () => new Date('2026-11-12T03:00:00.000Z') });
const comp = (o: Partial<EmployeeCompensation> = {}): EmployeeCompensation => ({ employeeId: 'e-sari', employeeName: 'Sari', status: 'permanent', basicSalary: 3000000, mealAllowance: 300000, bpjsAllowance: 100000, cashAdvanceInstallment: 200000, ...o });

describe('payroll di data demo: data dasar', () => {
  it('kompensasi: bawaan nol untuk karyawan aktif, simpan, dan validasi', async () => {
    const d = fake();
    const all = await d.listCompensation();
    expect(all.map((x) => x.employeeId).sort()).toEqual(['e-budi', 'e-owner', 'e-sari']);
    expect(all.every((x) => x.status === 'permanent' && x.basicSalary === 0)).toBe(true);
    const saved = await d.saveCompensation({ employeeId: 'e-sari', status: 'probation', basicSalary: 3000000, mealAllowance: 300000, bpjsAllowance: 100000, cashAdvanceInstallment: 200000 });
    expect(saved).toMatchObject({ employeeName: 'Sari', status: 'probation', basicSalary: 3000000 });
    expect((await d.listCompensation()).find((x) => x.employeeId === 'e-sari')!.status).toBe('probation');
    expect(await code(d.saveCompensation({ ...comp(), basicSalary: -1 }))).toBe('invalid');
    expect(await code(d.saveCompensation({ ...comp(), mealAllowance: 1.5 }))).toBe('invalid');
    expect(await code(d.saveCompensation({ ...comp({ employeeId: 'x' }) }))).toBe('not_found');
  });
  it('jadwal kerja: simpan, baca, kosongkan, dan tolak yang tidak sah', async () => {
    const d = fake();
    await d.saveSchedule('e-sari', [{ weekday: 1, start: '08:00' }, { weekday: 2, start: '09:30' }]);
    expect(await d.listSchedules()).toEqual({ 'e-sari': [{ weekday: 1, start: '08:00' }, { weekday: 2, start: '09:30' }] });
    await d.saveSchedule('e-sari', []);
    expect(await d.listSchedules()).toEqual({});
    expect(await code(d.saveSchedule('e-sari', [{ weekday: 9, start: '08:00' }]))).toBe('invalid');
    expect(await code(d.saveSchedule('tidak-ada', []))).toBe('not_found');
  });
  it('aturan payroll: bawaan Coffee Ground, simpan per org, dan tolak yang tidak sah', async () => {
    const d = fake();
    expect(await d.getPayrollRules()).toEqual(R);
    const saved = await d.savePayrollRules({ ...R, noLatenessBonus: 20000 });
    expect(saved.noLatenessBonus).toBe(20000);
    expect((await d.getPayrollRules()).latenessPenaltyPerTime).toBe(15000);
    expect(await code(d.savePayrollRules({ ...R, absencePenaltyPerDay: -5 }))).toBe('invalid');
    expect(mergePayrollRules({ noLatenessBonus: 7, absenceYearlyQuota: 'dua belas' })).toMatchObject({ noLatenessBonus: 7, absenceYearlyQuota: 12 });
    expect(mergePayrollRules(null)).toEqual(R);
  });
  it('catatan harian: tambah, ubah, rentang ikut kedua ujung, hapus, dan validasi', async () => {
    const d = fake();
    const a = await d.saveIncident({ employeeId: 'e-sari', date: '2026-11-05', kind: 'OPERATIONAL_MISTAKE', count: 2, notes: ' gelas pecah ' });
    await d.saveIncident({ employeeId: 'e-sari', date: '2026-11-30', kind: 'LATENESS' });
    await d.saveIncident({ employeeId: 'e-budi', date: '2026-12-01', kind: 'ABSENCE' });
    expect(a).toMatchObject({ employeeName: 'Sari', count: 2, notes: 'gelas pecah' });
    const nov = await d.listIncidents({ from: '2026-11-01', to: '2026-11-30' });
    expect(nov.map((x) => x.date)).toEqual(['2026-11-30', '2026-11-05']);
    expect(await d.listIncidents({ from: '2026-11-01', to: '2026-12-31' }, 'e-budi')).toHaveLength(1);
    await d.saveIncident({ id: a.id, employeeId: 'e-sari', date: '2026-11-05', kind: 'OPERATIONAL_MISTAKE', count: 3 });
    expect((await d.listIncidents({ from: '2026-11-05', to: '2026-11-05' }))[0]!.count).toBe(3);
    await d.deleteIncident(a.id);
    expect(await code(d.deleteIncident(a.id))).toBe('not_found');
    expect(await code(d.saveIncident({ employeeId: 'e-sari', date: '2026-11-05', kind: 'LATENESS', count: 0 }))).toBe('invalid');
    expect(await code(d.saveIncident({ employeeId: 'x', date: '2026-11-05', kind: 'LATENESS' }))).toBe('not_found');
    expect(incidentProblem({ date: 'kemarin', kind: 'LATENESS' })).toMatch(/tanggal/i);
    expect(incidentProblem({ date: '2026-11-05', kind: 'LAINNYA' as never })).toMatch(/jenis/i);
  });
  it('kasbon: pinjam dan bayar transfer boleh, potong gaji tidak boleh dicatat langsung', async () => {
    const d = fake();
    await d.saveCashAdvance({ employeeId: 'e-sari', kind: 'BORROW', amount: 500000, date: '2026-11-01', notes: 'darurat' });
    const pay = await d.saveCashAdvance({ employeeId: 'e-sari', kind: 'PAYMENT_TRANSFER', amount: 100000, date: '2026-11-03' });
    expect(cashAdvanceBalances(await d.listCashAdvances())).toEqual({ 'e-sari': 400000 });
    expect(await code(d.saveCashAdvance({ employeeId: 'e-sari', kind: 'PAYMENT_PAYROLL' as never, amount: 1000, date: '2026-11-03' }))).toBe('invalid');
    expect(await code(d.saveCashAdvance({ employeeId: 'e-sari', kind: 'BORROW', amount: 0, date: '2026-11-03' }))).toBe('invalid');
    await d.deleteCashAdvance(pay.id);
    expect(cashAdvanceBalances(await d.listCashAdvances('e-sari'))).toEqual({ 'e-sari': 500000 });
    expect((await d.listCashAdvances()).map((x) => x.date)).toEqual(['2026-11-01']);
  });
});

describe('lembar kerja dan gaji bulanan', () => {
  const sched = { 'e-sari': [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '08:00' })) };
  const base = {
    month: 11, year: 2026, tz: 'Asia/Jakarta', rules: R, today: '2026-11-13',
    employees: [comp(), comp({ employeeId: 'e-budi', employeeName: 'Budi', status: 'probation', basicSalary: 2500000, mealAllowance: 0, bpjsAllowance: 0, cashAdvanceInstallment: 0 })],
    schedules: sched, pastAbsences: {}, cashAdvanceBalance: { 'e-sari': 500000 },
  };
  const att = [
    { employeeId: 'e-sari', clockInAt: '2026-11-09T01:00:00.000Z' }, // Senin tepat waktu
    { employeeId: 'e-sari', clockInAt: '2026-11-10T01:01:00.000Z' }, // Selasa telat 1 menit
    { employeeId: 'e-sari', clockInAt: '2026-11-12T00:50:00.000Z' }, // Kamis awal; Rabu 11 absen
  ];

  it('menggabungkan telat dan absen otomatis dengan catatan manual, hari diizinkan, dan kasbon', () => {
    const rows = buildWorksheet({ ...base, attendance: att, incidents: [
      { employeeId: 'e-sari', date: '2026-11-05', kind: 'OPERATIONAL_MISTAKE', count: 2 },
      { employeeId: 'e-sari', date: '2026-11-06', kind: 'ABSENCE', count: 1 },
      { employeeId: 'e-sari', date: '2026-11-03', kind: 'EXCUSED', count: 1 }, // Selasa 3 Nov diizinkan
    ] });
    const sari = rows.find((r) => r.employeeId === 'e-sari')!;
    expect(sari.lateDates).toEqual(['2026-11-10']);
    expect(sari.absentDates).toContain('2026-11-11');
    expect(sari.absentDates).not.toContain('2026-11-03');
    expect(sari.period.latenessCount).toBe(1);
    expect(sari.period.absenceCount).toBe(sari.absentDates.length + 1);
    expect(sari.period.operationalMistakes).toBe(2);
    expect(sari.period.cashAdvanceDeduction).toBe(200000);
    expect(sari.result.operationalPenalty).toBe(10000 + 14000);
    expect(sari.result.netSalary).toBe(3000000 + 300000 - 100000 - 24000 - sari.result.absencePenalty + sari.result.latenessBonus - sari.result.latenessPenalty - 200000);
  });
  it('probasi: tanpa bonus dan denda; denda stock opname dibagi rata hanya ke karyawan tetap; bendera dan komisi', () => {
    const rows = buildWorksheet({ ...base, attendance: att, incidents: [{ employeeId: 'e-budi', date: '2026-11-05', kind: 'OPERATIONAL_MISTAKE', count: 3 }],
      stockOpnameTotal: 90000, defaultCommission: 50000, flags: { 'e-sari': { hasStockan: true, hasDeepCleaning: true } } });
    const sari = rows.find((r) => r.employeeId === 'e-sari')!, budi = rows.find((r) => r.employeeId === 'e-budi')!;
    expect(budi.result).toMatchObject({ operationalPenalty: 0, stockOpnamePenalty: 0, commission: 0, latenessBonus: 0 });
    expect(budi.result.netSalary).toBe(2500000);
    expect(sari.result).toMatchObject({ stockOpnamePenalty: 90000, commission: 50000, stockanIncentive: 100000, deepCleaningIncentive: 150000 });
  });
  it('kuota absen tahunan memakai gaji bulan sebelumnya', () => {
    const past = pastAbsencesInYear([
      { employeeId: 'e-sari', month: 9, year: 2026, absenceCount: 6 }, { employeeId: 'e-sari', month: 10, year: 2026, absenceCount: 5 },
      { employeeId: 'e-sari', month: 11, year: 2026, absenceCount: 9 }, { employeeId: 'e-sari', month: 12, year: 2025, absenceCount: 9 },
    ], 2026, 11);
    expect(past).toEqual({ 'e-sari': 11 });
    // tanpa jadwal, absen hanya dari catatan manual (jadwal + absensi kosong akan menambah absen otomatis)
    const rows = buildWorksheet({ ...base, schedules: {}, attendance: [], incidents: [{ employeeId: 'e-sari', date: '2026-11-02', kind: 'ABSENCE', count: 3 }], pastAbsences: past });
    expect(rows.find((r) => r.employeeId === 'e-sari')!.result.absencePenalty).toBe(2 * 50000);
  });

  async function periodRows(d: ReturnType<typeof fake>): Promise<PayrollRecordInput[]> {
    return buildWorksheet({ ...base, attendance: att, incidents: [], cashAdvanceBalance: cashAdvanceBalances(await d.listCashAdvances()) })
      .map((r) => ({ ...r.result, employeeId: r.employeeId, employmentStatus: r.status }));
  }

  it('simpan draf, kunci, potong kasbon, tolak ubah saat terkunci, lalu buka kunci', async () => {
    const d = fake();
    await d.saveCashAdvance({ employeeId: 'e-sari', kind: 'BORROW', amount: 500000, date: '2026-11-01' });
    const rows = await periodRows(d);
    expect(rows.find((r) => r.employeeId === 'e-sari')!.cashAdvanceDeduction).toBe(200000);
    await d.savePayrollPeriod(11, 2026, rows, false);
    expect((await d.listPayroll(11, 2026)).map((x) => x.status)).toEqual(['DRAFT', 'DRAFT']);
    await d.savePayrollPeriod(11, 2026, rows, true);
    const saved = await d.listPayroll(11, 2026);
    expect(saved.every((x) => x.status === 'PAID' && x.paidAt)).toBe(true);
    expect(cashAdvanceBalances(await d.listCashAdvances())).toEqual({ 'e-sari': 300000 });
    expect(await code(d.savePayrollPeriod(11, 2026, rows, false))).toBe('order_locked');
    expect(await d.unlockPayroll(11, 2026)).toBe(2);
    expect(cashAdvanceBalances(await d.listCashAdvances())).toEqual({ 'e-sari': 500000 });
    expect((await d.listPayroll(11, 2026)).every((x) => x.status === 'DRAFT')).toBe(true);
    expect((await d.listPayrollYear(2026))).toHaveLength(2);
    expect(await d.listPayroll(10, 2026)).toEqual([]);
  });
  it('menolak gaji bersih tidak cocok, potongan melebihi saldo saat kunci, periode dan karyawan tidak sah', async () => {
    const d = fake();
    await d.saveCashAdvance({ employeeId: 'e-sari', kind: 'BORROW', amount: 100000, date: '2026-11-01' });
    const rows = await periodRows(d);
    const sari = rows.find((r) => r.employeeId === 'e-sari')!;
    expect(await code(d.savePayrollPeriod(11, 2026, [{ ...sari, netSalary: sari.netSalary + 1 }], false))).toBe('invalid');
    const over = { ...sari, cashAdvanceDeduction: 300000, netSalary: sari.netSalary - 200000 };
    expect(await code(d.savePayrollPeriod(11, 2026, [over], true))).toBe('invalid');
    expect(await code(d.savePayrollPeriod(13, 2026, rows, false))).toBe('invalid');
    expect(await code(d.savePayrollPeriod(11, 2026, [{ ...sari, employeeId: 'x' }], false))).toBe('not_found');
    expect(await d.listPayroll(11, 2026)).toEqual([]);
  });
  it('baris untuk server memakai kunci snake_case sesuai kolom', () => {
    const r = payrollRowToRpc({ ...buildWorksheet({ ...base, attendance: [], incidents: [] })[0]!.result, employeeId: 'e-sari', employmentStatus: 'permanent' });
    expect(Object.keys(r).sort()).toEqual([
      'absence_count', 'absence_penalty', 'basic_salary', 'bpjs_allowance', 'cash_advance_deduction', 'commission', 'deep_cleaning_incentive', 'employee_id', 'employment_status',
      'lateness_bonus', 'lateness_count', 'lateness_penalty', 'meal_allowance', 'net_salary', 'operational_mistakes_count', 'operational_mistakes_penalty',
      'stock_opname_penalty', 'stockan_incentive',
    ]);
  });
});
