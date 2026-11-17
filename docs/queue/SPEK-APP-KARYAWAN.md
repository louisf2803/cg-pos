# Spesifikasi: aplikasi HP karyawan CG POS (rancangan, 17 Nov 2026)

Aplikasi terpisah (dibuat Louis sendiri) untuk tim internal. Memakai server dan data yang sama dengan CG POS (Supabase, schema `pos`). Dokumen ini hanya rancangan; belum ada kode atau migrasi. Prototipe layar: artifact "Aplikasi Karyawan CG POS" (9 layar, karyawan dan manajer).

## Peran
- **Karyawan**: melihat dan mengajukan untuk dirinya sendiri.
- **Manajer** (peran manager/admin/owner yang sudah ada): semua yang dilihat karyawan, ditambah kotak Persetujuan dan tampilan tim. Satu aplikasi, menu mengikuti peran.

## Fitur dari Louis
| Fitur | Karyawan | Manajer |
|---|---|---|
| Gaji | Slip per bulan (rincian, status transfer, simpan PDF), sisa kasbon | - |
| Jadwal | Jadwal mingguan sendiri, status tiap hari (telat/libur/menunggu) | Jadwal tim |
| Absensi | Absen masuk/pulang (selfie + GPS dalam radius), rekap telat dan absen bulan ini, dampak ke gaji (perkiraan), riwayat | Rekap tim |
| Izin dan cuti | Ajukan cuti/izin/sakit (tanggal, alasan, lampiran), sisa jatah, riwayat status | Setujui/tolak + alasan |
| Tukar shift | Pilih shift sendiri + rekan yang bebas, alasan; rekan setuju dulu, lalu manajer | Setujui/tolak |
| Kasbon | Ajukan jumlah + cicilan + keperluan; lihat saldo dan bukti transfer | Setujui WAJIB unggah bukti transfer; atau tolak |

## Aturan otomatis (inti permintaan Louis)
1. **Tukar shift disetujui** -> jadwal KEDUA orang berubah; jam masuk acuan di absensi dan hitungan telat/absen ikut jadwal baru. Tidak ada ubah manual.
2. **Cuti disetujui** -> tanggalnya menjadi hari berizin (`EXCUSED`, bukan absen) dan memotong jatah tahunan sesuai aturan payroll; cuti bersama (0149) sudah mengikuti pola ini.
3. **Kasbon disetujui** -> wajib bukti transfer (foto + tanggal/jam transfer). Setelah itu saldo kasbon dan cicilan potong gaji otomatis di payroll (modul kasbon yang sudah ada).
4. **Penolakan** selalu dengan alasan, terlihat oleh karyawan.
5. Setiap perubahan status mengirim notifikasi ke pemohon (dan ke manajer untuk pengajuan baru).

## Pemeriksaan otomatis sebelum manajer memutuskan (usulan)
- Tukar shift: rekan bebas di hari itu, tidak lebih dari 6 hari kerja berturut-turut, tidak menambah lembur; rekan sudah setuju.
- Cuti: sisa jatah cukup, jumlah karyawan yang sudah cuti di hari itu (batas per outlet bisa diatur), tidak bentrok dengan tukar shift.
- Kasbon: total tidak melewati batas per karyawan (diatur manajer), tidak ada pengajuan lain yang menunggu.

## Sketsa data (tabel baru, semua `org_id`, RLS: karyawan hanya baris sendiri, manajer semua)
- `leave_requests` (employee_id, kind cuti|izin|sakit, from_date, to_date, reason, attachment_path, status pending|approved|rejected|cancelled, decided_by, decided_at, decision_note)
- `shift_swaps` (requester_id, partner_id, requester_date, partner_date, reason, partner_status, manager_status, decided_by, decision_note, applied_at)
- `cash_advance_requests` (employee_id, amount, installments, purpose, status, decided_by, decision_note, transfer_proof_path, transferred_at) -> saat disetujui membuat baris `cash_advances` yang sudah ada
- `attendance_corrections` (untuk ide lupa absen)
- RPC `decide_*` (security definer, hanya pengelola) yang melakukan efek otomatis di atas dalam satu transaksi dan idempoten.
- Bukti transfer dan lampiran: bucket storage privat per organisasi (pola `cash-photos`, 0141); karyawan hanya melihat miliknya.
- Login: akun Supabase per karyawan terhubung ke `employees` (butuh keputusan; PIN POS tetap untuk kasir). Ini belum ada.

## Ide fitur tambahan untuk tim internal (belum digambar di prototipe)
Prioritas tinggi (sering dibutuhkan): notifikasi dorong dan pengumuman; absen selfie + GPS yang menolak di luar radius (pengaturan radius sudah ada); koreksi absen untuk lupa absen; lembur (ajukan, setujui, masuk payroll); ketersediaan (tandai hari tidak bisa kerja agar jadwal tidak bentrok); catatan dan pelanggaran saya (baca saja) dengan tanda terima.
Menengah: ambil shift kosong / tawarkan shift ke rekan; tugas harian (checklist buka dan tutup outlet dengan foto bukti); dokumen dan SOP wajib baca (kontrak, pelatihan) dengan tanda sudah dibaca; reimburse biaya (foto nota); chat ke manajer atau grup shift; ganti PIN dan data rekening (disetujui manajer).
Nanti: penilaian kinerja dan umpan balik bulanan; insentif/target tim yang terlihat real-time (komisi sudah ada di dashboard); pengingat ulang tahun dan masa kerja; kalender tim.

## Pertanyaan terbuka untuk Louis
1. Tukar shift: apakah rekan harus setuju dulu (usulan) atau langsung ke manajer?
2. Cuti: batas karyawan yang boleh cuti di hari yang sama? Perlu surat dokter untuk sakit berapa hari?
3. Kasbon: batas maksimum per karyawan, dan apakah boleh dua kasbon aktif sekaligus?
4. Login karyawan: email+sandi sendiri, atau PIN yang sama dengan di kasir?
5. Absen: wajib selfie? Di luar radius diblokir (keputusan sebelumnya 12 Nov) atau hanya ditandai?
6. Notifikasi: lewat aplikasi saja, atau juga WhatsApp?
