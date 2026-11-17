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

/** Jalur foto di penyimpanan: <org>/<outlet>/<tanggal>/<tugas>.jpg (folder pertama harus id organisasi). */
export function taskPhotoPath(orgId: string, outletId: string, date: string, itemId: string, ext = 'jpg'): string {
  return `${orgId}/${outletId}/${date}/${itemId}.${ext.replace(/^\./, '')}`;
}
