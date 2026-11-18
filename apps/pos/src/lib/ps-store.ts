import { useCallback, useEffect, useRef, useState } from 'react';
import { isNetworkError, runState, sessionSchedule, type DataLayer, type PsBoard, type PsBookingRow, type PsChoice, type PsPackage, type PsSessionRow } from '@cgpos/shared';

/**
 * Sesi dan booking PS di tablet kasir. Disimpan di perangkat (localStorage) dan memakai jam tablet sehingga jalan tanpa internet;
 * tiap perubahan menaikkan `rev` dan masuk antrean kirim (dirty). Bila online, perubahan dikirim ke server (migrasi 0159) dan jadwal terbaru
 * dari server (tablet lain, aplikasi karyawan) digabung: catatan yang belum terkirim tidak pernah ditimpa, selain itu rev yang lebih besar menang.
 */
export type PsSession = PsSessionRow;
export type PsBooking = PsBookingRow;
export interface PsState { sessions: PsSession[]; bookings: PsBooking[]; dirty: { sessions: string[]; bookings: string[] } }
export const EMPTY_PS_STATE: PsState = { sessions: [], bookings: [], dirty: { sessions: [], bookings: [] } };

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const uniq = (a: string[], id: string) => (a.includes(id) ? a : [...a, id]);
const markS = (st: PsState, id: string): PsState => ({ ...st, dirty: { ...st.dirty, sessions: uniq(st.dirty.sessions, id) } });
const markB = (st: PsState, id: string): PsState => ({ ...st, dirty: { ...st.dirty, bookings: uniq(st.dirty.bookings, id) } });

export function startSession(
  state: PsState,
  i: { tableId: string; customerName?: string; choice: PsChoice; label: string; price: number; graceMinutes: number; tz: string; now: Date; paid?: boolean },
): PsState {
  if (state.sessions.some((s) => s.tableId === i.tableId && s.status === 'running')) throw new Error('Station ini sedang disewa.');
  const sch = sessionSchedule(i.now, i.graceMinutes, i.choice, i.tz);
  if (sch.durationMinutes <= 0) throw new Error('Waktu sewa sudah habis untuk paket ini.');
  const s: PsSession = {
    id: newId(), tableId: i.tableId, ...(i.customerName?.trim() ? { customerName: i.customerName.trim() } : {}),
    pressedAt: sch.pressedAt.toISOString(), billableStart: sch.billableStart.toISOString(), endsAt: sch.endsAt.toISOString(),
    parts: [{ label: i.label, minutes: sch.durationMinutes, price: i.price }], total: i.price, paid: !!i.paid, status: 'running', rev: 1,
  };
  // booking untuk station ini yang sudah berjalan atau mulai dalam 15 menit dianggap terpakai (sama seperti server)
  const near = (b: PsBooking) => b.tableId === i.tableId && b.status === 'active' && new Date(b.startAt).getTime() <= sch.billableStart.getTime() + 15 * 60000 && new Date(b.startAt).getTime() + b.durationMinutes * 60000 > sch.billableStart.getTime();
  const used = state.bookings.filter(near);
  let next: PsState = { ...state, sessions: [...state.sessions, s], bookings: state.bookings.map((b) => (near(b) ? { ...b, status: 'started' as const, rev: b.rev + 1 } : b)) };
  next = markS(next, s.id);
  for (const b of used) next = markB(next, b.id);
  return next;
}

/** Tambah waktu: paket atau durasi baru disambung di belakang waktu selesai sekarang (atau dari sekarang bila sudah lewat waktu). */
export function extendSession(state: PsState, sessionId: string, i: { minutes: number; label: string; price: number; now: Date }): PsState {
  const next: PsState = {
    ...state,
    sessions: state.sessions.map((s) => {
      if (s.id !== sessionId) return s;
      const base = Math.max(new Date(s.endsAt).getTime(), i.now.getTime());
      return { ...s, endsAt: new Date(base + i.minutes * 60000).toISOString(), parts: [...s.parts, { label: i.label, minutes: i.minutes, price: i.price }], total: s.total + i.price, rev: s.rev + 1 };
    }),
  };
  return markS(next, sessionId);
}

