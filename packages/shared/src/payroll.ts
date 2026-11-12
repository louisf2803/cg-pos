import { localDateKey, localParts } from './order-number';
import type { AttendanceRecord } from './types';

/**
 * Hitungan payroll (dari konsep Coffee Ground, docs/PAYROLL-DESIGN.md). Semua uang bilangan bulat rupiah.
 * Angka aturan TIDAK tertanam: dibaca dari PayrollRules (disimpan per org). COFFEE_GROUND_PAYROLL_RULES adalah nilai bawaan.
 */
export interface PayrollRules {
  /** menit toleransi setelah jam mulai shift sebelum dianggap telat */
  latenessGraceMinutes: number;
  /** bonus bila tidak pernah telat dalam sebulan */
  noLatenessBonus: number;
  /** telat sampai sekian kali dimaafkan (tanpa bonus dan tanpa denda) */
  latenessForgivenMax: number;
  /** bila telat lebih dari batas maaf: denda = jumlah telat x angka ini */
  latenessPenaltyPerTime: number;
  /** kuota absen per tahun tanpa denda */
  absenceYearlyQuota: number;
  /** denda per hari absen yang melewati kuota */
  absencePenaltyPerDay: number;
  /** kesalahan operasional ke-i didenda: base + (i-1) x step */
  operationalPenaltyBase: number;
  operationalPenaltyStep: number;
  /** insentif tetap per bulan bila ditandai */
  stockanIncentive: number;
  deepCleaningIncentive: number;
}

export const COFFEE_GROUND_PAYROLL_RULES: PayrollRules = {
  latenessGraceMinutes: 0, noLatenessBonus: 50000, latenessForgivenMax: 3, latenessPenaltyPerTime: 15000,
  absenceYearlyQuota: 12, absencePenaltyPerDay: 50000, operationalPenaltyBase: 10000, operationalPenaltyStep: 4000,
  stockanIncentive: 100000, deepCleaningIncentive: 150000,
};

export function payrollRulesProblem(r: PayrollRules): string | null {
  const money: (keyof PayrollRules)[] = ['noLatenessBonus', 'latenessPenaltyPerTime', 'absencePenaltyPerDay', 'operationalPenaltyBase', 'operationalPenaltyStep', 'stockanIncentive', 'deepCleaningIncentive'];
  for (const k of money) if (!Number.isInteger(r[k]) || r[k] < 0 || r[k] > 1_000_000_000) return 'Nominal aturan payroll harus rupiah bulat, 0 atau lebih.';
  for (const k of ['latenessGraceMinutes', 'latenessForgivenMax', 'absenceYearlyQuota'] as const) {
    if (!Number.isInteger(r[k]) || r[k] < 0 || r[k] > 366) return 'Batas hari, kali, dan menit pada aturan payroll harus bilangan bulat 0 sampai 366.';
  }
  return null;
}

/** Status kepegawaian: probasi tanpa bonus/denda/komisi; admin tanpa gaji pokok dan tanpa bonus/denda. */
export type EmploymentStatus = 'permanent' | 'probation' | 'admin';

export interface PayrollEmployee { status: EmploymentStatus; basicSalary: number; mealAllowance: number; bpjsAllowance: number }

export interface PayrollPeriodInput {
  latenessCount: number;
  absenceCount: number;
  /** jumlah hari absen pada bulan-bulan SEBELUMNYA di tahun yang sama (untuk kuota tahunan) */
  pastAbsencesInYear: number;
  operationalMistakes: number;
  hasStockan: boolean;
  hasDeepCleaning: boolean;
  cashAdvanceDeduction: number;
  /** komisi untuk karyawan ini (bukan probasi) */
  commission: number;
  /** bagian denda stock opname untuk karyawan ini, lihat splitStockOpnamePenalty */
  stockOpnamePenalty: number;
}

export interface PayrollResult {
  basicSalary: number; mealAllowance: number; bpjsAllowance: number;
  latenessCount: number; latenessBonus: number; latenessPenalty: number;
  absenceCount: number; absencePenalty: number; absenceQuotaRemaining: number;
  operationalMistakes: number; operationalPenalty: number;
  stockOpnamePenalty: number; stockanIncentive: number; deepCleaningIncentive: number;
  commission: number; cashAdvanceDeduction: number; netSalary: number;
}

