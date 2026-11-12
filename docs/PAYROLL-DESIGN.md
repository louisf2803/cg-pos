# Rancangan Payroll CG POS (dari konsep Coffee Ground, 12 Nov 2026)

Sumber konsep: proyek Louis `D:\Program Develop\BackendCoffeeGround` (halaman `app/employee-management/payroll`, `payslips`, `cash-advance`, `incidents`, `leaves`; SQL `supabase_employee_management.sql`, `supabase_cash_advances.sql`, `supabase_employee_incident_logs.sql`, `supabase_employee_status_logs.sql`). Ini kode Louis sendiri, bukan Majoo, jadi aman dipakai sebagai acuan. Keputusan Louis (12 Nov 2026): payroll ikut lingkup Gelombang A fitur "Absensi dan payroll karyawan".

## Konsep yang ada di Coffee Ground
**Gaji bulanan per karyawan** (`payroll_records`, unik per karyawan + bulan + tahun, bisa dikunci): gaji pokok, uang makan, potongan BPJS, telat (jumlah, bonus, denda), absen (jumlah, denda), kesalahan operasional (jumlah, denda), denda stock opname, insentif stokan, insentif deep cleaning, komisi, potongan kasbon, gaji bersih, status.
**Rumus gaji bersih:** `gaji pokok + uang makan - BPJS + bonus telat - denda telat - denda absen - denda salah operasional + insentif stokan + insentif deep cleaning - denda stock opname - potongan kasbon + komisi`.
**Catatan harian (insiden)** (`employee_incident_logs`): tanggal, jenis `LATENESS | ABSENCE | OPERATIONAL_MISTAKE`, jumlah, catatan. Dijumlah per bulan untuk dasar rumus.
**Kasbon** (`cash_advances`): jenis `BORROW` (pinjam), `PAYMENT_TRANSFER` (bayar transfer), `PAYMENT_PAYROLL` (dipotong gaji); saldo = pinjam - bayar; cicilan per bulan per karyawan (`cash_advance_installment`) menjadi potongan otomatis, tidak boleh melebihi saldo.
**Slip gaji** (`payslips`): tampilan satu karyawan per bulan untuk dicetak.
**Status karyawan** (probasi, tetap, admin) dengan tanggal berlaku (`employee_status_logs`); probasi dan admin tidak kena bonus/denda.

## Aturan khusus Coffee Ground (angka tertanam di kode mereka)
- Telat: 0 kali = bonus Rp 50.000; 1 sampai 3 kali dimaafkan; 4 kali atau lebih = Rp 15.000 x jumlah telat.
- Salah operasional: denda bertingkat, kesalahan ke-i = Rp 10.000 + (i-1) x Rp 4.000.
- Absen: kuota 12 hari per tahun; kelebihan kuota Rp 50.000 per hari (kuota dihitung dari absen bulan-bulan sebelumnya di tahun yang sama).
- Denda stock opname: satu angka global per bulan, dibagi rata ke karyawan yang berlaku.
- Komisi: angka global per bulan.
- Insentif stokan dan deep cleaning: kotak centang per karyawan per bulan.
- Probasi dan admin: tanpa bonus dan denda; admin tanpa gaji pokok di payroll.

## Catatan keamanan dari kode lama (JANGAN disalin)
Kebijakan RLS mereka `USING (true)` untuk semua pengguna (siapa pun bisa baca/tulis gaji). Di CG POS payroll wajib hanya untuk pemilik/manajer (`pos.can_manage`) dan tidak terbaca oleh akun perangkat atau kasir.

## Keputusan Louis (12 Nov 2026)
1. Payroll ikut lingkup Gelombang A ("Absensi dan payroll karyawan" baru `yes` bila payroll ada).
2. **Aturan bisa diatur per org**, nilai bawaan = Coffee Ground (`COFFEE_GROUND_PAYROLL_RULES`).
3. **Telat dan absen otomatis dari absensi**: dihitung dari clock in (jam lokal outlet) terhadap **jadwal kerja** karyawan (hari kerja + jam mulai shift) dengan toleransi menit. Absen = hari terjadwal yang sudah lewat tanpa clock in dan tidak diizinkan (cuti/izin/libur). Catatan harian manual tetap ada untuk kesalahan operasional dan untuk menandai hari diizinkan.

## Tahap pengerjaan (satu PR per tahap)
- **Tahap 1 (selesai, tanpa database):** `packages/shared/src/payroll.ts` + `payroll.test.ts`: rumus gaji bersih, aturan, kasbon, jadwal, dan `deriveAttendance` (telat/absen otomatis). 505 tes lulus.
- **Tahap 2 (skema, Claude, perlu persetujuan Louis):** migrasi 0037: `employee_compensation`, `employee_schedules`, `payroll_rules`, `employee_incidents` (kesalahan operasional + hari diizinkan), `cash_advances`, `payroll_records` (+ kunci periode). RLS hanya `pos.can_manage`; tidak terbaca akun perangkat/kasir. Tes SQL lokal.
- **Tahap 3 (DataLayer):** metode di `data.ts`, `supabase.ts`, `fake.ts` + tes.
- **Tahap 4 (UI, Antigravity):** `/karyawan/jadwal` (jadwal kerja), `/karyawan/payroll` (gaji bulanan, kunci periode), catatan harian, kasbon, slip gaji cetak, pengaturan aturan payroll.

## Pertanyaan terbuka (jangan menebak)
- Cuti: Coffee Ground punya halaman `leaves`. Apakah cuti/izin perlu fitur sendiri sekarang, atau cukup "hari diizinkan" di catatan harian?
- Probasi dan admin: status berasal dari `employees.role` + tanggal berlaku (seperti `employee_status_logs`) atau satu kolom status per karyawan?
- Komisi per orang: angka global dibagi sama rata (seperti Coffee Ground) atau memakai laporan Komisi per kasir yang sudah ada di CG POS (A54)?
