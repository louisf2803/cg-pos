import { useCallback, useEffect, useState } from 'react';
import { runState, sessionSchedule, type PsChoice, type PsPackage, type PsRunState } from '@cgpos/shared';

/**
 * Sesi dan booking PS di tablet kasir. Tahap tampilan: disimpan di perangkat ini (localStorage) dan memakai jam tablet,
 * jadi tetap jalan tanpa internet (keputusan Louis). Penyimpanan ke nota, pelanggan, dan sinkronisasi antar perangkat menyusul.
 */
export interface PsSessionPart { label: string; minutes: number; price: number }
export interface PsSession {
  id: string; tableId: string; customerName?: string;
  pressedAt: string; billableStart: string; endsAt: string;
  parts: PsSessionPart[]; total: number;
  /** sudah dibayar lebih dulu (booking lunas) */
  paid?: boolean;
}
export interface PsBooking {
  id: string; tableId: string; name: string; phone: string;
  startAt: string; durationMinutes: number; label: string; price: number;
  paid: boolean; createdAt: string; expiresAt: string;
}
export interface PsState { sessions: PsSession[]; bookings: PsBooking[] }
export const EMPTY_PS_STATE: PsState = { sessions: [], bookings: [] };

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function startSession(
  state: PsState,
  i: { tableId: string; customerName?: string; choice: PsChoice; label: string; price: number; graceMinutes: number; tz: string; now: Date; paid?: boolean },
): PsState {
  if (state.sessions.some((s) => s.tableId === i.tableId)) throw new Error('Station ini sedang disewa.');
  const sch = sessionSchedule(i.now, i.graceMinutes, i.choice, i.tz);
  if (sch.durationMinutes <= 0) throw new Error('Waktu sewa sudah habis untuk paket ini.');
  const s: PsSession = {
    id: newId(), tableId: i.tableId, ...(i.customerName?.trim() ? { customerName: i.customerName.trim() } : {}),
    pressedAt: sch.pressedAt.toISOString(), billableStart: sch.billableStart.toISOString(), endsAt: sch.endsAt.toISOString(),
    parts: [{ label: i.label, minutes: sch.durationMinutes, price: i.price }], total: i.price, ...(i.paid ? { paid: true } : {}),
  };
  // booking untuk station ini yang sudah dimulai dianggap terpakai
  return { sessions: [...state.sessions, s], bookings: state.bookings.filter((b) => !(b.tableId === i.tableId && new Date(b.startAt).getTime() <= i.now.getTime() + 15 * 60000)) };
}

/** Tambah waktu: paket atau durasi baru ditambahkan di belakang waktu selesai sekarang (atau dari sekarang bila sudah lewat waktu). */
export function extendSession(state: PsState, sessionId: string, i: { minutes: number; label: string; price: number; now: Date }): PsState {
  return {
    ...state,
    sessions: state.sessions.map((s) => {
      if (s.id !== sessionId) return s;
      const base = Math.max(new Date(s.endsAt).getTime(), i.now.getTime());
      return { ...s, endsAt: new Date(base + i.minutes * 60000).toISOString(), parts: [...s.parts, { label: i.label, minutes: i.minutes, price: i.price }], total: s.total + i.price };
    }),
  };
}

export const finishSession = (state: PsState, sessionId: string): PsState => ({ ...state, sessions: state.sessions.filter((s) => s.id !== sessionId) });

export function addBooking(state: PsState, i: Omit<PsBooking, 'id' | 'paid' | 'createdAt' | 'expiresAt'> & { now: Date; expiryMinutes: number }): PsState {
  const start = new Date(i.startAt).getTime();
  const end = start + i.durationMinutes * 60000;
  const clash = state.bookings.some((b) => b.tableId === i.tableId && new Date(b.startAt).getTime() < end && start < new Date(b.startAt).getTime() + b.durationMinutes * 60000);
  if (clash) throw new Error('Station itu sudah dibooking pada jam tersebut.');
  const { now, expiryMinutes, ...rest } = i;
  const b: PsBooking = { ...rest, id: newId(), paid: false, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + expiryMinutes * 60000).toISOString() };
  return { ...state, bookings: [...state.bookings, b] };
}
export const markBookingPaid = (state: PsState, id: string): PsState => ({ ...state, bookings: state.bookings.map((b) => (b.id === id ? { ...b, paid: true } : b)) });
export const cancelBooking = (state: PsState, id: string): PsState => ({ ...state, bookings: state.bookings.filter((b) => b.id !== id) });
/** Booking belum lunas yang melewati batas hangus dibuang; booking yang waktunya sudah lewat jauh juga. */
export function pruneBookings(state: PsState, now: Date): PsState {
  const keep = state.bookings.filter((b) => (b.paid || new Date(b.expiresAt).getTime() > now.getTime()) && new Date(b.startAt).getTime() + b.durationMinutes * 60000 > now.getTime() - 30 * 60000);
  return keep.length === state.bookings.length ? state : { ...state, bookings: keep };
}

export type PsBoardState = 'kosong' | 'aktif' | 'menit-terakhir' | 'lewat' | 'booking' | 'perawatan';
export interface PsBoardInfo { state: PsBoardState; session?: PsSession; booking?: PsBooking; seconds?: number; waiting?: boolean }
/** Status kartu station dari sesi dan booking. Menit terakhir = sisa 10 menit atau kurang. */
export function boardInfo(tableId: string, maintenance: boolean, st: PsState, now: Date): PsBoardInfo {
  if (maintenance) return { state: 'perawatan' };
  const session = st.sessions.find((s) => s.tableId === tableId);
  if (session) {
    const r = runState(now, new Date(session.billableStart), new Date(session.endsAt));
    const state: PsBoardState = r.state === 'overtime' ? 'lewat' : r.seconds <= 600 ? 'menit-terakhir' : 'aktif';
    return { state, session, seconds: r.seconds, waiting: r.state === 'waiting' };
  }
  const next = st.bookings.filter((b) => b.tableId === tableId && new Date(b.startAt).getTime() + b.durationMinutes * 60000 > now.getTime()).sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  return next ? { state: 'booking', booking: next } : { state: 'kosong' };
}

/** Pilihan sewa untuk satu station: paket yang berlaku sekarang, diurutkan. */
export const sortedPackages = (pkgs: PsPackage[]): PsPackage[] => [...pkgs].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
export const RUN_STATE_LABEL: Record<PsRunState, string> = { waiting: 'Persiapan', active: 'Berjalan', overtime: 'Lewat waktu' };

// ---------------------------------------------------------------------------------------------
// Penyimpanan di perangkat dan hook React

const key = (outletId: string) => `cgpos_ps_state_${outletId}`;
export function loadPsState(outletId: string): PsState {
  try {
    const raw = localStorage.getItem(key(outletId));
    const p = raw ? (JSON.parse(raw) as Partial<PsState>) : null;
    return { sessions: Array.isArray(p?.sessions) ? p!.sessions! : [], bookings: Array.isArray(p?.bookings) ? p!.bookings! : [] };
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

/** Jam tablet yang diperbarui tiap `ms` milidetik. */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