/** Selesai: sesi tetap tersimpan (abu-abu di jadwal) dengan waktu selesai sebenarnya. */
export const finishSession = (state: PsState, sessionId: string, now: Date = new Date()): PsState =>
  markS({ ...state, sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, status: 'finished' as const, finishedAt: now.toISOString(), rev: s.rev + 1 } : s)) }, sessionId);

export function addBooking(state: PsState, i: { tableId: string; name: string; phone: string; startAt: string; durationMinutes: number; label: string; price: number; now: Date; expiryMinutes: number }): PsState {
  const start = new Date(i.startAt).getTime();
  const end = start + i.durationMinutes * 60000;
  const clash = state.bookings.some((b) => b.tableId === i.tableId && b.status === 'active' && new Date(b.startAt).getTime() < end && start < new Date(b.startAt).getTime() + b.durationMinutes * 60000);
  if (clash) throw new Error('Station itu sudah dibooking pada jam tersebut.');
  if (state.sessions.some((s) => s.tableId === i.tableId && s.status === 'running' && new Date(s.endsAt).getTime() > start && new Date(s.billableStart).getTime() < end)) throw new Error('Station itu sedang dipakai pada jam tersebut.');
  const b: PsBooking = {
    id: newId(), tableId: i.tableId, name: i.name, ...(i.phone ? { phone: i.phone } : {}), startAt: i.startAt, durationMinutes: i.durationMinutes, label: i.label, price: i.price,
    paid: false, status: 'active', expiresAt: new Date(i.now.getTime() + i.expiryMinutes * 60000).toISOString(), createdAt: i.now.toISOString(), rev: 1,
  };
  return markB({ ...state, bookings: [...state.bookings, b] }, b.id);
}
export const markBookingPaid = (state: PsState, id: string): PsState => markB({ ...state, bookings: state.bookings.map((b) => (b.id === id ? { ...b, paid: true, rev: b.rev + 1 } : b)) }, id);
export const cancelBooking = (state: PsState, id: string): PsState => markB({ ...state, bookings: state.bookings.map((b) => (b.id === id ? { ...b, status: 'cancelled' as const, rev: b.rev + 1 } : b)) }, id);

/** Booking belum lunas yang melewati batas dihanguskan (disinkronkan ke server); catatan lama yang sudah terkirim dibuang. */
export function pruneState(state: PsState, now: Date): PsState {
  let next = state;
  for (const b of state.bookings) {
    if (b.status === 'active' && !b.paid && new Date(b.expiresAt).getTime() < now.getTime()) {
      next = markB({ ...next, bookings: next.bookings.map((x) => (x.id === b.id ? { ...x, status: 'expired' as const, rev: x.rev + 1 } : x)) }, b.id);
    }
  }
  const cutoff = now.getTime() - 36 * 3600000;
  const keepS = (s: PsSession) => next.dirty.sessions.includes(s.id) || s.status === 'running' || new Date(s.finishedAt ?? s.endsAt).getTime() > cutoff;
  const keepB = (b: PsBooking) => next.dirty.bookings.includes(b.id) || (b.status === 'active' && new Date(b.startAt).getTime() + b.durationMinutes * 60000 > now.getTime() - 30 * 60000) || (b.status === 'started' && new Date(b.startAt).getTime() > cutoff);
  const s2 = next.sessions.filter(keepS), b2 = next.bookings.filter(keepB);
  if (next === state && s2.length === state.sessions.length && b2.length === state.bookings.length) return state;
  return { ...next, sessions: s2, bookings: b2 };
}
/** Nama lama tetap dipakai oleh pemanggil yang hanya butuh membuang booking kedaluwarsa. */
export const pruneBookings = pruneState;

