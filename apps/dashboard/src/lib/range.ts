import { localDateKey } from '@cgpos/shared';

const OFFSET_HOURS: Record<string, number> = { 'Asia/Jakarta': 7, 'Asia/Makassar': 8, 'Asia/Jayapura': 9 };

/** Awal dan akhir hari lokal outlet sebagai ISO UTC. */
export function dayRange(tz: string, now = new Date()): { from: string; to: string; label: string } {
  const key = localDateKey(now, tz);
  const off = OFFSET_HOURS[tz] ?? 7;
  const start = new Date(`${key}T00:00:00Z`).getTime() - off * 3600_000;
  return { from: new Date(start).toISOString(), to: new Date(start + 86400_000).toISOString(), label: key };
}

export type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';
export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Hari ini' }, { id: 'yesterday', label: 'Kemarin' }, { id: '7d', label: '7 hari' },
  { id: '30d', label: '30 hari' }, { id: 'month', label: 'Bulan ini' }, { id: 'custom', label: 'Pilih tanggal' },
];

/** Tanggal lokal 'YYYY-MM-DD' (inklusif) -> rentang UTC [from, to). */
export function dateRange(tz: string, fromKey: string, toKey: string): { from: string; to: string; label: string } {
  const off = OFFSET_HOURS[tz] ?? 7;
  const start = new Date(`${fromKey}T00:00:00Z`).getTime() - off * 3600_000;
  const end = new Date(`${toKey}T00:00:00Z`).getTime() - off * 3600_000 + 86400_000;
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString(), label: fromKey === toKey ? fromKey : `${fromKey} sampai ${toKey}` };
}

const addDays = (key: string, n: number) => new Date(new Date(`${key}T00:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);

export function presetRange(tz: string, preset: Exclude<Preset, 'custom'>, now = new Date()) {
  const today = localDateKey(now, tz);
  switch (preset) {
    case 'today': return dateRange(tz, today, today);
    case 'yesterday': return dateRange(tz, addDays(today, -1), addDays(today, -1));
    case '7d': return dateRange(tz, addDays(today, -6), today);
    case '30d': return dateRange(tz, addDays(today, -29), today);
    case 'month': return dateRange(tz, today.slice(0, 8) + '01', today);
  }
}
