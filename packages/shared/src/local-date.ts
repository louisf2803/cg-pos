// Tanggal lokal "yyyy-mm-dd" untuk zona waktu tertentu (bawaan Asia/Jakarta). Jangan pakai toISOString().slice(0, 10): itu tanggal UTC,
// yang antara 00.00 dan 07.00 WIB masih "kemarin" dan membuat tanggal hari ini ditolak sebagai masa depan.

export function localDateString(d: Date, timeZone = 'Asia/Jakarta'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Awal bulan lokal "yyyy-mm-01". */
export function localMonthStart(d: Date, timeZone = 'Asia/Jakarta'): string {
  return localDateString(d, timeZone).slice(0, 7) + '-01';
}
