import type { EmployeeNotification } from '@cgpos/shared';

/** Pesan untuk satu karyawan: yang ditujukan kepadanya dan yang untuk semua karyawan. Terbaru dulu. */
export function notificationsFor(list: readonly EmployeeNotification[], employeeId: string): EmployeeNotification[] {
  return list.filter((n) => !n.employeeId || n.employeeId === employeeId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** Jumlah pesan yang lebih baru dari waktu terakhir dibaca (kosong = semua belum dibaca). */
export function unreadCount(list: readonly EmployeeNotification[], seenAt: string | null): number {
  return seenAt ? list.filter((n) => n.createdAt > seenAt).length : list.length;
}

const key = (employeeId: string) => `cgpos_notif_seen_${employeeId}`;
export function readSeenAt(employeeId: string): string | null { try { return localStorage.getItem(key(employeeId)); } catch { return null; } }
export function writeSeenAt(employeeId: string, at: string) { try { localStorage.setItem(key(employeeId), at); } catch { /* penyimpanan boleh gagal */ } }
