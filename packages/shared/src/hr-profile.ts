/** Cuti bersama: tanggal libur seluruh karyawan yang dipotongkan dari jatah cuti/absen tahunan (aturan payroll). */
export interface CollectiveLeave { id: string; date: string; description: string }
export interface CollectiveLeaveInput { date: string; description: string }

export const COLLECTIVE_DESC_MAX = 120;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function collectiveLeaveProblem(i: CollectiveLeaveInput): string | null {
  if (!DATE_RE.test(i.date) || Number.isNaN(new Date(`${i.date}T00:00:00Z`).getTime())) return 'Tanggal tidak valid.';
  const d = i.description.trim();
  if (!d) return 'Keterangan wajib diisi.';
  if (d.length > COLLECTIVE_DESC_MAX) return `Keterangan maksimal ${COLLECTIVE_DESC_MAX} huruf.`;
  return null;
}

/** Tanggal cuti bersama yang jatuh di bulan tertentu / bulan-bulan sebelum bulan itu pada tahun yang sama. */
export function collectiveDatesInMonth(dates: readonly string[], year: number, month: number): string[] {
  const p = `${year}-${String(month).padStart(2, '0')}-`;
  return [...new Set(dates.filter((d) => d.startsWith(p)))].sort();
}
export function collectiveCountBeforeMonth(dates: readonly string[], year: number, month: number): number {
  const set = new Set(dates.filter((d) => d.startsWith(`${year}-`) && Number(d.slice(5, 7)) < month));
  return set.size;
}

export interface LeaveQuotaRow { employeeId: string; employeeName: string; absences: number; collective: number; used: number; quota: number; remaining: number; over: number }
/**
 * Jatah cuti/absen tahunan per karyawan: absen yang tercatat di payroll tahun ini + hari cuti bersama = terpakai.
 * Sisa tidak pernah negatif; kelebihan ditampilkan terpisah (itu yang kena denda absen di payroll).
 */
export function leaveQuotaRows(
  employees: readonly { employeeId: string; employeeName: string }[],
  absencesByEmployee: Record<string, number>,
  collectiveDaysCount: number,
  quota: number,
): LeaveQuotaRow[] {
  return employees.map((e) => {
    const absences = Math.max(0, absencesByEmployee[e.employeeId] ?? 0);
    const used = absences + collectiveDaysCount;
    return { employeeId: e.employeeId, employeeName: e.employeeName, absences, collective: collectiveDaysCount, used, quota, remaining: Math.max(0, quota - used), over: Math.max(0, used - quota) };
  });
}

/** Profil kepegawaian: data diri, tanggal bergabung, tipe pekerjaan, dan rekening bank untuk transfer gaji. */
export type EmploymentType = 'full_time' | 'part_time' | 'contract';
export const EMPLOYMENT_TYPES: readonly EmploymentType[] = ['full_time', 'part_time', 'contract'];
export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = { full_time: 'Penuh waktu', part_time: 'Paruh waktu', contract: 'Kontrak' };
export interface EmployeeProfile {
  employeeId: string; nik?: string; phone?: string; email?: string; address?: string; joinDate?: string; employmentType?: EmploymentType;
  bankName?: string; bankAccountNumber?: string; bankAccountHolder?: string;
}
/** Kolom yang dikosongkan dikirim sebagai null. */
export interface EmployeeProfileInput {
  employeeId: string; nik: string | null; phone: string | null; email: string | null; address: string | null; joinDate: string | null; employmentType: EmploymentType | null;
  bankName: string | null; bankAccountNumber: string | null; bankAccountHolder: string | null;
}

export function employeeProfileProblem(i: EmployeeProfileInput): string | null {
  const len = (s: string | null, min: number, max: number, label: string) => (s && (s.trim().length < min || s.trim().length > max) ? `${label} harus ${min}-${max} karakter.` : null);
  return len(i.nik, 6, 32, 'NIK')
    ?? len(i.phone, 5, 24, 'Nomor telepon')
    ?? (i.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email.trim()) ? 'Format email tidak valid.' : null)
    ?? (i.address && i.address.trim().length > 300 ? 'Alamat maksimal 300 karakter.' : null)
    ?? (i.joinDate && !DATE_RE.test(i.joinDate) ? 'Tanggal bergabung tidak valid.' : null)
    ?? len(i.bankName, 2, 60, 'Nama bank')
    ?? (i.bankAccountNumber && !/^[0-9 -]{4,32}$/.test(i.bankAccountNumber.trim()) ? 'Nomor rekening hanya angka (4-32 digit).' : null)
    ?? len(i.bankAccountHolder, 2, 80, 'Nama pemilik rekening')
    ?? ((i.bankName || i.bankAccountNumber || i.bankAccountHolder) && !(i.bankName && i.bankAccountNumber && i.bankAccountHolder) ? 'Rekening harus lengkap: bank, nomor, dan nama pemilik.' : null);
}

/** Bersihkan isian: spasi tepi dibuang, kosong jadi null, nomor rekening tanpa spasi/strip. */
export function normalizeProfileInput(i: EmployeeProfileInput): EmployeeProfileInput {
  const t = (s: string | null) => { const v = s?.trim(); return v ? v : null; };
  return {
    employeeId: i.employeeId, nik: t(i.nik), phone: t(i.phone), email: t(i.email)?.toLowerCase() ?? null, address: t(i.address), joinDate: t(i.joinDate),
    employmentType: i.employmentType, bankName: t(i.bankName), bankAccountNumber: t(i.bankAccountNumber)?.replace(/[ -]/g, '') ?? null, bankAccountHolder: t(i.bankAccountHolder),
  };
}

export function profileCompleteness(p: EmployeeProfile | undefined): { done: number; total: number } {
  const keys: (keyof EmployeeProfile)[] = ['nik', 'phone', 'address', 'joinDate', 'employmentType', 'bankAccountNumber'];
  return { done: keys.filter((k) => !!p?.[k]).length, total: keys.length };
}

