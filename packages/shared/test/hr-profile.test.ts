import { describe, expect, it } from 'vitest';
import {
  buildWorksheet, collectiveCountBeforeMonth, collectiveDatesInMonth, collectiveLeaveProblem, COFFEE_GROUND_PAYROLL_RULES, createFakeData, employeeProfileProblem, leaveQuotaRows,
  normalizeProfileInput, type EmployeeProfileInput,
} from '../src';

const emptyProfile = (o: Partial<EmployeeProfileInput> = {}): EmployeeProfileInput => ({ employeeId: 'e1', nik: null, phone: null, email: null, address: null, joinDate: null, employmentType: null, bankName: null, bankAccountNumber: null, bankAccountHolder: null, ...o });

describe('cuti bersama', () => {
  it('memvalidasi tanggal dan keterangan', () => {
    expect(collectiveLeaveProblem({ date: '2026-12-24', description: 'Natal' })).toBeNull();
    expect(collectiveLeaveProblem({ date: '24-12-2026', description: 'Natal' })).not.toBeNull();
    expect(collectiveLeaveProblem({ date: '2026-12-24', description: '  ' })).not.toBeNull();
  });
  it('menghitung tanggal di bulan dan jumlah sebelum bulan itu pada tahun yang sama', () => {
    const d = ['2026-03-10', '2026-03-10', '2026-12-24', '2025-12-25'];
    expect(collectiveDatesInMonth(d, 2026, 12)).toEqual(['2026-12-24']);
    expect(collectiveCountBeforeMonth(d, 2026, 12)).toBe(1);
    expect(collectiveCountBeforeMonth(d, 2026, 3)).toBe(0);
  });
  it('jatah tahunan: terpakai = absen + cuti bersama, sisa tidak negatif, lebihnya terpisah', () => {
    const rows = leaveQuotaRows([{ employeeId: 'a', employeeName: 'A' }, { employeeId: 'b', employeeName: 'B' }], { a: 10, b: 1 }, 3, 12);
    expect(rows[0]).toMatchObject({ used: 13, remaining: 0, over: 1 });
    expect(rows[1]).toMatchObject({ used: 4, remaining: 8, over: 0 });
  });
  it('payroll: cuti bersama tidak dihitung absen tetapi memakai jatah tahunan', () => {
    const base = {
      month: 12, year: 2026, tz: 'Asia/Jakarta', rules: COFFEE_GROUND_PAYROLL_RULES, today: '2026-12-31',
      employees: [{ employeeId: 'e1', employeeName: 'A', status: 'permanent' as const, basicSalary: 3_000_000, mealAllowance: 0, bpjsAllowance: 0, cashAdvanceInstallment: 0 }],
      schedules: {}, attendance: [], incidents: [], pastAbsences: {}, cashAdvanceBalance: {},
    };
    const none = buildWorksheet(base)[0]!;
    const withLeave = buildWorksheet({ ...base, collectiveLeaveDates: ['2026-12-24', '2026-03-10', '2025-12-25'] })[0]!;
    expect(none.period.absenceCount).toBe(0);
    expect(withLeave.period.absenceCount).toBe(1); // 24 Des
    expect(withLeave.period.pastAbsencesInYear).toBe(1); // 10 Mar 2026; 25 Des 2025 tahun lain
    expect(withLeave.result.absenceQuotaRemaining).toBe(10);
    expect(withLeave.excusedDates).toContain('2026-12-24');
  });
});

describe('profil kepegawaian', () => {
  it('rekening harus lengkap dan formatnya dijaga', () => {
    expect(employeeProfileProblem(emptyProfile())).toBeNull();
    expect(employeeProfileProblem(emptyProfile({ bankName: 'BCA' }))).toMatch(/lengkap/);
    expect(employeeProfileProblem(emptyProfile({ bankName: 'BCA', bankAccountNumber: '12ab', bankAccountHolder: 'Ani' }))).toMatch(/angka/);
    expect(employeeProfileProblem(emptyProfile({ bankName: 'BCA', bankAccountNumber: '1234 5678-90', bankAccountHolder: 'Ani' }))).toBeNull();
    expect(employeeProfileProblem(emptyProfile({ email: 'bukan-email' }))).toMatch(/email/i);
  });
  it('normalisasi membuang spasi, mengosongkan isian kosong, dan merapikan nomor rekening', () => {
    const n = normalizeProfileInput(emptyProfile({ nik: '  7371012345670001 ', phone: '  ', email: ' A@B.COM ', bankAccountNumber: '1234 5678-90' }));
    expect(n).toMatchObject({ nik: '7371012345670001', phone: null, email: 'a@b.com', bankAccountNumber: '1234567890' });
  });
  it('data demo: simpan dan baca profil serta cuti bersama, tanggal ganda ditolak', async () => {
    const d = createFakeData();
    const emp = (await d.listEmployees())[0]!;
    await d.saveEmployeeProfile(emptyProfile({ employeeId: emp.id, nik: '7371012345670001', employmentType: 'full_time', bankName: 'BCA', bankAccountNumber: '123456', bankAccountHolder: 'Ani' }));
    expect((await d.listEmployeeProfiles())[0]).toMatchObject({ employeeId: emp.id, bankName: 'BCA' });
    await d.saveCollectiveLeave({ date: '2026-12-24', description: 'Natal' });
    await expect(d.saveCollectiveLeave({ date: '2026-12-24', description: 'lagi' })).rejects.toThrow();
    const [l] = await d.listCollectiveLeaves();
    await d.deleteCollectiveLeave(l!.id);
    expect(await d.listCollectiveLeaves()).toHaveLength(0);
  });
});
