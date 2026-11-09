import { localDateKey } from '@cgpos/shared';

const OFFSET_HOURS: Record<string, number> = { 'Asia/Jakarta': 7, 'Asia/Makassar': 8, 'Asia/Jayapura': 9 };

/** Awal dan akhir hari lokal outlet sebagai ISO UTC. */
export function dayRange(tz: string, now = new Date()): { from: string; to: string; label: string } {
  const key = localDateKey(now, tz);
  const off = OFFSET_HOURS[tz] ?? 7;
  const start = new Date(`${key}T00:00:00Z`).getTime() - off * 3600_000;
  return { from: new Date(start).toISOString(), to: new Date(start + 86400_000).toISOString(), label: key };
}
