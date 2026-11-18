import { localClock, zonedTime } from './ps';

/**
 * Jadwal PS (migrasi 0159): sesi sewa dan booking per station untuk tampilan blok waktu seperti kalender, di kasir dan aplikasi karyawan.
 * Waktu disimpan sebagai ISO UTC; tampilan memakai zona waktu outlet.
 */
export interface PsSessionPart { label: string; minutes: number; price: number }
export type PsSessionStatus = 'running' | 'finished';
export type PsBookingStatus = 'active' | 'cancelled' | 'started' | 'expired';

export interface PsSessionRow {
  id: string; tableId: string; customerName?: string;
  pressedAt: string; billableStart: string; endsAt: string;
  parts: PsSessionPart[]; total: number; paid: boolean;
  status: PsSessionStatus; finishedAt?: string;
  /** naik tiap perubahan; server hanya menerima rev yang lebih besar */
  rev: number;
}
export interface PsBookingRow {
  id: string; tableId: string; name: string; phone?: string;
  startAt: string; durationMinutes: number; label: string; price: number; paid: boolean;
  status: PsBookingStatus; expiresAt: string; createdByName?: string; createdAt?: string; rev: number;
}
export interface PsBoard { sessions: PsSessionRow[]; bookings: PsBookingRow[]; serverNow?: string }

export type PsBlockKind = 'running' | 'warning' | 'overtime' | 'finished' | 'booking-paid' | 'booking-unpaid';
export interface PsBlock {
  id: string; tableId: string; kind: PsBlockKind; title: string; start: Date; end: Date;
  /** bagian lewat waktu (hanya sesi berjalan yang melewati akhir) */
  overtimeEnd?: Date; paid: boolean; source: 'session' | 'booking';
}

const WARN_MS = 10 * 60000;

/** Blok waktu semua sesi dan booking aktif. Sesi berjalan: hijau, kuning 10 menit terakhir, merah + garis lewat waktu. Selesai: abu. */
export function psBlocks(sessions: readonly PsSessionRow[], bookings: readonly PsBookingRow[], now: Date): PsBlock[] {
  const out: PsBlock[] = [];
  for (const s of sessions) {
    const start = new Date(s.billableStart), end = new Date(s.endsAt);
    if (s.status === 'finished') {
      const fin = s.finishedAt ? new Date(s.finishedAt) : end;
      out.push({ id: s.id, tableId: s.tableId, kind: 'finished', title: s.customerName ?? 'Sewa', start, end: new Date(Math.min(Math.max(fin.getTime(), start.getTime() + 60000), Math.max(end.getTime(), fin.getTime()))), paid: s.paid, source: 'session' });
      continue;
    }
    const left = end.getTime() - now.getTime();
    const kind: PsBlockKind = left < 0 ? 'overtime' : left <= WARN_MS ? 'warning' : 'running';
    out.push({ id: s.id, tableId: s.tableId, kind, title: s.customerName ?? 'Sewa', start, end, ...(left < 0 ? { overtimeEnd: now } : {}), paid: s.paid, source: 'session' });
  }
  for (const b of bookings) {
    if (b.status !== 'active' && b.status !== 'started') continue;
    const start = new Date(b.startAt);
    out.push({ id: b.id, tableId: b.tableId, kind: b.paid ? 'booking-paid' : 'booking-unpaid', title: b.name, start, end: new Date(start.getTime() + b.durationMinutes * 60000), paid: b.paid, source: 'booking' });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Rentang satu hari lokal outlet sebagai [mulai, selesai) dalam UTC. */
export function dayRangeUtc(dateKey: string, tz: string): { from: Date; to: Date } {
  const from = zonedTime(dateKey, '00:00', tz) ?? new Date(`${dateKey}T00:00:00Z`);
  return { from, to: new Date(from.getTime() + 24 * 3600000) };
}

/** Jam awal dan akhir (bilangan bulat) kolom garis waktu: bawaan 10 sampai 24, diperlebar bila ada blok di luarnya. */
export function timelineHours(blocks: readonly PsBlock[], dayFrom: Date, tz: string, base = { start: 10, end: 24 }): { start: number; end: number } {
  let start = base.start, end = base.end;
  const hourOf = (d: Date) => { const c = localClock(d, tz); const dayOffset = Math.floor((d.getTime() - dayFrom.getTime()) / 86400000); return dayOffset * 24 + c.minuteOfDay / 60; };
  for (const b of blocks) {
    const s = hourOf(b.start), e = hourOf(b.end);
    if (s < start) start = Math.max(0, Math.floor(s));
    if (e > end) end = Math.min(30, Math.ceil(e));
  }
  return { start, end };
}

/** Posisi blok dalam jam desimal sejak tengah malam hari yang ditampilkan (bisa < 0 atau > 24 bila melewati hari). */
export function blockHours(b: Pick<PsBlock, 'start' | 'end'>, dayFrom: Date): { start: number; end: number } {
  return { start: (b.start.getTime() - dayFrom.getTime()) / 3600000, end: (b.end.getTime() - dayFrom.getTime()) / 3600000 };
}

/** Station yang kosong sekarang dan sampai jam berapa (booking berikutnya); station perawatan tidak dihitung. */
export function freeUntil(tableId: string, blocks: readonly PsBlock[], now: Date): { free: boolean; until?: Date } {
  const mine = blocks.filter((b) => b.tableId === tableId && b.kind !== 'finished');
  if (mine.some((b) => b.start.getTime() <= now.getTime() && (b.end.getTime() > now.getTime() || b.kind === 'overtime'))) return { free: false };
  const next = mine.filter((b) => b.start.getTime() > now.getTime()).sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  return next ? { free: true, until: next.start } : { free: true };
}

/** Ada tumpang tindih dengan blok lain di station yang sama? (dipakai memeriksa booking baru sebelum dikirim) */
export function overlapsBlocks(tableId: string, start: Date, end: Date, blocks: readonly PsBlock[]): PsBlock | null {
  return blocks.find((b) => b.tableId === tableId && b.kind !== 'finished' && b.start.getTime() < end.getTime() && start.getTime() < b.end.getTime()) ?? null;
}

/** Terjemahkan galat server menjadi kalimat Bahasa Indonesia. */
export function psScheduleError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('booking clash')) return 'Station itu sudah dibooking pada jam tersebut.';
  if (m.includes('station busy')) return 'Station itu sedang dipakai pada jam tersebut.';
  if (m.includes('station not found')) return 'Station tidak ditemukan atau sedang perawatan.';
  if (m.includes('not allowed')) return 'Kamu tidak berhak mengubah jadwal ini.';
  return raw;
}

