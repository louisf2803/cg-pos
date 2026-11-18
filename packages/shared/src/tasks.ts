/**
 * Tugas harian Opening dan Closing (migrasi 0152). Daftar diatur manajer per outlet; tiap tugas hanya perlu dicentang atau wajib foto.
 * Dikerjakan bersama oleh satu tim lewat aplikasi karyawan; Tutup kasir di POS terkunci sampai semua tugas wajib selesai
 * (tugas yang tidak mungkin dikerjakan boleh ditandai "tidak bisa" dengan alasan dan dianggap selesai).
 */
export type TaskPhase = 'opening' | 'closing';
export type TaskKind = 'check' | 'photo';
export type TaskStatus = 'pending' | 'done' | 'skipped';

export const TASK_PHASES: readonly TaskPhase[] = ['opening', 'closing'];
export const TASK_PHASE_LABEL: Record<TaskPhase, string> = { opening: 'Opening', closing: 'Closing' };
export const TASK_KIND_LABEL: Record<TaskKind, string> = { check: 'Centang saja', photo: 'Wajib foto' };
export const TASK_TITLE_MAX = 120;

export interface TaskTemplate { id: string; outletId: string; phase: TaskPhase; title: string; kind: TaskKind; required: boolean; allowSkip: boolean; sort: number; isActive: boolean }
export interface TaskTemplateInput { id?: string; outletId: string; phase: TaskPhase; title: string; kind: TaskKind; required?: boolean; allowSkip?: boolean; sort?: number; isActive?: boolean }

export interface TaskItem {
  id: string; runId: string; title: string; kind: TaskKind; required: boolean; allowSkip: boolean; sort: number; status: TaskStatus;
  photoPath?: string; doneByName?: string; doneAt?: string; skipReason?: string;
}
export interface TaskRun { id: string; outletId: string; date: string; phase: TaskPhase; items: TaskItem[] }
export interface TaskGateItem { itemId: string; phase: TaskPhase; title: string; kind: TaskKind }

export function taskTemplateProblem(i: Pick<TaskTemplateInput, 'title' | 'phase' | 'kind'>): string | null {
  const t = i.title.trim();
  if (!t) return 'Nama tugas wajib diisi.';
  if (t.length > TASK_TITLE_MAX) return `Nama tugas maksimal ${TASK_TITLE_MAX} huruf.`;
  if (!TASK_PHASES.includes(i.phase)) return 'Fase tugas tidak valid.';
  if (i.kind !== 'check' && i.kind !== 'photo') return 'Jenis tugas tidak valid.';
  return null;
}

/** Tugas dianggap selesai bila dikerjakan atau ditandai tidak bisa dengan alasan. */
export const taskIsResolved = (i: Pick<TaskItem, 'status'>): boolean => i.status === 'done' || i.status === 'skipped';

export function taskProgress(items: readonly Pick<TaskItem, 'status'>[]): { done: number; total: number; percent: number } {
  const done = items.filter(taskIsResolved).length;
  return { done, total: items.length, percent: items.length ? Math.round((done / items.length) * 100) : 100 };
}

/** Kelompokkan tugas yang menghalangi Tutup kasir menurut fase (opening dulu). */
export function groupGateByPhase(items: readonly TaskGateItem[]): { phase: TaskPhase; items: TaskGateItem[] }[] {
  return TASK_PHASES.map((phase) => ({ phase, items: items.filter((i) => i.phase === phase) })).filter((g) => g.items.length > 0);
}

/** Tautan akun login aplikasi karyawan ke karyawan (migrasi 0153). */
export interface StaffAccount { employeeId: string; email: string }
/** Identitas karyawan untuk akun yang sedang masuk di aplikasi HP (staff_me). */
export interface StaffMe { employeeId: string; orgId: string; name: string; role: 'owner' | 'manager' | 'cashier' | 'kitchen' | 'warehouse'; memberRole: string | null; outlets: { id: string; name: string }[] }
/** Peran di aplikasi HP: pemilik dan manajer melihat persetujuan; selain itu karyawan biasa. */
export const staffAppRole = (r: StaffMe['role']): 'owner' | 'manager' | 'employee' => (r === 'owner' ? 'owner' : r === 'manager' ? 'manager' : 'employee');

/** Domain email bayangan untuk login karyawan berbasis username (akun tetap Supabase Auth; email_confirm diisi saat dibuat). */
export const STAFF_EMAIL_DOMAIN = 'karyawan.cgpos.app';
/** Username atau email yang diketik di aplikasi HP menjadi email login Supabase. */
export function staffLoginEmail(input: string): string {
  const v = input.trim().toLowerCase();
  return v.includes('@') ? v : `${v}@${STAFF_EMAIL_DOMAIN}`;
}
/** Tampilan username untuk email login (domain bayangan dibuang). */
export function staffUsername(email: string): string { return email.toLowerCase().endsWith(`@${STAFF_EMAIL_DOMAIN}`) ? email.slice(0, -(STAFF_EMAIL_DOMAIN.length + 1)) : email; }
export function staffAccountProblem(i: { username: string; password: string; reset?: boolean }): string | null {
  if (!i.reset && !/^[a-z0-9._-]{3,40}$/.test(i.username.trim().toLowerCase().split('@')[0] ?? '')) return 'Username 3 sampai 40 karakter: huruf kecil, angka, titik, garis bawah, atau strip.';
  if (i.password.length < 8) return 'Kata sandi minimal 8 karakter.';
  if (i.password.length > 72) return 'Kata sandi maksimal 72 karakter.';
  return null;
}

/** Jalur foto di penyimpanan: <org>/<outlet>/<tanggal>/<tugas>.jpg (folder pertama harus id organisasi). */
export function taskPhotoPath(orgId: string, outletId: string, date: string, itemId: string, ext = 'jpg'): string {
  return `${orgId}/${outletId}/${date}/${itemId}.${ext.replace(/^\./, '')}`;
}
