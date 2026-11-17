import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { requestErrorMessage, taskPhotoPath, type AdvanceRequestRow, type LeaveKind, type LeaveRequestRow, type StaffScheduleDay, type StaffMe, type StaffRequests, type SwapRequestRow, type TaskRun } from '@cgpos/shared';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const configured = Boolean(url && anon);

export const supabase = createClient(url || 'http://localhost', anon || 'missing', {
  db: { schema: 'pos' },
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

type Row = Record<string, unknown>;

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(/invalid/i.test(error.message) ? 'Email atau kata sandi salah.' : error.message);
}

export const signOut = () => supabase.auth.signOut();

/** Identitas karyawan untuk akun yang masuk; null bila akun belum ditautkan ke karyawan. */
export async function loadMe(): Promise<StaffMe | null> {
  const { data, error } = await supabase.rpc('staff_me');
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Row;
  return {
    employeeId: r.employee_id as string, orgId: r.org_id as string, name: r.name as string,
    role: r.role as StaffMe['role'], memberRole: (r.member_role as string | null) ?? null,
    outlets: ((r.outlets as Row[] | null) ?? []).map((o) => ({ id: o.id as string, name: o.name as string })),
  };
}

export async function ensureRun(outletId: string, phase: 'opening' | 'closing'): Promise<string> {
  const { data, error } = await supabase.rpc('task_run_ensure', { p_outlet: outletId, p_phase: phase });
  if (error) throw new Error(error.message);
  return String(data);
}

/** Tugas hari ini (dua fase) untuk satu outlet, dibuat bila belum ada. */
export async function loadToday(outletId: string, date: string): Promise<TaskRun[]> {
  await Promise.all([ensureRun(outletId, 'opening'), ensureRun(outletId, 'closing')]);
  const { data: runs, error } = await supabase.from('task_runs').select('id,outlet_id,run_date,phase').eq('outlet_id', outletId).eq('run_date', date).order('phase');
  if (error) throw new Error(error.message);
  const list = (runs as Row[] | null) ?? [];
  if (!list.length) return [];
  const { data: items, error: e2 } = await supabase.from('task_items').select('id,run_id,title,kind,required,allow_skip,sort,status,photo_path,done_at,skip_reason').in('run_id', list.map((r) => r.id as string)).order('sort').order('title');
  if (e2) throw new Error(e2.message);
  const rows = (items as Row[] | null) ?? [];
  return list.map((r): TaskRun => ({
    id: r.id as string, outletId: r.outlet_id as string, date: r.run_date as string, phase: r.phase as TaskRun['phase'],
    items: rows.filter((x) => x.run_id === r.id).map((x) => ({
      id: x.id as string, runId: x.run_id as string, title: x.title as string, kind: x.kind as 'check' | 'photo', required: !!x.required, allowSkip: !!x.allow_skip, sort: Number(x.sort),
      status: x.status as 'pending' | 'done' | 'skipped', ...(x.photo_path ? { photoPath: x.photo_path as string } : {}), ...(x.done_at ? { doneAt: x.done_at as string } : {}), ...(x.skip_reason ? { skipReason: x.skip_reason as string } : {}),
    })),
  }));
}

export async function completeItem(itemId: string, employeeId: string, photoPath?: string): Promise<void> {
  const { error } = await supabase.rpc('task_item_complete', { p_item: itemId, p_photo_path: photoPath ?? null, p_employee: employeeId });
  if (error) throw new Error(/photo required/i.test(error.message) ? 'Tugas ini wajib foto.' : error.message);
}

export async function skipItem(itemId: string, employeeId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('task_item_skip', { p_item: itemId, p_reason: reason, p_employee: employeeId });
  if (error) {
    if (/reason required/i.test(error.message)) throw new Error('Alasan wajib diisi.');
    if (/skip not allowed/i.test(error.message)) throw new Error('Tugas ini tidak boleh ditandai tidak bisa.');
    throw new Error(error.message);
  }
}

/** Unggah foto bukti ke bucket task-photos lalu kembalikan jalurnya. */
export async function uploadTaskPhoto(me: StaffMe, outletId: string, date: string, itemId: string, localUri: string): Promise<string> {
  const path = taskPhotoPath(me.orgId, outletId, date, itemId);
  const res = await fetch(localUri);
  const body = await (await res.blob()).arrayBuffer();
  const { error } = await supabase.storage.from('task-photos').upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Foto gagal diunggah: ${error.message}`);
  return path;
}

/** Tanggal hari ini menurut Asia/Jakarta (YYYY-MM-DD). */
export const todayJakarta = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

// ===== Fase 2: pengajuan, jadwal, slip, pesan =====

async function rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(requestErrorMessage(error.message));
  return data as T;
}

export async function loadRequests(): Promise<StaffRequests> {
  const j = (await rpc<Row | null>('staff_requests')) ?? { leave: [], advances: [], swaps: [], teammates: [] };
  const list = (k: string) => ((j[k] as Row[] | null) ?? []);
  return {
    leave: list('leave').map((x): LeaveRequestRow => ({ id: x.id as string, employeeId: x.employee_id as string, employeeName: x.employee_name as string, kind: x.kind as LeaveKind, startDate: x.start_date as string, endDate: x.end_date as string, reason: x.reason as string, status: x.status as LeaveRequestRow['status'], ...(x.note ? { note: x.note as string } : {}), createdAt: x.created_at as string })),
    advances: list('advances').map((x): AdvanceRequestRow => ({ id: x.id as string, employeeId: x.employee_id as string, employeeName: x.employee_name as string, amount: Number(x.amount), reason: x.reason as string, status: x.status as AdvanceRequestRow['status'], ...(x.proof_path ? { proofPath: x.proof_path as string } : {}), ...(x.note ? { note: x.note as string } : {}), createdAt: x.created_at as string })),
    swaps: list('swaps').map((x): SwapRequestRow => ({ id: x.id as string, requesterId: x.requester_id as string, requesterName: x.requester_name as string, partnerId: x.partner_id as string, partnerName: x.partner_name as string, requesterDate: x.requester_date as string, partnerDate: x.partner_date as string, ...(x.reason ? { reason: x.reason as string } : {}), status: x.status as SwapRequestRow['status'], ...(x.note ? { note: x.note as string } : {}), createdAt: x.created_at as string })),
    teammates: list('teammates').map((x) => ({ id: x.id as string, name: x.name as string })),
  };
}

export const createLeave = (kind: LeaveKind, start: string, end: string, reason: string) => rpc('leave_request_create', { p_kind: kind, p_start: start, p_end: end, p_reason: reason });
export const decideLeave = (id: string, approve: boolean, note?: string) => rpc('leave_request_decide', { p_id: id, p_approve: approve, p_note: note ?? null });
export const cancelLeave = (id: string) => rpc('leave_request_cancel', { p_id: id });
export const createAdvance = (amount: number, reason: string) => rpc('advance_request_create', { p_amount: amount, p_reason: reason });
export const cancelAdvance = (id: string) => rpc('advance_request_cancel', { p_id: id });
export const createSwap = (partnerId: string, requesterDate: string, partnerDate: string, reason?: string) => rpc('swap_request_create', { p_partner: partnerId, p_requester_date: requesterDate, p_partner_date: partnerDate, p_reason: reason ?? null });
export const partnerDecide = (id: string, approve: boolean) => rpc('swap_partner_decide', { p_id: id, p_approve: approve });
export const managerDecide = (id: string, approve: boolean, note?: string) => rpc('swap_manager_decide', { p_id: id, p_approve: approve, p_note: note ?? null });
export const cancelSwap = (id: string) => rpc('swap_request_cancel', { p_id: id });

/** Pemilik menyetujui kasbon: bukti transfer (foto) diunggah dulu ke kasbon-proof, lalu keputusan dicatat. */
export async function approveAdvance(me: StaffMe, req: AdvanceRequestRow, localUri: string, note?: string): Promise<void> {
  const path = `${me.orgId}/${req.employeeId}/${req.id}.jpg`;
  const body = await (await (await fetch(localUri)).blob()).arrayBuffer();
  const { error } = await supabase.storage.from('kasbon-proof').upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Bukti transfer gagal diunggah: ${error.message}`);
  await rpc('advance_request_decide', { p_id: req.id, p_approve: true, p_note: note ?? null, p_proof_path: path });
}
export const rejectAdvance = (id: string, note?: string) => rpc('advance_request_decide', { p_id: id, p_approve: false, p_note: note ?? null, p_proof_path: null });