/** Denda kesalahan operasional bertingkat: ke-1 = base, ke-2 = base + step, dst. */
export function operationalPenalty(count: number, r: PayrollRules): number {
  let total = 0;
  for (let i = 1; i <= Math.max(0, Math.floor(count)); i++) total += r.operationalPenaltyBase + (i - 1) * r.operationalPenaltyStep;
  return total;
}

/** Bonus bila tidak pernah telat; dimaafkan sampai batas; di atas batas didenda per kali telat. */
export function latenessAdjustment(count: number, r: PayrollRules): { bonus: number; penalty: number } {
  const c = Math.max(0, Math.floor(count));
  if (c === 0) return { bonus: r.noLatenessBonus, penalty: 0 };
  if (c > r.latenessForgivenMax) return { bonus: 0, penalty: c * r.latenessPenaltyPerTime };
  return { bonus: 0, penalty: 0 };
}

/** Denda hanya untuk hari yang BARU melewati kuota tahunan pada bulan ini. */
export function absenceAdjustment(current: number, pastInYear: number, r: PayrollRules): { penalty: number; remainingBefore: number; remainingAfter: number } {
  const cur = Math.max(0, Math.floor(current)), past = Math.max(0, Math.floor(pastInYear)), q = r.absenceYearlyQuota;
  const newlyExceeded = Math.max(0, past + cur - q) - Math.max(0, past - q);
  return { penalty: newlyExceeded * r.absencePenaltyPerDay, remainingBefore: Math.max(0, q - past), remainingAfter: Math.max(0, q - (past + cur)) };
}

/** Denda stock opname dibagi rata (dibulatkan ke bawah) ke karyawan yang kena: bukan probasi dan bukan admin. */
export function splitStockOpnamePenalty(total: number, statuses: EmploymentStatus[]): number {
  const eligible = statuses.filter((s) => s === 'permanent').length;
  return eligible > 0 ? Math.floor(Math.max(0, total) / eligible) : 0;
}

export function computePayroll(emp: PayrollEmployee, p: PayrollPeriodInput, r: PayrollRules): PayrollResult {
  const probation = emp.status === 'probation', admin = emp.status === 'admin';
  const exempt = probation || admin;
  const late = exempt ? { bonus: 0, penalty: 0 } : latenessAdjustment(p.latenessCount, r);
  const abs = exempt ? { penalty: 0, remainingBefore: r.absenceYearlyQuota, remainingAfter: r.absenceYearlyQuota } : absenceAdjustment(p.absenceCount, p.pastAbsencesInYear, r);
  const ops = exempt ? 0 : operationalPenalty(p.operationalMistakes, r);
  const opname = exempt ? 0 : Math.max(0, Math.floor(p.stockOpnamePenalty));
  const comm = probation ? 0 : Math.max(0, Math.floor(p.commission));
  const stockan = p.hasStockan ? r.stockanIncentive : 0;
  const deep = admin ? 0 : (p.hasDeepCleaning ? r.deepCleaningIncentive : 0);
  const basic = admin ? 0 : emp.basicSalary, meal = admin ? 0 : emp.mealAllowance, bpjs = admin ? 0 : emp.bpjsAllowance;
  const kasbon = Math.max(0, Math.floor(p.cashAdvanceDeduction));
  const net = basic + meal - bpjs + late.bonus - late.penalty - abs.penalty - ops + stockan + deep - opname - kasbon + comm;
  return {
    basicSalary: basic, mealAllowance: meal, bpjsAllowance: bpjs,
    latenessCount: p.latenessCount, latenessBonus: late.bonus, latenessPenalty: late.penalty,
    absenceCount: p.absenceCount, absencePenalty: abs.penalty, absenceQuotaRemaining: abs.remainingAfter,
    operationalMistakes: p.operationalMistakes, operationalPenalty: ops,
    stockOpnamePenalty: opname, stockanIncentive: stockan, deepCleaningIncentive: deep,
    commission: comm, cashAdvanceDeduction: kasbon, netSalary: net,
  };
}

// ---------------------------------------------------------------------------------------------
// Kasbon (pinjaman karyawan)

export type CashAdvanceType = 'BORROW' | 'PAYMENT_TRANSFER' | 'PAYMENT_PAYROLL';
export interface CashAdvanceEntry { type: CashAdvanceType; amount: number }

