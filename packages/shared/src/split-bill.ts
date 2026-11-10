/** Pisah tagihan per item: pilih berapa dari tiap baris yang dibayar sekarang; sisanya tetap di pesanan asal. */
export interface SplitLine { id: string; qty: number }
export interface SplitResult<T extends SplitLine> {
  /** baris yang dibayar sekarang (id baru, jumlah = pilihan) */
  paid: T[];
  /** baris yang tetap di pesanan asal (id lama, jumlah = sisa) */
  remain: T[];
  /** pesan galat bila pilihan tidak sah; paid/remain kosong */
  problem: string | null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * @param picks jumlah per id baris (0 atau kosong = tidak dipilih). Tidak boleh melebihi jumlah baris.
 * @param makeId pembuat id baru untuk baris yang dipisah (supaya tidak bentrok dengan baris pesanan asal)
 */
export function splitByItem<T extends SplitLine>(lines: T[], picks: Record<string, number>, makeId: () => string): SplitResult<T> {
  const bad = (problem: string): SplitResult<T> => ({ paid: [], remain: [], problem });
  const known = new Set(lines.map((l) => l.id));
  for (const id of Object.keys(picks)) if ((picks[id] ?? 0) !== 0 && !known.has(id)) return bad('Ada item yang dipilih tidak ada di pesanan.');
  const paid: T[] = [], remain: T[] = [];
  for (const l of lines) {
    const p = round3(picks[l.id] ?? 0);
    if (!Number.isFinite(p) || p < 0) return bad('Jumlah yang dipisah tidak sah.');
    if (p > l.qty) return bad(`Jumlah yang dipisah melebihi yang dipesan.`);
    if (p > 0) paid.push({ ...l, id: makeId(), qty: p });
    const rest = round3(l.qty - p);
    if (rest > 0) remain.push({ ...l, qty: rest });
  }
  if (!paid.length) return bad('Pilih minimal satu item untuk dibayar sekarang.');
  if (!remain.length) return bad('Semua item dipilih. Tekan Bayar untuk membayar seluruh pesanan.');
  return { paid, remain, problem: null };
}
