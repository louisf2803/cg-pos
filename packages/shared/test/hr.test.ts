import { describe, expect, it } from 'vitest';
import { attendanceSettingsProblem, createFakeData, DataError, distanceMeters, hrNameProblem, hrNameTaken, jobLevelProblem, notificationProblem, orgUnitProblem, type OrgUnit } from '../src';

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof DataError ? e.code : 'galat'));

describe('validasi struktur SDM', () => {
  it('nama wajib, maksimal 60, ganda tanpa beda huruf/spasi', () => {
    expect(hrNameProblem('  ')).toMatch(/wajib/i);
    expect(hrNameProblem('x'.repeat(61))).toMatch(/60/);
    expect(hrNameProblem('Barista')).toBeNull();
    expect(hrNameTaken('  barista ', [{ id: 'a', name: 'Barista' }])).toBe(true);
    expect(hrNameTaken('Barista', [{ id: 'a', name: 'Barista' }], 'a')).toBe(false);
  });
  it('tingkat jabatan 0..99 bulat', () => {
    expect(jobLevelProblem({ name: 'Supervisor', rank: 5 })).toBeNull();
    expect(jobLevelProblem({ name: 'Supervisor', rank: 100 })).toMatch(/0 sampai 99/);
    expect(jobLevelProblem({ name: 'Supervisor', rank: 1.5 })).toMatch(/bulat/);
  });
  it('unit organisasi: induk harus ada dan tidak boleh membentuk lingkaran', () => {
    const units: OrgUnit[] = [{ id: 'a', name: 'Dapur' }, { id: 'b', name: 'Bar', parentId: 'a' }, { id: 'c', name: 'Es', parentId: 'b' }];
    expect(orgUnitProblem({ name: 'Baru', parentId: 'a' }, units)).toBeNull();
    expect(orgUnitProblem({ id: 'a', name: 'Dapur', parentId: 'a' }, units)).toMatch(/dirinya/);
    expect(orgUnitProblem({ id: 'a', name: 'Dapur', parentId: 'c' }, units)).toMatch(/turunan/);
    expect(orgUnitProblem({ name: 'Baru', parentId: 'zzz' }, units)).toMatch(/tidak ditemukan/);
  });
  it('pengaturan radius: titik berpasangan, rentang, radius butuh titik', () => {
    const base = { outletId: 'o', mode: 'block' as const, requirePhoto: true };
    expect(attendanceSettingsProblem({ ...base, latitude: -6.2, longitude: 106.8, radiusM: 100 })).toBeNull();
    expect(attendanceSettingsProblem({ ...base, latitude: null, longitude: null, radiusM: null })).toBeNull();
    expect(attendanceSettingsProblem({ ...base, latitude: -6.2, longitude: null, radiusM: null })).toMatch(/bersama/);
    expect(attendanceSettingsProblem({ ...base, latitude: 91, longitude: 0, radiusM: null })).toMatch(/Lintang/);
    expect(attendanceSettingsProblem({ ...base, latitude: 0, longitude: 181, radiusM: null })).toMatch(/Bujur/);
    expect(attendanceSettingsProblem({ ...base, latitude: null, longitude: null, radiusM: 100 })).toMatch(/titik lokasi/);
    expect(attendanceSettingsProblem({ ...base, latitude: 0, longitude: 0, radiusM: 5 })).toMatch(/10 sampai 5000/);
    expect(attendanceSettingsProblem({ ...base, mode: 'lain' as never, latitude: 0, longitude: 0, radiusM: 50 })).toMatch(/Mode/);
  });
  it('notifikasi: judul dan isi wajib dengan batas panjang', () => {
    expect(notificationProblem({ title: 'Rapat', body: 'Senin 09.00' })).toBeNull();
    expect(notificationProblem({ title: ' ', body: 'x' })).toMatch(/Judul/);
    expect(notificationProblem({ title: 'x', body: '' })).toMatch(/Isi/);
    expect(notificationProblem({ title: 'x'.repeat(81), body: 'x' })).toMatch(/80/);
    expect(notificationProblem({ title: 'x', body: 'x'.repeat(501) })).toMatch(/500/);
  });
  it('jarak sama dengan hitungan server (sekitar 1,11 km per 0,01 derajat lintang)', () => {
    expect(distanceMeters(-6.2, 106.8, -6.2, 106.8)).toBe(0);
    expect(distanceMeters(-6.2, 106.8, -6.21, 106.8)).toBeGreaterThanOrEqual(1100);
    expect(distanceMeters(-6.2, 106.8, -6.21, 106.8)).toBeLessThanOrEqual(1120);
    const near = distanceMeters(-6.2, 106.8, -6.2003, 106.8);
    expect(near).toBeGreaterThanOrEqual(25);
    expect(near).toBeLessThanOrEqual(40);
  });
});

