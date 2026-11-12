import {
  cashAdvanceBalances,
  computePayroll,
  type CashAdvance,
  type CashAdvanceType,
  type EmployeeCompensation,
  type EmployeeIncident,
  type EmploymentStatus,
  type IncidentKind,
  type PayrollRecord,
  type PayrollResult,
  type PayrollRules,
  type WeeklySchedule,
  type WorksheetFlags,
  type WorksheetRow,
} from './payroll';
import { DataError } from './types';

export interface WeekdayColumn {
  weekday: number;
  shortLabel: string;
  label: string;
}

/** Urutan kolom hari kerja Senin..Minggu dengan kode weekday 0 = Minggu sesuai Date.getUTCDay(). */
export const WEEKDAY_COLUMNS: readonly WeekdayColumn[] = [
  { weekday: 1, shortLabel: 'Sen', label: 'Senin' },
  { weekday: 2, shortLabel: 'Sel', label: 'Selasa' },
  { weekday: 3, shortLabel: 'Rab', label: 'Rabu' },
  { weekday: 4, shortLabel: 'Kam', label: 'Kamis' },
  { weekday: 5, shortLabel: 'Jum', label: 'Jumat' },
  { weekday: 6, shortLabel: 'Sab', label: 'Sabtu' },
  { weekday: 0, shortLabel: 'Min', label: 'Minggu' },
] as const;

export const MONTH_NAMES_ID: readonly string[] = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

export const EMPLOYMENT_STATUS_LABEL: Record<EmploymentStatus, string> = {
  permanent: 'Tetap',
  probation: 'Probasi',
  admin: 'Admin',
};

export const INCIDENT_KIND_LABEL: Record<IncidentKind, string> = {
  LATENESS: 'Telat (manual)',
  ABSENCE: 'Absen (manual)',
  OPERATIONAL_MISTAKE: 'Salah operasional',
  EXCUSED: 'Diizinkan (cuti/izin/libur)',
};

export const CASH_ADVANCE_KIND_LABEL: Record<CashAdvanceType, string> = {
  BORROW: 'Pinjaman',
  PAYMENT_TRANSFER: 'Bayar transfer',
  PAYMENT_PAYROLL: 'Potong gaji',
};

/** Mengubah WeeklySchedule array dari DataLayer menjadi peta weekday -> "JJ:MM". */
export function scheduleMapFromArray(schedule: WeeklySchedule): Record<number, string> {
  const out: Record<number, string> = {};
  for (const item of schedule) {
    out[item.weekday] = item.start;
  }
  return out;
}

/** Mengubah peta weekday -> "JJ:MM" kembali menjadi WeeklySchedule terurut, membuang sel kosong. */
export function scheduleArrayFromMap(map: Record<number, string>): WeeklySchedule {
  const out: WeeklySchedule = [];
  for (const col of WEEKDAY_COLUMNS) {
    const raw = (map[col.weekday] ?? '').trim();
    if (!raw) continue;
    out.push({ weekday: col.weekday, start: raw.slice(0, 5) });
  }
  return out;
}

/**
 * Menyalin jam mulai dari hari kerja yang sudah terisi (prioritas Senin..Minggu, atau `fallbackStart` bila kosong semua)
 * ke seluruh hari kerja Senin..Jumat (`weekday` 1..5). Sabtu & Minggu dibiarkan sesuai nilai sebelumnya.
 */
export function copyScheduleToWorkdays(
  map: Record<number, string>,
  fallbackStart = '08:00',
): Record<number, string> {
  let source = '';
  for (const col of WEEKDAY_COLUMNS) {
    const val = (map[col.weekday] ?? '').trim();
    if (val) {
      source = val.slice(0, 5);
      break;
    }
  }
  if (!source) source = fallbackStart;
  const next: Record<number, string> = { ...map };
  for (const weekday of [1, 2, 3, 4, 5]) {
    next[weekday] = source;
  }
  return next;
}