/** Gabungkan jadwal dari server: catatan yang belum terkirim tetap milik tablet ini; selain itu rev lebih besar menang; booking aktif yang hilang dari server (dibatalkan/hangus di tempat lain) dibuang. */
export function mergeBoard(state: PsState, board: PsBoard, range: { from: Date; to: Date }): PsState {
  const dS = new Set(state.dirty.sessions), dB = new Set(state.dirty.bookings);
  let sessions = [...state.sessions];
  for (const s of board.sessions) {
    const i = sessions.findIndex((x) => x.id === s.id);
    if (i < 0) sessions.push(s);
    else if (!dS.has(s.id) && s.rev > sessions[i]!.rev) sessions[i] = s;
  }
  const serverB = new Map(board.bookings.map((b) => [b.id, b]));
  let bookings = [...state.bookings];
  for (const b of board.bookings) {
    const i = bookings.findIndex((x) => x.id === b.id);
    if (i < 0) bookings.push(b);
    else if (!dB.has(b.id) && b.rev > bookings[i]!.rev) bookings[i] = b;
  }
  bookings = bookings.filter((b) => {
    if (dB.has(b.id) || serverB.has(b.id)) return true;
    const st = new Date(b.startAt).getTime();
    return !(b.status === 'active' && st >= range.from.getTime() && st < range.to.getTime());
  });
  return { ...state, sessions, bookings };
}

export type PsBoardState = 'kosong' | 'aktif' | 'menit-terakhir' | 'lewat' | 'booking' | 'perawatan';
export interface PsBoardInfo { state: PsBoardState; session?: PsSession; booking?: PsBooking; seconds?: number; waiting?: boolean }
/** Status kartu station dari sesi dan booking. Menit terakhir = sisa 10 menit atau kurang. */
export function boardInfo(tableId: string, maintenance: boolean, st: PsState, now: Date): PsBoardInfo {
  if (maintenance) return { state: 'perawatan' };
  const session = st.sessions.find((s) => s.tableId === tableId && s.status === 'running');
  if (session) {
    const r = runState(now, new Date(session.billableStart), new Date(session.endsAt));
    const state: PsBoardState = r.state === 'overtime' ? 'lewat' : r.seconds <= 600 ? 'menit-terakhir' : 'aktif';
    return { state, session, seconds: r.seconds, waiting: r.state === 'waiting' };
  }
  const next = st.bookings.filter((b) => b.tableId === tableId && b.status === 'active' && new Date(b.startAt).getTime() + b.durationMinutes * 60000 > now.getTime()).sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  return next ? { state: 'booking', booking: next } : { state: 'kosong' };
}

/** Pilihan sewa untuk satu station: paket yang berlaku sekarang, diurutkan. */
export const sortedPackages = (pkgs: PsPackage[]): PsPackage[] => [...pkgs].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------------------------
// Penyimpanan di perangkat dan hook React

const key = (outletId: string) => `cgpos_ps_state_${outletId}`;
export function loadPsState(outletId: string): PsState {
  try {
    const raw = localStorage.getItem(key(outletId));
    const p = raw ? (JSON.parse(raw) as Partial<PsState>) : null;
    // bentuk lama (tanpa rev/status) dibuang: belum pernah terkirim ke server
    const okS = (x: unknown): x is PsSession => !!x && typeof (x as PsSession).rev === 'number' && typeof (x as PsSession).status === 'string';
    const okB = (x: unknown): x is PsBooking => !!x && typeof (x as PsBooking).rev === 'number' && typeof (x as PsBooking).status === 'string';
    const sessions = Array.isArray(p?.sessions) ? p!.sessions!.filter(okS) : [];
    const bookings = Array.isArray(p?.bookings) ? p!.bookings!.filter(okB) : [];
    const d = p?.dirty;
    return { sessions, bookings, dirty: { sessions: Array.isArray(d?.sessions) ? d!.sessions.filter((id) => sessions.some((s) => s.id === id)) : [], bookings: Array.isArray(d?.bookings) ? d!.bookings.filter((id) => bookings.some((b) => b.id === id)) : [] } };
  } catch { return EMPTY_PS_STATE; }
}
function savePsState(outletId: string, s: PsState) { try { localStorage.setItem(key(outletId), JSON.stringify(s)); } catch { /* penyimpanan penuh atau dimatikan */ } }

