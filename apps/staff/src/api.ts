import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { taskPhotoPath, type StaffMe, type TaskRun } from '@cgpos/shared';

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
