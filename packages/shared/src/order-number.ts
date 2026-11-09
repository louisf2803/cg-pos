/** Indonesia tidak memakai DST; offset tetap per zona. */
const TZ_OFFSET_MIN: Record<string, number> = { 'Asia/Jakarta': 420, 'Asia/Makassar': 480, 'Asia/Jayapura': 540 };

export function localParts(date: Date, tz = 'Asia/Jakarta') {
  const off = TZ_OFFSET_MIN[tz] ?? 420;
  const d = new Date(date.getTime() + off * 60_000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

/** yyyy-mm-dd menurut zona outlet */
export function localDateKey(date: Date, tz = 'Asia/Jakarta'): string {
  const p = localParts(date, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** {kode outlet}/{kode perangkat}/{yymmdd}/{urut}, mis. OUT1/A/261109/001. Awalan wajib cocok dengan aturan server. */
export function formatOrderNumber(outletCode: string, deviceCode: string, date: Date, seq: number, tz = 'Asia/Jakarta'): string {
  const p = localParts(date, tz);
  const yymmdd = `${String(p.y % 100).padStart(2, '0')}${String(p.m).padStart(2, '0')}${String(p.d).padStart(2, '0')}`;
  return `${outletCode}/${deviceCode}/${yymmdd}/${String(seq).padStart(3, '0')}`;
}
