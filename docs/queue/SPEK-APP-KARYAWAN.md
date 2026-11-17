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

## Keputusan Louis (17 Nov 2026): mengalahkan usulan di atas bila berbeda
1. **Absen hanya di tablet POS**, bukan HP. Aplikasi hanya menampilkan rekap (telat, absen). **Lupa absen tidak bisa diajukan**: dihitung telat atau tidak masuk; **manajer bisa membuat pengecualian** (dihitung hadir tepat waktu, berizin, atau libur) dengan alasan wajib, tercatat atas nama manajer, payroll ikut. Layar: Pengecualian absen (manajer).
2. **Tukar shift**: rekan setuju dulu, baru manajer menyetujui.
3. **Cuti paling lambat H-2** (tanggal paling awal yang bisa dipilih = hari ini + 2). Cuti bersama tetap dari kalender usaha.
4. **Kasbon tanpa batas jumlah**, tetapi **tidak boleh dua kasbon aktif**: formulir terkunci selama masih ada kasbon berjalan. Disetujui wajib bukti transfer.
5. **Login**: awal pakai email dan sandi sendiri; ke depan cukup PIN 6 digit yang sama dengan di kasir.
6. **Notifikasi** lewat aplikasi dan juga WhatsApp (karyawan bisa mematikan salah satunya; nomor WA di profil). Pengiriman WA butuh penyedia (belum dipilih).
7. **Tugas harian dengan foto bukti** (dikerjakan bersama mitra): satu tim shift (mis. 3 orang opening) mengerjakan satu daftar tugas; status sama dan otomatis untuk semua anggota tim; setiap foto tercatat atas nama pengunggahnya dan manajer melihat siapa yang mengunggah di Laporan tugas. **Tutup kasir di POS baru bisa dilakukan setelah semua tugas (Closing, dan Opening) selesai**; manajer dapat membuka paksa dengan PIN dan alasan (usulan saya; tercatat di laporan).

Prototipe terbaru: 15 layar (Masuk, Beranda, Jadwal, Tugas tim, Tukar shift, Izin dan cuti, Slip gaji, Saya dan notifikasi, Rekap absensi, Kasbon, Persetujuan, Setujui kasbon + bukti TF, Pengecualian absen, Laporan tugas, POS tutup kasir terkunci).

## Dampak ke CG POS (kerjaan lanjutan, belum dibangun)
- Dashboard: pengelolaan daftar tugas per outlet dan shift; Laporan tugas (siapa mengunggah foto); pengaturan batas karyawan cuti per hari (opsional); penyedia WhatsApp.
- POS: tutup kasir memeriksa status tugas ke server (usulan bila offline: tetap terkunci kecuali buka paksa manajer); absen tetap di layar Absensi POS yang sudah ada.
- Server: tabel tugas (templat, instans per tim per hari, foto, pengunggah) dengan RLS per tim; gerbang di tutup kasir; tabel pengecualian absen yang dibaca payroll (pola EXCUSED yang sudah ada).

## Keputusan tambahan Louis (17 Nov 2026, sore)
- Sakit **tidak perlu surat dokter** (formulir izin/cuti/sakit tanpa lampiran wajib).
- Tugas yang tidak bisa dikerjakan **boleh ditandai "tidak bisa" dengan alasan**; dianggap selesai untuk gerbang Tutup kasir, dan alasannya terlihat di Laporan tugas.
- **WhatsApp tidak jadi**: notifikasi hanya di aplikasi (notifikasi dorong di HP). Tidak perlu penyedia WA dan tidak perlu menyimpan nomor WA.
- "Partner" pada tugas harian = **rekan satu tim shift**, bukan mitra bisnis luar. Jadi daftar tugas dan laporannya sepenuhnya di sistem kita (diatur manajer di dashboard).

## Keputusan tambahan Louis (17 Nov 2026, malam)
- **Daftar tugas Opening dan Closing diatur di backend (dashboard)** oleh manajer. Tiap tugas punya jenis: **Centang saja** (karyawan menandai sudah, atau silang/tidak bisa dengan alasan) atau **Wajib foto**. Tugas juga punya urutan, status wajib, dan aktif/nonaktif. Layar rancangan: Dashboard, Daftar tugas harian (nomor 16).
- **Batas cuti: maksimal 2 karyawan di hari yang sama.** Tanggal yang sudah terisi dua orang tidak bisa dipilih di aplikasi (tertulis "Penuh 2 dari 2"); manajer melihat jumlah terisi saat menyetujui. Batas bisa diatur di dashboard (bawaan 2).
- "Partner" = rekan satu tim; tidak ada pihak luar.