/** Saldo kasbon = total pinjam - total bayar (transfer dan potong gaji). */
export function cashAdvanceBalance(entries: CashAdvanceEntry[]): number {
  return entries.reduce((n, e) => n + (e.type === 'BORROW' ? e.amount : -e.amount), 0);
}

/** Potongan otomatis bulan ini: cicilan, tidak boleh melebihi saldo, tidak negatif. */
export function suggestedInstallment(balance: number, installment: number): number {
  return Math.max(0, Math.min(Math.floor(balance), Math.floor(installment)));
}

// ---------------------------------------------------------------------------------------------
// Telat dan absen otomatis dari absensi + jadwal kerja

/** Satu hari kerja terjadwal. weekday: 0 = Minggu ... 6 = Sabtu (menurut zona outlet). start = "HH:MM" jam mulai shift. */
export interface ScheduleDay { weekday: number; start: string }
export type WeeklySchedule = ScheduleDay[];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export function scheduleProblem(s: WeeklySchedule): string | null {
  const seen = new Set<number>();
  for (const d of s) {
    if (!Number.isInteger(d.weekday) || d.weekday < 0 || d.weekday > 6) return 'Hari kerja harus 0 (Minggu) sampai 6 (Sabtu).';
    if (!HHMM.test(d.start)) return 'Jam mulai harus berformat JJ:MM, mis. 08:00.';
    if (seen.has(d.weekday)) return 'Satu hari hanya boleh punya satu jam mulai.';
    seen.add(d.weekday);
  }
  return null;
}

/** Hari dalam seminggu (0 = Minggu) untuk tanggal "yyyy-mm-dd" (kalender, tanpa zona). */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/** Daftar tanggal "yyyy-mm-dd" dari a sampai b, keduanya ikut. */
export function dateRange(a: string, b: string): string[] {
  const utc = (key: string) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y!, m! - 1, d!); };
  const out: string[] = [];
  for (let t = utc(a), end = utc(b); t <= end && out.length < 400; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export interface AttendanceDerived { lateDates: string[]; absentDates: string[]; workedDates: string[] }

/**
 * Telat dan absen untuk satu karyawan dari catatan absensi dan jadwal.
 * - Telat: pada hari terjadwal, clock in PERTAMA hari itu (jam lokal) lebih lambat dari jam mulai + toleransi.
 * - Absen: hari terjadwal yang sudah lewat (sampai asOfDate, tidak termasuk hari ini yang belum selesai) tanpa clock in sama sekali
 *   dan tidak ada di excusedDates (cuti/izin/libur yang sudah dicatat).
 * from dan to adalah tanggal lokal "yyyy-mm-dd" (ikut). Catatan yang tidak terjadwal tidak dihitung telat.
 */
export function deriveAttendance(
  records: Pick<AttendanceRecord, 'clockInAt'>[], schedule: WeeklySchedule, from: string, to: string, tz: string,
  rules: Pick<PayrollRules, 'latenessGraceMinutes'>, excusedDates: string[] = [], asOfDate?: string,
): AttendanceDerived {
  const startOf = new Map(schedule.map((d) => [d.weekday, d.start]));
  const firstIn = new Map<string, Date>();
  for (const r of records) {
    const t = new Date(r.clockInAt);
    if (Number.isNaN(t.getTime())) continue;
    const key = localDateKey(t, tz);
    const cur = firstIn.get(key);
    if (!cur || t < cur) firstIn.set(key, t);
  }
  const excused = new Set(excusedDates);
  const lateDates: string[] = [], absentDates: string[] = [], workedDates: string[] = [];
  for (const day of dateRange(from, to)) {
    const start = startOf.get(weekdayOf(day));
    if (!start) continue;
    const t = firstIn.get(day);
    if (t) {
      workedDates.push(day);
      const p = localParts(t, tz);
      const [sh, sm] = start.split(':').map(Number);
      if (p.h * 60 + p.min > sh! * 60 + sm! + rules.latenessGraceMinutes) lateDates.push(day);
    } else if (!excused.has(day) && (asOfDate === undefined || day < asOfDate)) {
      absentDates.push(day);
    }
  }
  return { lateDates, absentDates, workedDates };
}