export async function loadSchedule(from: string, to: string): Promise<StaffScheduleDay[]> {
  const rows = (await rpc<Row[] | null>('staff_schedule', { p_from: from, p_to: to })) ?? [];
  return rows.map((r) => ({ date: r.work_date as string, startTime: r.start_time ? String(r.start_time).slice(0, 5) : null, swapped: !!r.swapped }));
}

export interface Payslip { month: number; year: number; basic: number; meal: number; bpjs: number; bonus: number; penalty: number; advance: number; commission: number; net: number }
export async function loadPayslips(): Promise<Payslip[]> {
  const rows = (await rpc<Row[] | null>('staff_payslips')) ?? [];
  const n = (v: unknown) => Number(v ?? 0);
  return rows.map((r) => ({
    month: n(r.period_month), year: n(r.period_year), basic: n(r.basic_salary), meal: n(r.meal_allowance), bpjs: n(r.bpjs_allowance),
    bonus: n(r.lateness_bonus) + n(r.stockan_incentive) + n(r.deep_cleaning_incentive),
    penalty: n(r.lateness_penalty) + n(r.absence_penalty) + n(r.operational_mistakes_penalty) + n(r.stock_opname_penalty),
    advance: n(r.cash_advance_deduction), commission: n(r.commission), net: n(r.net_salary),
  }));
}

export interface Notice { id: string; title: string; body: string; createdAt: string }
export async function loadNotices(employeeId: string): Promise<Notice[]> {
  const { data, error } = await supabase.from('employee_notifications').select('id,title,body,created_at,employee_id').or(`employee_id.eq.${employeeId},employee_id.is.null`).order('created_at', { ascending: false }).limit(40);
  if (error) throw new Error(error.message);
  return ((data as Row[] | null) ?? []).map((x) => ({ id: x.id as string, title: x.title as string, body: x.body as string, createdAt: x.created_at as string }));
}