describe('struktur SDM di data demo', () => {
  it('jabatan, unit, tipe: simpan, ubah, nama ganda ditolak, hapus melepas tautan karyawan', async () => {
    const d = createFakeData();
    const jl = await d.saveJobLevel({ name: 'Supervisor', rank: 5 });
    expect(await code(d.saveJobLevel({ name: ' supervisor ' }))).toBe('invalid');
    expect(await code(d.saveJobLevel({ id: 'tidak-ada', name: 'X' }))).toBe('not_found');
    const ou = await d.saveOrgUnit({ name: 'Dapur' });
    const child = await d.saveOrgUnit({ name: 'Bar', parentId: ou.id });
    expect(await code(d.saveOrgUnit({ id: ou.id, name: 'Dapur', parentId: child.id }))).toBe('invalid');
    const et = await d.saveEmployeeType({ name: 'Paruh waktu' });
    const hr = await d.saveEmployeeHr({ employeeId: 'e-sari', jobLevelId: jl.id, orgUnitId: ou.id, employeeTypeId: et.id });
    expect(hr).toMatchObject({ employeeId: 'e-sari', jobLevelId: jl.id, orgUnitId: ou.id, employeeTypeId: et.id });
    expect(await code(d.saveEmployeeHr({ employeeId: 'tidak-ada', jobLevelId: null, orgUnitId: null, employeeTypeId: null }))).toBe('not_found');
    expect(await code(d.saveEmployeeHr({ employeeId: 'e-sari', jobLevelId: 'x', orgUnitId: null, employeeTypeId: null }))).toBe('not_found');
    await d.deleteJobLevel(jl.id);
    await d.deleteOrgUnit(ou.id);
    await d.deleteEmployeeType(et.id);
    expect(await d.listEmployeeHr()).toEqual([{ employeeId: 'e-sari' }]);
    expect((await d.listOrgUnits()).find((u) => u.id === child.id)!.parentId).toBeUndefined();
    expect(await code(d.deleteJobLevel(jl.id))).toBe('not_found');
  });
  it('pengaturan radius dan notifikasi', async () => {
    const d = createFakeData();
    const s = await d.saveAttendanceSettings({ outletId: 'o1', latitude: -6.2, longitude: 106.8, radiusM: 100, mode: 'block', requirePhoto: true });
    expect(s).toMatchObject({ outletId: 'o1', radiusM: 100, mode: 'block' });
    await d.saveAttendanceSettings({ outletId: 'o1', latitude: null, longitude: null, radiusM: null, mode: 'flag', requirePhoto: false });
    expect(await d.listAttendanceSettings()).toEqual([{ outletId: 'o1', mode: 'flag', requirePhoto: false }]);
    expect(await code(d.saveAttendanceSettings({ outletId: 'o1', latitude: 0, longitude: 0, radiusM: 1, mode: 'block', requirePhoto: true }))).toBe('invalid');
    const all = await d.sendNotification({ title: 'Rapat', body: 'Senin 09.00' });
    const one = await d.sendNotification({ employeeId: 'e-sari', title: 'Jadwal', body: 'Shift berubah' });
    expect(one.employeeName).toBeTruthy();
    expect(await code(d.sendNotification({ employeeId: 'tidak-ada', title: 'x', body: 'y' }))).toBe('not_found');
    expect((await d.listNotifications()).map((n) => n.id).sort()).toEqual([all.id, one.id].sort());
    await d.deleteNotification(all.id);
    expect(await d.listNotifications()).toHaveLength(1);
    expect(await code(d.deleteNotification(all.id))).toBe('not_found');
  });
});