// ---------------------------------------------------------------------------------------------
// Konversi dari dan ke bentuk fungsi server (snake_case), dipakai DataLayer dan aplikasi karyawan

type Raw = Record<string, unknown>;
const asIso = (v: unknown): string => (typeof v === 'string' ? new Date(v).toISOString() : new Date(0).toISOString());

export function parsePsBoard(json: unknown): PsBoard {
  const j = (json ?? {}) as Raw;
  const sessions = ((j.sessions as Raw[] | null) ?? []).map((r): PsSessionRow => ({
    id: r.id as string, tableId: r.table_id as string, ...(r.customer_name ? { customerName: r.customer_name as string } : {}),
    pressedAt: asIso(r.pressed_at), billableStart: asIso(r.billable_start), endsAt: asIso(r.ends_at),
    parts: ((r.parts as PsSessionPart[] | null) ?? []).map((p) => ({ label: String(p.label), minutes: Number(p.minutes), price: Number(p.price) })),
    total: Number(r.total ?? 0), paid: !!r.paid, status: r.status === 'finished' ? 'finished' : 'running',
    ...(r.finished_at ? { finishedAt: asIso(r.finished_at) } : {}), rev: Number(r.rev ?? 1),
  }));
  const bookings = ((j.bookings as Raw[] | null) ?? []).map((r): PsBookingRow => ({
    id: r.id as string, tableId: r.table_id as string, name: r.name as string, ...(r.phone ? { phone: r.phone as string } : {}),
    startAt: asIso(r.start_at), durationMinutes: Number(r.duration_minutes), label: String(r.label ?? ''), price: Number(r.price ?? 0), paid: !!r.paid,
    status: (['active', 'cancelled', 'started', 'expired'].includes(String(r.status)) ? r.status : 'active') as PsBookingStatus, expiresAt: asIso(r.expires_at),
    ...(r.created_by_name ? { createdByName: r.created_by_name as string } : {}), ...(r.created_at ? { createdAt: asIso(r.created_at) } : {}), rev: Number(r.rev ?? 1),
  }));
  return { sessions, bookings, ...(j.server_now ? { serverNow: asIso(j.server_now) } : {}) };
}

export const psSessionRpcRow = (r: PsSessionRow): Raw => ({
  id: r.id, table_id: r.tableId, customer_name: r.customerName ?? null, pressed_at: r.pressedAt, billable_start: r.billableStart, ends_at: r.endsAt,
  parts: r.parts, total: r.total, paid: r.paid, status: r.status, finished_at: r.finishedAt ?? null, rev: r.rev,
});
export const psBookingRpcRow = (r: PsBookingRow): Raw => ({
  id: r.id, table_id: r.tableId, name: r.name, phone: r.phone ?? null, start_at: r.startAt, duration_minutes: r.durationMinutes, label: r.label, price: r.price,
  paid: r.paid, status: r.status, expires_at: r.expiresAt, rev: r.rev,
});