## Sketsa data tugas harian (untuk dibangun nanti)
- `task_templates` (org_id, outlet_id opsional, phase opening|closing, title, kind check|photo, required, allow_skip, sort, active)
- `task_runs` (outlet_id, shift/hari, phase) dibuat otomatis saat tim mulai; `task_items` (run_id, template_id, status pending|done|skipped, photo_path, done_by, done_at, skip_reason) dengan realtime supaya status sama untuk satu tim
- Gerbang Tutup kasir: fungsi `close_shift` (atau pemeriksaan di POS lewat RPC) menolak bila ada `task_items` wajib berstatus pending; `skipped` dengan alasan dianggap selesai; buka paksa manajer = catatan di log aktivitas.
- Batas cuti per hari: kolom pengaturan org (leave_max_per_day, bawaan 2) diperiksa saat mengajukan dan saat menyetujui.

## Tiga peran dan siapa memutuskan apa (Louis, 17 Nov 2026)
| Pengajuan | Diputuskan oleh |
|---|---|
| Kasbon (wajib bukti transfer) | **Owner** |
| Izin dan cuti | **Owner** (bukan manajer) |
| Tukar shift karyawan | Rekan setuju dulu, lalu **manajer** |
| Tukar shift manajer | Rekan setuju dulu, lalu **owner** (usulan; manajer juga boleh tukar shift) |
| Pengecualian absen, daftar tugas, laporan tugas | **Manajer** (owner juga bisa melihat) |
Manajer tetap melihat siapa saja yang cuti di jadwal tim (untuk batas 2 orang per hari), tetapi tidak menyetujuinya. Layar: Owner (Beranda pendapatan, Pendapatan, Persetujuan, Pantau).

## Kebutuhan owner (usulan; layar 17-20)
Prioritas tinggi:
- **Pendapatan real-time**: hari ini sampai sekarang vs hari yang sama pekan lalu, per outlet, jumlah transaksi, rata-rata per transaksi, penjualan belum dibayar, proyeksi akhir bulan. Data dari laporan penjualan yang sudah ada di dashboard.
- **Detail pendapatan**: hari/minggu/bulan, grafik, metode pembayaran, produk terlaris, jam ramai, diskon dan refund.
- **Persetujuan**: kasbon (dengan bukti transfer) dan izin cuti; riwayat keputusan.
- **Peringatan anti-curang** (dorong ke HP): void besar atau berulang, selisih kas saat tutup kasir, harga diubah kasir, diskon manual besar, refund, tutup kasir dibuka paksa, stok habis.
- **Pantau tim hari ini**: hadir, telat, progres tugas opening/closing.
Menengah:
- **Biaya tenaga kerja**: perkiraan payroll bulan ini dan persentase dari penjualan, kasbon beredar per orang, denda dan bonus.
- **Kas dan setoran**: kas di laci, setoran kemarin cocok atau tidak, rekonsiliasi non-tunai.
- **Stok kritis** dan **laba kasar** (butuh HPP yang sudah ada).
- **Laporan harian otomatis** (ringkasan malam hari) dan **target penjualan** bulanan dengan progres.
- Ganti outlet / lihat semua outlet; ekspor ringkasan.
Nanti: perbandingan antar outlet dan antar kasir, ulasan pelanggan, persetujuan pembelian barang (PO), persetujuan perubahan harga produk, absensi dan kinerja per orang, catatan pelanggaran.

## Pertanyaan yang masih terbuka
1. Tukar shift manajer: disetujui owner (usulan saya) atau cukup rekannya yang setuju?
2. Batas peringatan: void berapa rupiah dianggap besar, selisih kas berapa? (bisa diatur owner di dashboard)
3. Apakah owner perlu bisa mengubah sesuatu dari HP (mis. nonaktifkan produk, ubah harga), atau hanya melihat dan menyetujui?
4. Satu owner atau lebih (misalnya dua pemilik)? Jika lebih, cukup salah satu yang menyetujui?
5. Daftar tugas sama di semua outlet atau berbeda per outlet?
