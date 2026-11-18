import { parsePsBoard, psBookingRpcRow, psScheduleError, type PsBoard, type PsBookingRow, type PsPackage, type PsRateBand, type PsSettings, type PsStation } from '@cgpos/shared';
import { supabase } from './api';

type Row = Record<string, unknown>;
export const PS_TZ = 'Asia/Jakarta';

/** Station PS (meja pada lantai berjenis PS) beserta tarif, pita jam, dan game untuk satu outlet. */
export async function loadPsStations(outletId: string): Promise<PsStation[]> {
  const st = await supabase.from('ps_stations').select('table_id,console_label,rate_per_hour,is_maintenance,games').eq('outlet_id', outletId);
  if (st.error) throw new Error(st.error.message);
  const rows = (st.data as Row[] | null) ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.table_id as string);
  const [tb, bd] = await Promise.all([
    supabase.from('tables').select('id,floor_id,name,sort').in('id', ids).is('deleted_at', null),
    supabase.from('ps_rate_bands').select('table_id,start_min,end_min,rate_per_hour,weekdays').in('table_id', ids),
  ]);
  if (tb.error) throw new Error(tb.error.message);
  const names = new Map(((tb.data as Row[] | null) ?? []).map((t) => [t.id as string, t]));
  const bands = new Map<string, PsRateBand[]>();
  for (const b of ((bd.data as Row[] | null) ?? [])) {
    const list = bands.get(b.table_id as string) ?? [];
    list.push({ startMin: Number(b.start_min), endMin: Number(b.end_min), ratePerHour: Number(b.rate_per_hour), ...(Array.isArray(b.weekdays) ? { weekdays: (b.weekdays as number[]).map(Number) } : {}) });
    bands.set(b.table_id as string, list);
  }
  return rows.filter((r) => names.has(r.table_id as string)).map((r): PsStation => {
    const t = names.get(r.table_id as string)!;
    return {
      tableId: r.table_id as string, floorId: (t.floor_id as string | null) ?? null, name: t.name as string, configured: true, consoleLabel: r.console_label as string,
      ratePerHour: Number(r.rate_per_hour), isMaintenance: !!r.is_maintenance, games: (r.games as string[] | null) ?? [], bands: bands.get(r.table_id as string) ?? [],
    };
  }).sort((a, b) => Number((names.get(a.tableId)!.sort as number) ?? 0) - Number((names.get(b.tableId)!.sort as number) ?? 0) || a.name.localeCompare(b.name));
}

export async function loadPsPackages(outletId: string): Promise<PsPackage[]> {
  const { data, error } = await supabase.from('ps_packages').select('id,name,duration_minutes,price,window_start_min,window_end_min,table_ids,weekdays,is_active,sort').eq('outlet_id', outletId).eq('is_active', true).order('sort');
  if (error) throw new Error(error.message);
  return ((data as Row[] | null) ?? []).map((r): PsPackage => ({
    id: r.id as string, name: r.name as string, price: Number(r.price), tableIds: (r.table_ids as string[] | null) ?? [], isActive: true, sort: Number(r.sort ?? 0),
    ...(r.duration_minutes != null ? { durationMinutes: Number(r.duration_minutes) } : {}),
    ...(r.window_start_min != null ? { windowStartMin: Number(r.window_start_min), windowEndMin: Number(r.window_end_min) } : {}),
    ...(Array.isArray(r.weekdays) ? { weekdays: (r.weekdays as number[]).map(Number) } : {}),
  }));
}

export async function loadPsSettings(outletId: string): Promise<PsSettings> {
  const { data, error } = await supabase.from('outlet_settings').select('ps_grace_minutes,ps_booking_expiry_minutes,ps_booking_message').eq('outlet_id', outletId).single();
  if (error) throw new Error(error.message);
  const r = data as Row;
  return { graceMinutes: Number(r.ps_grace_minutes ?? 5), bookingExpiryMinutes: Number(r.ps_booking_expiry_minutes ?? 120), ...(r.ps_booking_message ? { bookingMessage: r.ps_booking_message as string } : {}) };
}

export async function loadPsBoard(outletId: string, from: Date, to: Date): Promise<PsBoard> {
  const { data, error } = await supabase.rpc('ps_board', { p_outlet: outletId, p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw new Error(psScheduleError(error.message));
  return parsePsBoard(data);
}

/** Simpan booking baru atau perubahan (lunas, batal): rev dinaikkan; server menolak bentrok dan karyawan berperan kasir. */
export async function saveBooking(outletId: string, row: PsBookingRow): Promise<void> {
  const { error } = await supabase.rpc('ps_booking_upsert', { p_outlet: outletId, p_row: psBookingRpcRow(row) });
  if (error) throw new Error(psScheduleError(error.message));
}
