// Struktur SDM (migrasi 0038): tingkat jabatan, organisasi, tipe karyawan, profil SDM, radius absensi, notifikasi karyawan.
// Fungsi murni (validasi) di sini; penyimpanan ada di DataLayer.

export interface JobLevel { id: string; name: string; rank: number }
export interface JobLevelInput { id?: string; name: string; rank?: number }
export interface OrgUnit { id: string; name: string; parentId?: string }
export interface OrgUnitInput { id?: string; name: string; parentId?: string | null }
export interface EmployeeType { id: string; name: string }
export interface EmployeeTypeInput { id?: string; name: string }
/** Profil SDM satu karyawan; kosong = belum diatur. */
export interface EmployeeHr { employeeId: string; jobLevelId?: string; orgUnitId?: string; employeeTypeId?: string }
export interface EmployeeHrInput { employeeId: string; jobLevelId: string | null; orgUnitId: string | null; employeeTypeId: string | null }

export type AttendanceRadiusMode = 'flag' | 'block';
/** Lokasi dan radius absensi satu outlet. Tanpa latitude/longitude/radiusM = radius tidak dipakai. */
export interface AttendanceSettings { outletId: string; latitude?: number; longitude?: number; radiusM?: number; mode: AttendanceRadiusMode; requirePhoto: boolean }
export interface AttendanceSettingsInput { outletId: string; latitude: number | null; longitude: number | null; radiusM: number | null; mode: AttendanceRadiusMode; requirePhoto: boolean }

/** employeeId kosong = untuk semua karyawan. */
export interface EmployeeNotification { id: string; employeeId?: string; employeeName?: string; title: string; body: string; createdAt: string }
export interface EmployeeNotificationInput { employeeId?: string | null; title: string; body: string }

export const HR_NAME_MAX = 60;
export const NOTIFICATION_TITLE_MAX = 80;
export const NOTIFICATION_BODY_MAX = 500;

/** Nama jabatan/unit/tipe: wajib, maksimal 60 huruf. */
export function hrNameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Nama wajib diisi.';
  if (n.length > HR_NAME_MAX) return `Nama maksimal ${HR_NAME_MAX} huruf.`;
  return null;
}

/** Nama sama (tanpa beda huruf besar/kecil dan spasi tepi) sudah dipakai item lain? */
export function hrNameTaken(name: string, others: { id: string; name: string }[], selfId?: string): boolean {
  const key = name.trim().toLowerCase();
  return others.some((o) => o.id !== selfId && o.name.trim().toLowerCase() === key);
}

export function jobLevelProblem(input: JobLevelInput): string | null {
  const p = hrNameProblem(input.name);
  if (p) return p;
  const rank = input.rank ?? 0;
  if (!Number.isInteger(rank) || rank < 0 || rank > 99) return 'Tingkat harus bilangan bulat 0 sampai 99.';
  return null;
}

/** Induk tidak boleh diri sendiri atau salah satu turunannya (akan membuat lingkaran). */
export function orgUnitProblem(input: OrgUnitInput, existing: OrgUnit[]): string | null {
  const p = hrNameProblem(input.name);
  if (p) return p;
  if (!input.parentId) return null;
  if (input.id && input.parentId === input.id) return 'Unit tidak boleh menjadi induk dirinya sendiri.';
  if (!existing.some((u) => u.id === input.parentId)) return 'Unit induk tidak ditemukan.';
  if (input.id) {
    const byId = new Map(existing.map((u) => [u.id, u]));
    for (let cur = byId.get(input.parentId), guard = 0; cur && guard < 100; cur = cur.parentId ? byId.get(cur.parentId) : undefined, guard++) {
      if (cur.id === input.id) return 'Unit induk tidak boleh salah satu turunan unit ini.';
    }
  }
  return null;
}

export function attendanceSettingsProblem(input: AttendanceSettingsInput): string | null {
  if (input.mode !== 'flag' && input.mode !== 'block') return 'Mode radius harus tandai atau blokir.';
  const { latitude: lat, longitude: lng, radiusM: r } = input;
  if ((lat === null) !== (lng === null)) return 'Lintang dan bujur harus diisi bersama.';
  if (lat !== null && lng !== null) {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'Lintang harus antara -90 dan 90.';
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return 'Bujur harus antara -180 dan 180.';
  }
  if (r !== null) {
    if (lat === null) return 'Radius butuh titik lokasi outlet.';
    if (!Number.isInteger(r) || r < 10 || r > 5000) return 'Radius harus bilangan bulat 10 sampai 5000 meter.';
  }
  return null;
}

export function notificationProblem(input: EmployeeNotificationInput): string | null {
  const title = input.title.trim();
  if (!title) return 'Judul wajib diisi.';
  if (title.length > NOTIFICATION_TITLE_MAX) return `Judul maksimal ${NOTIFICATION_TITLE_MAX} huruf.`;
  const body = input.body.trim();
  if (!body) return 'Isi pesan wajib diisi.';
  if (body.length > NOTIFICATION_BODY_MAX) return `Isi pesan maksimal ${NOTIFICATION_BODY_MAX} huruf.`;
  return null;
}

/** Jarak dua titik (meter, bulat), sama dengan pos._distance_m di server. Dipakai untuk pratinjau di layar pengaturan. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a))));
}
