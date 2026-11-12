import { describe, expect, it } from 'vitest';
import { DataError } from '../src/types';
import { COFFEE_GROUND_PAYROLL_RULES, buildWorksheet, type PayrollRecord } from '../src/payroll';
import {
  applyWorksheetCashAdvanceOverrides,
  computePayslipSubtotals,
  copyScheduleToWorkdays,
  draftFlagsFromPayrollRecords,
  isForbiddenError,
  localMonthUtcRange,
  monthBounds,
  payrollErrorMessage,
  payrollUnlockErrorMessage,
  scheduleArrayFromMap,
  scheduleMapFromArray,
  summarizeCashAdvanceTotals,
  summarizeIncidentsByEmployee,
  summarizePayrollTotals,
} from '../src/payroll-ui';

describe('payroll-ui helpers', () => {
  it('mengubah jadwal array <-> peta dan menyalin ke hari kerja Senin..Jumat', () => {
    const map = scheduleMapFromArray([
      { weekday: 1, start: '09:00' },
      { weekday: 6, start: '10:30' },
    ]);
    expect(map[1]).toBe('09:00');
    expect(map[6]).toBe('10:30');

    const copied = copyScheduleToWorkdays(map);
    for (const d of [1, 2, 3, 4, 5]) expect(copied[d]).toBe('09:00');
    expect(copied[6]).toBe('10:30');
    expect(copied[0]).toBeUndefined();

    const defaultCopied = copyScheduleToWorkdays({});
    for (const d of [1, 2, 3, 4, 5]) expect(defaultCopied[d]).toBe('08:00');

    const arr = scheduleArrayFromMap({ ...copied, 2: ' 09:15 ', 0: '' });
    expect(arr.map((x) => `${x.weekday}:${x.start}`)).toEqual([
      '1:09:00',
      '2:09:15',
      '3:09:00',
      '4:09:00',
      '5:09:00',
      '6:10:30',
    ]);
  });

  it('menghitung batas bulan termasuk tahun kabisat', () => {
    expect(monthBounds(2024, 2)).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthBounds(2026, 11)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('meringkas catatan harian dan saldo kasbon per karyawan', () => {
    const inc = summarizeIncidentsByEmployee(
      [
        { employeeId: 'e1', employeeName: 'Budi', kind: 'LATENESS', count: 2 },
        { employeeId: 'e1', employeeName: 'Budi', kind: 'EXCUSED', count: 1 },
        { employeeId: 'e1', employeeName: 'Budi', kind: 'OPERATIONAL_MISTAKE', count: 1 },
      ],
      [
        { employeeId: 'e1', employeeName: 'Budi' },
        { employeeId: 'e2', employeeName: 'Ani' },
      ],
    );
    expect(inc).toEqual([
      { employeeId: 'e2', employeeName: 'Ani', lateness: 0, absence: 0, operationalMistake: 0, excused: 0 },
      { employeeId: 'e1', employeeName: 'Budi', lateness: 2, absence: 0, operationalMistake: 1, excused: 1 },
    ]);

    const ca = summarizeCashAdvanceTotals([
      { employeeId: 'e1', kind: 'BORROW', amount: 500000 },
      { employeeId: 'e1', kind: 'PAYMENT_TRANSFER', amount: 150000 },
      { employeeId: 'e1', kind: 'PAYMENT_PAYROLL', amount: 100000 },
      { employeeId: 'e2', kind: 'BORROW', amount: 200000 },
      { employeeId: 'e2', kind: 'PAYMENT_TRANSFER', amount: 200000 },
    ]);
    expect(ca.totalBorrowed).toBe(700000);
    expect(ca.totalPaidTransfer).toBe(350000);
    expect(ca.totalPaidPayroll).toBe(100000);
    expect(ca.totalOutstanding).toBe(250000);
    expect(ca.activeBorrowers).toBe(1);
    expect(ca.balancesByEmployee['e1']).toBe(250000);
    expect(ca.balancesByEmployee['e2']).toBe(0);
  });

  it('mengenali galat forbidden dari DataError dan pesan server', () => {
    expect(isForbiddenError(new DataError('forbidden', 'Khusus pemilik'))).toBe(true);
    expect(isForbiddenError(new Error('permission denied for table cash_advances (42501)'))).toBe(true);
    expect(isForbiddenError(new Error('Jaringan putus'))).toBe(false);
    expect(payrollErrorMessage(new DataError('forbidden', 'denied')).forbidden).toBe(true);
    expect(payrollErrorMessage(new Error('Simpan gagal')).message).toBe('Simpan gagal');
    expect(payrollUnlockErrorMessage(new DataError('forbidden', 'Hanya owner'))).toMatch(/hanya Pemilik/i);
  });

  it('mengubah bulan lokal outlet menjadi rentang UTC dan menghitung override potongan kasbon', () => {
    expect(localMonthUtcRange(2026, 11, 'Asia/Jakarta')).toEqual({
      from: '2026-10-31T17:00:00.000Z',
      to: '2026-11-30T17:00:00.000Z',
    });

    const employees = [
      {
        employeeId: 'e1',
        employeeName: 'Budi',
        status: 'permanent' as const,
        basicSalary: 2500000,
        mealAllowance: 300000,
        bpjsAllowance: 100000,
        cashAdvanceInstallment: 200000,
      },
    ];
    const base = buildWorksheet({
      month: 11,
      year: 2026,
      tz: 'Asia/Jakarta',
      rules: COFFEE_GROUND_PAYROLL_RULES,
      today: '2026-11-01',
      employees,
      schedules: { e1: [] },
      attendance: [],
      incidents: [],
      pastAbsences: {},
      cashAdvanceBalance: { e1: 350000 },
    });
    expect(base[0]?.result.cashAdvanceDeduction).toBe(200000);

    const applied = applyWorksheetCashAdvanceOverrides(
      base,
      employees,
      { e1: 300000 },
      { e1: 350000 },
      COFFEE_GROUND_PAYROLL_RULES,
    );
    expect(applied.problems).toEqual({});
    expect(applied.rows[0]?.result.cashAdvanceDeduction).toBe(300000);
    expect(applied.rows[0]?.result.netSalary).toBe((base[0]?.result.netSalary ?? 0) - 100000);

    const overLimit = applyWorksheetCashAdvanceOverrides(
      base,
      employees,
      { e1: 400000 },
      { e1: 350000 },
      COFFEE_GROUND_PAYROLL_RULES,
    );
    expect(overLimit.problems.e1).toMatch(/melebihi saldo/i);

    const totals = summarizePayrollTotals(applied.rows.map((r) => r.result));
    expect(totals).toEqual({
      totalNetSalary: applied.rows[0]!.result.netSalary,
      totalCashAdvanceDeduction: 300000,
      count: 1,
    });

    const sub = computePayslipSubtotals(applied.rows[0]!.result);
    expect(sub.grossEarnings - sub.totalDeductions).toBe(applied.rows[0]!.result.netSalary);

    const savedRec: PayrollRecord = {
      ...applied.rows[0]!.result,
      id: 'pr1',
      employeeId: 'e1',
      employeeName: 'Budi',
      employmentStatus: 'permanent',
      month: 11,
      year: 2026,
      status: 'DRAFT',
      stockanIncentive: 100000,
      deepCleaningIncentive: 0,
      commission: 50000,
    };
    const seeded = draftFlagsFromPayrollRecords([savedRec]);
    expect(seeded.flags.e1).toEqual({
      hasStockan: true,
      hasDeepCleaning: false,
      commission: 50000,
    });
    expect(seeded.cashAdvanceOverrides.e1).toBe(300000);
  });
});

