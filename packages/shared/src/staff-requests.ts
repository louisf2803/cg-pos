/**
 * Pengajuan di aplikasi HP karyawan (migrasi 0154): cuti/izin/sakit, kasbon, tukar shift. Aturan (keputusan Louis):
 * cuti H-2, maksimal 2 orang cuti per hari, disetujui pemilik; kasbon satu aktif, disetujui pemilik dengan bukti transfer;
 * tukar shift: rekan setuju lalu manajer (bila pengaju manajer, cukup rekan).
 */
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveKind = 'leave' | 'sick' | 'permit';
export type SwapStatus = 'pending_partner' | 'pending_manager' | 'approved' | 'rejected' | 'cancelled';

export const LEAVE_KIND_LABEL: Record<LeaveKind, string> = { leave: 'Cuti', sick: 'Sakit', permit: 'Izin' };
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak', cancelled: 'Dibatalkan' };
export const SWAP_STATUS_LABEL: Record<SwapStatus, string> = { pending_partner: 'Menunggu rekan', pending_manager: 'Menunggu manajer', approved: 'Disetujui', rejected: 'Ditolak', cancelled: 'Dibatalkan' };
export const LEAVE_MAX_DAYS = 14;
export const LEAVE_MAX_PER_DAY = 2;

export interface LeaveRequestRow { id: string; employeeId: string; employeeName: string; kind: LeaveKind; startDate: string; endDate: string; reason: string; status: RequestStatus; note?: string; createdAt: string }
export interface AdvanceRequestRow { id: string; employeeId: string; employeeName: string; amount: number; reason: string; status: RequestStatus; proofPath?: string; note?: string; createdAt: string }
export interface SwapRequestRow { id: string; requesterId: string; requesterName: string; partnerId: string; partnerName: string; requesterDate: string; partnerDate: string; reason?: string; status: SwapStatus; note?: string; createdAt: string }
export interface StaffRequests { leave: LeaveRequestRow[]; advances: AdvanceRequestRow[]; swaps: SwapRequestRow[]; teammates: { id: string; name: string }[] }
export interface StaffScheduleDay { date: string; startTime: string | null; swapped: boolean }

const addDays = (d: string, n: number): string => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/** Tanggal paling awal yang boleh dipilih: cuti/izin H-2, sakit mulai kemarin. */
export function leaveEarliestStart(kind: LeaveKind, today: string): string { return kind === 'sick' ? addDays(today, -1) : addDays(today, 2); }

/** Pesan masalah bila pengajuan cuti tidak memenuhi aturan bentuk (batas 2 orang dicek server); null bila lolos. */
export function leaveProblem(i: { kind: LeaveKind; start: string; end: string; reason: string; today: string }): string | null {
  if (!i.reason.trim()) return 'Alasan wajib diisi.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.start) || !/^\d{4}-\d{2}-\d{2}$/.test(i.end)) return 'Tanggal tidak valid.';
  if (i.end < i.start) return 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
  if (addDays(i.start, LEAVE_MAX_DAYS) <= i.end) return `Maksimal ${LEAVE_MAX_DAYS} hari per pengajuan.`;
  if (i.kind === 'sick') return i.start < addDays(i.today, -1) || i.start > addDays(i.today, 1) ? 'Sakit hanya untuk kemarin sampai besok.' : null;
  return i.start < leaveEarliestStart(i.kind, i.today) ? 'Cuti dan izin diajukan paling lambat 2 hari sebelumnya.' : null;
}

/** Terjemahkan pesan galat server menjadi kalimat Bahasa Indonesia. */
export function requestErrorMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('lead time')) return 'Cuti dan izin diajukan paling lambat 2 hari sebelumnya.';
  if (m.includes('day full')) return 'Sudah ada 2 orang yang cuti di salah satu hari itu. Pilih tanggal lain.';
  if (m.includes('overlap')) return 'Tanggal itu bertumpuk dengan pengajuanmu yang lain.';
  if (m.includes('sick date window')) return 'Sakit hanya untuk kemarin sampai besok.';
  if (m.includes('pending exists')) return 'Masih ada pengajuan kasbonmu yang menunggu.';
  if (m.includes('active advance')) return 'Kasbon sebelumnya belum lunas. Hanya boleh satu kasbon aktif.';
  if (m.includes('proof required')) return 'Unggah bukti transfer dulu sebelum menyetujui kasbon.';
  if (m.includes('already decided')) return 'Pengajuan ini sudah diputuskan.';
  if (m.includes('not allowed')) return 'Kamu tidak berhak memutuskan pengajuan ini.';
  if (m.includes('own swap')) return 'Tukar shift milikmu sendiri tidak bisa kamu setujui.';
  if (m.includes('requester not scheduled')) return 'Kamu tidak punya jadwal kerja pada tanggal yang kamu serahkan.';
  if (m.includes('partner not scheduled')) return 'Rekan tidak punya jadwal kerja pada tanggal yang kamu ambil.';
  if (m.includes('schedule conflict')) return 'Jadwal bentrok: salah satu sudah bekerja di tanggal tujuan.';
  if (m.includes('past date')) return 'Tanggal tukar shift tidak boleh sudah lewat.';
  if (m.includes('invalid amount')) return 'Nominal kasbon harus bilangan bulat lebih dari nol.';
  if (m.includes('reason required')) return 'Alasan wajib diisi.';
  return raw;
}