/** Batas tanggal lokal "yyyy-mm-dd" awal dan akhir bulan untuk kueri DataLayer.listIncidents. */
export function monthBounds(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export interface IncidentEmployeeSummary {
  employeeId: string;
  employeeName: string;
  lateness: number;
  absence: number;
  operationalMistake: number;
  excused: number;
}

/** Ringkasan jumlah catatan harian per karyawan untuk bulan terpilih. */
export function summarizeIncidentsByEmployee(
  incidents: Pick<EmployeeIncident, 'employeeId' | 'employeeName' | 'kind' | 'count'>[],
  employees: { employeeId: string; employeeName: string }[],
): IncidentEmployeeSummary[] {
  const byId = new Map<string, IncidentEmployeeSummary>();
  for (const emp of employees) {
    byId.set(emp.employeeId, {
      employeeId: emp.employeeId,
      employeeName: emp.employeeName,
      lateness: 0,
      absence: 0,
      operationalMistake: 0,
      excused: 0,
    });
  }
  for (const item of incidents) {
    let row = byId.get(item.employeeId);
    if (!row) {
      row = {
        employeeId: item.employeeId,
        employeeName: item.employeeName,
        lateness: 0,
        absence: 0,
        operationalMistake: 0,
        excused: 0,
      };
      byId.set(item.employeeId, row);
    }
    const qty = Math.max(1, Math.round(item.count || 1));
    if (item.kind === 'LATENESS') row.lateness += qty;
    else if (item.kind === 'ABSENCE') row.absence += qty;
    else if (item.kind === 'OPERATIONAL_MISTAKE') row.operationalMistake += qty;
    else if (item.kind === 'EXCUSED') row.excused += qty;
  }
  return [...byId.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'id'));
}

export interface CashAdvanceTotals {
  totalBorrowed: number;
  totalPaidTransfer: number;
  totalPaidPayroll: number;
  totalOutstanding: number;
  activeBorrowers: number;
  balancesByEmployee: Record<string, number>;
}

/** Menghitung ringkasan saldo & arus kasbon seluruh karyawan. */
export function summarizeCashAdvanceTotals(
  entries: Pick<CashAdvance, 'employeeId' | 'kind' | 'amount'>[],
): CashAdvanceTotals {
  const balancesByEmployee = cashAdvanceBalances(entries);
  let totalBorrowed = 0;
  let totalPaidTransfer = 0;
  let totalPaidPayroll = 0;
  for (const e of entries) {
    if (e.kind === 'BORROW') totalBorrowed += e.amount;
    else if (e.kind === 'PAYMENT_TRANSFER') totalPaidTransfer += e.amount;
    else if (e.kind === 'PAYMENT_PAYROLL') totalPaidPayroll += e.amount;
  }
  let totalOutstanding = 0;
  let activeBorrowers = 0;
  for (const bal of Object.values(balancesByEmployee)) {
    if (bal > 0) {
      totalOutstanding += bal;
      activeBorrowers += 1;
    } else if (bal < 0) {
      totalOutstanding += bal;
    }
  }
  return {
    totalBorrowed,
    totalPaidTransfer,
    totalPaidPayroll,
    totalOutstanding,
    activeBorrowers,
    balancesByEmployee,
  };
}

/** Mendeteksi galat hak akses payroll (khusus pemilik dan manajer) tanpa menebak. */
export function isForbiddenError(err: unknown): boolean {
  if (err instanceof DataError && err.code === 'forbidden') return true;
  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'forbidden') {
    return true;
  }
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return /(forbidden|42501|permission denied|tidak punya izin|khusus pemilik|hanya pemilik|role kasir)/i.test(msg);
}

/** Pesan galat ramah untuk halaman payroll/jadwal/catatan/kasbon. */
export function payrollErrorMessage(err: unknown, fallback = 'Terjadi kesalahan saat memproses data.'): {
  forbidden: boolean;
  message: string;
} {
  if (isForbiddenError(err)) {
    return {
      forbidden: true,
      message: 'Akses ditolak: menu jadwal, kompensasi, catatan harian, dan kasbon hanya boleh dibuka oleh Pemilik atau Manajer.',
    };
  }
  return {
    forbidden: false,
    message: err instanceof Error && err.message ? err.message : fallback,
  };
}

const TZ_OFFSET_MIN_ID: Record<string, number> = {
  'Asia/Jakarta': 420,
  'Asia/Makassar': 480,
  'Asia/Jayapura': 540,
};

/**
 * Mengubah bulan + tahun lokal outlet menjadi rentang UTC [from, to) untuk DataLayer.listAttendance.
 * Awal = tanggal 1 pukul 00:00:00 waktu lokal; akhir = tanggal 1 bulan berikutnya pukul 00:00:00 (eksklusif).
 */
export function localMonthUtcRange(
  year: number,
  month: number,
  tz = 'Asia/Jakarta',
): { from: string; to: string } {
  const offMs = (TZ_OFFSET_MIN_ID[tz] ?? 420) * 60_000;
  const startUtcMs = Date.UTC(year, month - 1, 1, 0, 0, 0) - offMs;
  const endUtcMs = Date.UTC(year, month, 1, 0, 0, 0) - offMs;
  return {
    from: new Date(startUtcMs).toISOString(),
    to: new Date(endUtcMs).toISOString(),
  };
}

/**
 * Menerapkan suntingan potongan kasbon per karyawan di lembar kerja memakai `computePayroll`
 * tanpa menduplikasi rumus gaji. Juga memeriksa agar potongan tidak melebihi saldo kasbon.
 */