/** Status sesi dan booking di perangkat ini; setiap perubahan langsung disimpan. */
export function usePsState(outletId: string): [PsState, (fn: (s: PsState) => PsState) => void] {
  const [state, setState] = useState<PsState>(() => loadPsState(outletId));
  useEffect(() => { setState(loadPsState(outletId)); }, [outletId]);
  const update = useCallback((fn: (s: PsState) => PsState) => {
    setState((cur) => { const next = fn(cur); if (next !== cur) savePsState(outletId, next); return next; });
  }, [outletId]);
  return [state, update];
}

/**
 * Kirim perubahan yang belum terkirim lalu tarik jadwal terbaru dari server tiap 15 detik dan setiap ada perubahan baru.
 * Ditolak server (mis. station sudah dipakai di tablet lain) = catatan dibuang dan `onRejected` dipanggil dengan pesannya; gagal jaringan = dicoba lagi.
 */
export function usePsSync(data: DataLayer, state: PsState, update: (fn: (s: PsState) => PsState) => void, onRejected: (msg: string) => void): { syncing: boolean; lastSync: Date | null; error: boolean; syncNow: () => void } {
  const ref = useRef(state);
  ref.current = state;
  const busy = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const rejected = useRef(onRejected);
  rejected.current = onRejected;

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; setSyncing(true);
    try {
      const snap = ref.current;
      for (const id of snap.dirty.sessions) {
        const row = ref.current.sessions.find((s) => s.id === id);
        if (!row) { update((s) => ({ ...s, dirty: { ...s.dirty, sessions: s.dirty.sessions.filter((x) => x !== id) } })); continue; }
        try { await data.psSaveSession(row); update((s) => ({ ...s, dirty: { ...s.dirty, sessions: s.dirty.sessions.filter((x) => x !== id) } })); }
        catch (e) {
          if (isNetworkError(e)) throw e;
          rejected.current(e instanceof Error ? e.message : 'Sesi PS ditolak server.');
          update((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== id), dirty: { ...s.dirty, sessions: s.dirty.sessions.filter((x) => x !== id) } }));
        }
      }
      for (const id of ref.current.dirty.bookings) {
        const row = ref.current.bookings.find((b) => b.id === id);
        if (!row) { update((s) => ({ ...s, dirty: { ...s.dirty, bookings: s.dirty.bookings.filter((x) => x !== id) } })); continue; }
        try { await data.psSaveBooking(row); update((s) => ({ ...s, dirty: { ...s.dirty, bookings: s.dirty.bookings.filter((x) => x !== id) } })); }
        catch (e) {
          if (isNetworkError(e)) throw e;
          rejected.current(`Booking ${row.name}: ${e instanceof Error ? e.message : 'ditolak server.'}`);
          update((s) => ({ ...s, bookings: s.bookings.filter((x) => x.id !== id), dirty: { ...s.dirty, bookings: s.dirty.bookings.filter((x) => x !== id) } }));
        }
      }
      const from = new Date(Date.now() - 24 * 3600000), to = new Date(Date.now() + 7 * 24 * 3600000);
      const board = await data.psBoard({ from: from.toISOString(), to: to.toISOString() });
      update((s) => mergeBoard(s, board, { from, to }));
      setLastSync(new Date()); setError(false);
    } catch { setError(true); }
    finally { busy.current = false; setSyncing(false); }
  }, [data, update]);

  const dirtyCount = state.dirty.sessions.length + state.dirty.bookings.length;
  useEffect(() => { void run(); const t = setInterval(() => void run(), 15000); return () => clearInterval(t); }, [run]);
  useEffect(() => { if (dirtyCount > 0) void run(); }, [dirtyCount, run]);
  return { syncing, lastSync, error, syncNow: () => void run() };
}

/** Jam tablet yang diperbarui tiap `ms` milidetik. */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
