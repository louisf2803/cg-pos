import type { Customer, CustomerInput } from './types';

/** Nomor telepon disimpan hanya angka (dan + di depan): "0812-3456 789" -> "08123456789". */
export function normalizePhone(s: string): string {
  const t = s.trim();
  return (t.startsWith('+') ? '+' : '') + t.replace(/\D/g, '');
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Alasan data pelanggan tidak sah, atau null. `today` (YYYY-MM-DD) hanya untuk menolak tanggal lahir di masa depan. */
export function customerProblem(i: CustomerInput, today = new Date().toISOString().slice(0, 10)): string | null {
  const name = i.name.trim();
  if (!name) return 'Nama pelanggan wajib diisi.';
  if (name.length > 80) return 'Nama pelanggan maksimal 80 huruf.';
  if (i.phone?.trim()) {
    const digits = normalizePhone(i.phone).replace('+', '');
    if (digits.length < 8 || digits.length > 15) return 'Nomor telepon harus 8 sampai 15 angka.';
  }
  if (i.email?.trim() && !EMAIL.test(i.email.trim())) return 'Format email tidak valid.';
  if (i.birthDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.birthDate) || Number.isNaN(Date.parse(i.birthDate))) return 'Tanggal lahir tidak valid.';
    if (i.birthDate > today || i.birthDate < '1900-01-01') return 'Tanggal lahir tidak masuk akal.';
  }
  return null;
}

/** Cocok bila nama, nomor telepon, atau kode memuat teks pencarian (nomor dicocokkan tanpa tanda baca). */
export function customerMatches(c: Pick<Customer, 'name' | 'phone' | 'code'>, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const digits = s.replace(/\D/g, '');
  return c.name.toLowerCase().includes(s) || (c.code ?? '').toLowerCase().includes(s) || (digits.length >= 3 && (c.phone ?? '').includes(digits));
}

/** Hapus karakter yang punya arti khusus di filter pencarian PostgREST. */
export const searchTerm = (q: string) => q.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim();