export function applyWorksheetCashAdvanceOverrides(
  rows: readonly WorksheetRow[],
  employees: readonly EmployeeCompensation[],
  cashAdvanceOverrides: Readonly<Record<string, number>>,
  balances: Readonly<Record<string, number>>,
  rules: PayrollRules,
): { rows: WorksheetRow[]; problems: Record<string, string> } {
  const empById = new Map<string, EmployeeCompensation>();
  for (const e of employees) empById.set(e.employeeId, e);
  const problems: Record<string, string> = {};

  const nextRows = rows.map((row) => {
    const rawOverride = cashAdvanceOverrides[row.employeeId];
    const deduction =
      rawOverride === undefined ? row.period.cashAdvanceDeduction : Math.max(0, Math.floor(rawOverride));
    const maxAllowed = Math.max(0, Math.floor(balances[row.employeeId] ?? 0));
    if (deduction > maxAllowed) {
      problems[row.employeeId] = `Potongan melebihi saldo kasbon (${maxAllowed})`;
    }
    if (deduction === row.period.cashAdvanceDeduction) {
      return row;
    }
    const emp = empById.get(row.employeeId);
    const updatedPeriod = { ...row.period, cashAdvanceDeduction: deduction };
    const empSpec = emp
      ? {
          status: emp.status,
          basicSalary: emp.basicSalary,
          mealAllowance: emp.mealAllowance,
          bpjsAllowance: emp.bpjsAllowance,
        }
      : {
          status: row.status,
          basicSalary: row.result.basicSalary,
          mealAllowance: row.result.mealAllowance,
          bpjsAllowance: row.result.bpjsAllowance,
        };
    return {
      ...row,
      period: updatedPeriod,
      result: computePayroll(empSpec, updatedPeriod, rules),
    };
  });

  return { rows: nextRows, problems };
}

/** Mengambil nilai suntingan awal (stokan, deep cleaning, komisi, potongan kasbon) dari rekaman gaji tersimpan. */
export function draftFlagsFromPayrollRecords(records: readonly PayrollRecord[]): {
  flags: Record<string, WorksheetFlags>;
  cashAdvanceOverrides: Record<string, number>;
} {
  const flags: Record<string, WorksheetFlags> = {};
  const cashAdvanceOverrides: Record<string, number> = {};
  for (const r of records) {
    flags[r.employeeId] = {
      hasStockan: r.stockanIncentive > 0,
      hasDeepCleaning: r.deepCleaningIncentive > 0,
      commission: r.commission,
    };
    cashAdvanceOverrides[r.employeeId] = r.cashAdvanceDeduction;
  }
  return { flags, cashAdvanceOverrides };
}

export function summarizePayrollTotals(
  rows: readonly Pick<PayrollResult, 'netSalary' | 'cashAdvanceDeduction'>[],
): { totalNetSalary: number; totalCashAdvanceDeduction: number; count: number } {
  let totalNetSalary = 0;
  let totalCashAdvanceDeduction = 0;
  for (const r of rows) {
    totalNetSalary += r.netSalary;
    totalCashAdvanceDeduction += r.cashAdvanceDeduction;
  }
  return { totalNetSalary, totalCashAdvanceDeduction, count: rows.length };
}

export function computePayslipSubtotals(
  r: Pick<
    PayrollResult,
    | 'basicSalary'
    | 'mealAllowance'
    | 'bpjsAllowance'
    | 'latenessBonus'
    | 'latenessPenalty'
    | 'absencePenalty'
    | 'operationalPenalty'
    | 'stockOpnamePenalty'
    | 'stockanIncentive'
    | 'deepCleaningIncentive'
    | 'commission'
    | 'cashAdvanceDeduction'
  >,
): { grossEarnings: number; totalDeductions: number } {
  const grossEarnings =
    r.basicSalary +
    r.mealAllowance +
    r.latenessBonus +
    r.stockanIncentive +
    r.deepCleaningIncentive +
    r.commission;
  const totalDeductions =
    r.bpjsAllowance +
    r.latenessPenalty +
    r.absencePenalty +
    r.operationalPenalty +
    r.stockOpnamePenalty +
    r.cashAdvanceDeduction;
  return { grossEarnings, totalDeductions };
}

/** Pesan ramah saat buka kunci periode ditolak atau gagal. */
export function payrollUnlockErrorMessage(err: unknown): string {
  if (isForbiddenError(err)) {
    return 'Buka kunci periode ditolak: hanya Pemilik atau Admin yang diizinkan membuka kembali periode PAID.';
  }
  return err instanceof Error && err.message ? err.message : 'Gagal membuka kunci periode payroll.';
}

