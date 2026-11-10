/**
 * Helper murni perbandingan periode penjualan:
 * - Persen perubahan (pertumbuhan)
 * - Perhitungan periode sebelumnya (harian, mingguan, bulanan)
 * - Akumulasi awal bulan (Month-to-Date)
 * - Proyeksi penjualan akhir bulan
 */

/**
 * Menghitung persentase perubahan dari nilai sebelumnya ke nilai saat ini.
 * Aturan tepi:
 * - Sebelumnya 0 dan sekarang > 0 -> 100%
 * - Keduanya 0 -> 0%
 * - Sebelumnya 0 dan sekarang < 0 -> -100%
 * - Pembagi nol dicegah secara eksplisit.
 * Mengembalikan angka persen dibulatkan 1 desimal.
 */
export function percentChange(current: number, previous: number): number {
  if (previous === 0) {
    if (current > 0) return 100;
    if (current < 0) return -100;
    return 0;
  }
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return Math.round(change * 10) / 10;
}

/**
 * Menghitung jumlah hari dalam suatu bulan tertentu (1-indexed month: 1=Januari, 12=Desember).
 * Memperhitungkan tahun kabisat (misal Februari 2024 = 29, Februari 2026 = 28).
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Menggeser tanggal YYYY-MM-DD sebanyak n hari secara UTC agar aman dari DST/offset.
 */
export function shiftDateDays(dateKey: string, days: number): string {
  const parts = dateKey.split('-').map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type PeriodType = 'daily' | 'weekly' | 'monthly';

export interface DateRangeKeys {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

/**
 * Menentukan rentang tanggal periode sebelumnya berdasarkan tipe periode dan rentang saat ini.
 * - 'daily': 1 hari sebelum rentang saat ini (mis. 2026-03-01 -> 2026-02-28; 2026-01-01 -> 2025-12-31)
 * - 'weekly': 7 hari sebelum rentang saat ini (mis. 2026-03-02 s/d 2026-03-08 -> 2026-02-23 s/d 2026-03-01)
 * - 'monthly': 1 bulan kalender penuh sebelum bulan saat ini (mis. 2026-03-01 s/d 2026-03-31 -> 2026-02-01 s/d 2026-02-28; 2026-01-01 s/d 2026-01-31 -> 2025-12-01 s/d 2025-12-31)
 */
export function getPreviousPeriod(
  type: PeriodType,
  current: DateRangeKeys
): DateRangeKeys {
  if (type === 'daily') {
    const prev = shiftDateDays(current.from, -1);
    return { from: prev, to: prev };
  }

  if (type === 'weekly') {
    return {
      from: shiftDateDays(current.from, -7),
      to: shiftDateDays(current.to, -7),
    };
  }

  // Monthly: ambil bulan kalender sebelumnya
  const parts = current.from.split('-').map(Number);
  let prevYear = parts[0] ?? 2026;
  let prevMonth = (parts[1] ?? 1) - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);
  const mm = String(prevMonth).padStart(2, '0');
  const dd = String(daysInPrevMonth).padStart(2, '0');

  return {
    from: `${prevYear}-${mm}-01`,
    to: `${prevYear}-${mm}-${dd}`,
  };
}

/**
 * Mengakumulasikan nilai dari awal bulan hingga tanggal acuan (inklusif).
 * @param dailyData Larik pasangan tanggal (YYYY-MM-DD) dan nilainya.
 * @param dateKey Tanggal acuan (YYYY-MM-DD).
 */
export function monthToDateAccumulation(
  dailyData: { date: string; value: number }[],
  dateKey: string
): number {
  const monthPrefix = dateKey.slice(0, 7); // 'YYYY-MM'
  return dailyData
    .filter((item) => item.date.startsWith(monthPrefix) && item.date <= dateKey)
    .reduce((sum, item) => sum + item.value, 0);
}

/**
 * Menghitung proyeksi penjualan akhir bulan.
 * Rumus: (akumulasi_sejauh_ini / hari_berjalan) * total_hari_dalam_bulan
 * Kasus batas:
 * - Jika hari berjalan <= 0: proyeksi = 0 (mencegah pembagian nol).
 * - Jika hari berjalan >= total hari: proyeksi = akumulasi_sejauh_ini.
 * Mengembalikan bilangan bulat rupiah (Math.round).
 */
export function projectMonthEnd(
  accumulatedSoFar: number,
  currentDayOfMonth: number,
  totalDaysInMonth: number
): number {
  if (currentDayOfMonth <= 0) return 0;
  if (totalDaysInMonth <= 0) return accumulatedSoFar;
  if (currentDayOfMonth >= totalDaysInMonth) return Math.round(accumulatedSoFar);

  const dailyAverage = accumulatedSoFar / currentDayOfMonth;
  return Math.round(dailyAverage * totalDaysInMonth);
}

