import { describe, expect, it } from 'vitest';
import { DataError } from '../src/types';
import {
  copyScheduleToWorkdays,
  isForbiddenError,
  monthBounds,
  payrollErrorMessage,
  scheduleArrayFromMap,
  scheduleMapFromArray,
  summarizeCashAdvanceTotals,
  summarizeIncidentsByEmployee,
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
  });
});

