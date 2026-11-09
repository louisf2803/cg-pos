/** Aturan PIN karyawan: 6 digit angka dan tidak mudah ditebak. Mengembalikan pesan galat, atau null bila PIN layak. */
export function pinProblem(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'PIN harus 6 digit angka.';
  if (/^(\d)\1{5}$/.test(pin)) return 'PIN terlalu mudah ditebak (angka sama semua).';
  const d = [...pin].map(Number);
  const step = d[1]! - d[0]!;
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1]! === step)) return 'PIN terlalu mudah ditebak (angka berurutan).';
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d\d\d)\1$/.test(pin)) return 'PIN terlalu mudah ditebak (pola berulang).';
  return null;
}
