/** Uang dalam rupiah utuh (number). Pembulatan baris ke rupiah dilakukan di order-calc. */

/** Format "Rp 49.500". Negatif: "-Rp 1.000". Tanpa Intl supaya sama di web, Node, dan Hermes. */
export function formatRp(n: number): string {
  const v = Math.round(n);
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '-Rp ' : 'Rp ') + s;
}

/** "49.500" / "49500" / "Rp 49.500" -> 49500. Karakter selain angka diabaikan. Kosong -> 0. */
export function parseRp(input: string): number {
  const digits = input.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

/** Bulatkan ke kelipatan `step` terdekat (setengah ke atas). step 0 = tanpa pembulatan. */
export function roundToStep(n: number, step: number): number {
  if (!step || step <= 0) return Math.round(n);
  return Math.round(n / step) * step;
}

/** Tombol nominal cepat di layar bayar: Pas + pecahan uang kertas yang >= tagihan. */
export function quickCashAmounts(total: number): number[] {
  const notes = [10000, 20000, 50000, 100000];
  const out = new Set<number>([total]);
  for (const n of notes) {
    const up = Math.ceil(total / n) * n;
    if (up >= total) out.add(up);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}
