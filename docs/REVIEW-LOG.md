# Log siklus review (maksimal 3 baris per siklus)

Format: `<tanggal jam WIB> | main=<SHA 7 huruf> | <hasil singkat>`. Siklus tanpa perubahan cukup satu baris "idle".
Baris terakhir dipakai sebagai titik awal pembanding siklus berikutnya.

2026-11-12 | main=9e4fb49 | merge ag/a63-kelengkapan-ui (typecheck, 439 tes, build dashboard, lint-tailwind lulus); tidak ada status fitur berubah; antrean 0 tugas terbuka; goal 0/72
2026-11-12 | main=5d4427e | merge ag/a64-pos-void-refund (typecheck, 444 tes, build dashboard+pos, lint lulus); review: Laporan void di POS + Riwayat refund per transaksi => yes; antrean 0 terbuka
2026-11-12 | main=22e3b45 | migrasi 0031+0032 diterapkan ke produksi atas persetujuan Louis; 0033 menunggu
2026-11-12 | main=602fc08 | review: Buku besar pilih banyak akun => yes (bukti docs/evidence/buku-besar); catatan features.csv banyak yang basi, audit per fitur berlanjut
2026-11-12 | main=7cbb08d | review: Arus kas, Penjualan bersih dan piutang, Atur kolom => yes (bukti docs/evidence); goal 6/72
2026-11-12 | main=a0b0fc9 | audit: HPP rata-rata (laporan laba kotor per produk masih 'Segera') dan Akun perantara (jurnal shift nyata belum terbukti) tetap partial; Laporan hutang tetap partial (piutang per pelanggan belum ada); goal 6/72
2026-11-12 | main=fd200be | merge A65 dan A66 (typecheck, 452 tes, build dashboard+pos, lint lulus); review: Layar dapur + Layar Pilih Karyawan => yes; opname tetap partial (tanya .xlsx di MAJOO-VERIFICATION)
2026-11-12 | main=c31bdb8 | merge A67 (typecheck, 453 tes, build, lint lulus); review: Laporan hutang per pemasok dan piutang per pelanggan + Hutang dan piutang => yes; goal 10/72
2026-11-12 | main=2c9817c | merge A68 (typecheck, 456 tes, build dashboard+pos, lint lulus); review: Customer display eksternal => yes (diuji dua tab, sisi kasir dicek lewat kode); goal 11/72
2026-11-12 | main=84b7319 | merge A69 (typecheck, 457 tes, build, lint lulus); review: Daftar ekspor => yes (diuji ekspor, daftar, unduh ulang; riwayat per perangkat, pertanyaan server di MAJOO-VERIFICATION); goal 12/72
2026-11-12 | main=c2d3e72 | merge A70 (kind transfer pasca-0032; typecheck, 458 tes, build, lint lulus); tidak ada fitur Gelombang A yang berubah status (Pindah saldo bukan fitur Gelombang A); goal 12/72
2026-11-12 | main=1b16318 | merge A71 (typecheck, 459 tes, build dashboard+pos, lint lulus); ubah harga, stok habis, catatan tetap partial: penegakan server (sync_push) dan laporan harga diubah belum ada; goal 12/72
2026-11-12 | main=f3c9331 | merge A72 (typecheck, 461 tes, build, lint lulus); Batasi penjualan dan mutasi saat stok habis tetap partial: klien lengkap, penegakan server (stock_post, stock_transfer_create, sync_push) masih permintaan; goal 12/72
2026-11-12 | main=770a69e | merge ag/antrean-nondb-selesai (dokumen): Antigravity menyatakan antrean non-database Gelombang A habis; sisa butuh migrasi/DataLayer (Claude) dan keputusan Louis; goal 12/72
2026-11-12 | main=cf29d77 | migrasi 0033 diterapkan ke produksi atas persetujuan Louis; jawaban Majoo: opname butuh .xlsx dan ekspor disimpan di server (dicatat); goal 12/72
2026-11-12 | main=aeef24a | Postgres lokal siap: run.sh lulus dengan 0001-0033; goal 12/72
2026-11-12 | main=198c280 | 0034 diterapkan ke produksi atas persetujuan Louis; kode klien digabung; A73 ditulis; goal 12/72
2026-11-12 | main=6887d44 | absensi: 0035 dan 0036 diterapkan ke produksi atas persetujuan Louis; DataLayer absensi digabung; A76 dan A77 ditulis (diganti nomor karena A74 dipakai Antigravity); payroll belum; goal 12/72
2026-11-12 | main=d359dd5 | merge A73 dan A74 (typecheck, 481 tes, build dashboard+pos, lint; dependensi baru fflate diperiksa); review: Terapkan kupon dengan referensi + Stok opname impor Excel => yes; goal 14/72
2026-11-12 | main=d94e139 | merge A76 layar POS absensi (typecheck, 484 tes, build dashboard+pos, lint; PIN tidak disimpan, kamera dihentikan); Absensi dan payroll tetap no: laporan dashboard A77 dan payroll belum; goal 14/72
2026-11-12 | main=09707ef | merge A77 laporan absensi dashboard (typecheck, 487 tes, build, lint); diuji sendiri (tambah catatan, lama kerja benar, 390 px rapi); Absensi dan payroll no -> partial (payroll belum); goal 14/72
2026-11-12 | main=3b79b40 | payroll tahap 1 (fungsi hitung murni, 505 tes; publikasi disetujui Louis); absensi: payroll ikut lingkup; goal 14/72
2026-11-12 | main=9c09454 | payroll tahap 2: 0037 diterapkan ke produksi atas persetujuan Louis; tahap 3 DataLayer berikutnya; goal 14/72
2026-11-12 | main=2b90ffc | payroll tahap 3 (DataLayer, 516 tes); A80 dan A81 ditulis (diganti nomor karena A75 dan A78 dipakai Antigravity); goal 14/72
2026-11-12 | main=ad2d33a | merge A75 (produk xlsx), A78 (pengaturan stok), A77 STATUS, status non-DB (typecheck, 521 tes, build, lint); review: Impor dan ekspor produk => yes; Notifikasi stok dan Batasi penjualan tetap partial; tugas payroll dinomori ulang A80 dan A81; goal 15/72
2026-11-12 | main=19dade7 | listPriceChanges (DataLayer, 525 tes) + A82 ditulis; goal 15/72
2026-11-12 | main=0f559c3 | DataLayer peran kustom (0033; 531 tes) + A83 ditulis; goal 15/72
2026-11-12 | main=5c36743 | DataLayer listStockMovesBetween (533 tes) + A84 ditulis; antrean Antigravity A80 sampai A84 menunggu (4 kali tunggu tanpa cabang baru); goal 15/72
2026-11-12 | main=0c81ea2 | layar absensi POS ditulis ulang sesuai penjelasan Louis (kamera kiri wajib, nama, PIN, Clock in/out); 533 tes, build, lint; goal 15/72
2026-11-12 | main=a4fa73c | merge A80 (jadwal dan kasbon) dan A82 (laporan harga diubah) (typecheck, 539 tes, build, lint); review: Kasir boleh ubah harga jual => yes (batasan server dicatat); goal 16/72
2026-11-12 | main=04a156f | merge A83 hak akses ke server (typecheck, 543 tes, build, lint; localStorage hanya untuk sisa peran lama); Karyawan, peran, dan hak akses tetap partial: tautan karyawan ke peran kustom (employees.role_id) dan penegakan izin di RLS belum ada; goal 16/72
2026-11-12 | main=08fea7b | merge A81 payroll bulanan (typecheck, 544 tes, build, lint; memakai buildWorksheet); diuji sendiri alur payroll lengkap di 1280 dan 390; Absensi dan payroll karyawan => yes (batasan: Radius Absensi, uji Supabase nyata); goal 17/72
2026-11-12 | main=227dde6 | merge A84 laporan stok terbuang dan STATUS A81 (typecheck, 547 tes, build, lint); Stok terbuang sudah yes dan bukan Gelombang A (wave '-'): hitungan tujuan tidak berubah; goal 17/72
2026-11-12 | main=81a18db | DataLayer setEmployeeRoleId (548 tes) + A86 ditulis; daftar fitur Majoo untuk dipilih Louis diterbitkan (artifact); goal 17/72

## Review 12 Nov 2026 — merge ag/a86-peran-karyawan
Tinjau diff, `pnpm -r typecheck`, 578 tes shared, build dashboard, `lint-tailwind` bersih; screenshot 390 dan 1280 diperiksa (pilih peran kustom per karyawan, pemilik dinonaktifkan dengan keterangan, hitungan karyawan per peran naik jadi 2, peringatan hapus menyebut jumlah). Digabung. Status `Karyawan, peran, dan hak akses` TETAP partial: peran kustom belum membatasi akses di layar lain atau RLS (penegakan granular belum ada), jadi belum memenuhi paritas fungsi. Catatan kecil: screenshot 1280 menampilkan judul halaman tertutup bilah navigasi (artefak tangkapan, bukan galat).

## 13 Nov 2026 — tinjauan gelombang fase 2 (Claude)
- DIGABUNG: A86 (peran karyawan), A113 (kategori/mode kasir), A116 (split bill lanjut), A139 (grosir, jadwal harga, grup pelanggan + migrasi 0097; saya tambah 0098 untuk mencabut hak PUBLIC pada fungsinya). Typecheck, 593 tes shared, lint, tes SQL penuh lulus.
- DITOLAK / KEMBALI KE ANTIGRAVITY:
  - A142 (izin granular, 0103): memberi `select/update (qr_code)` ke `authenticated` sehingga kode QR karyawan (rahasia) terbaca klien dan merusak tes 15_client_rpcs; trigger `guard_granular_catalog` memblokir `custom_item_product` (tes 19_custom_item gagal). Perbaiki dan jalankan seluruh `packages/db/tests/run.sh`.
  - A114 (denah meja) dan A118 (struk lanjut): `lint-tailwind` GAGAL (nilai spasi/ukuran tak terdefinisi).
  - A115, A117, A119, A140, A141: konflik dengan main (TablePicker, index.ts, device-prefs, data/fake/supabase, cart/SplitBillDialog). Rebase pada main terbaru setelah gelombang ini.
- Migrasi 0044, 0097, 0098 sudah lolos tes SQL lokal tetapi BELUM diterapkan ke produksi (pemeriksa izin menolak; menunggu persetujuan Louis).
- Perbaikan tes: 19_local_date.sql membersihkan datanya (sebelumnya merusak 19_recurring_approvals).

## 13 Nov 2026 (siang) — tinjauan gelombang 2 (Claude)
- DIGABUNG: A122 (harga kasir dan izin), A115 (meja gabung/pisah). Typecheck, 600 tes shared, lint, build, tes SQL penuh lulus.
- KEMBALI KE ANTIGRAVITY:
  - A120 (ekstra bahan) dan A121 (produk layanan): `lint-tailwind` GAGAL (A120: nilai spasi tak terdefinisi; A121: awalan breakpoint tidak ada, pakai tablet:/laptop:/desktop:/wide:).
  - A145 (metode bayar server): migrasi 0109 memanggil `pos.touch()` yang tidak ada, jadi migrasi gagal dimuat. Pakai pola trigger yang sudah ada atau isi `updated_at` langsung.
  - A123 (info outlet): tes SQL `28_outlet_business_bank_group.sql` memakai pgTAP (`plan()`), yang tidak dipakai proyek ini; tulis ulang dengan pola `pg_temp.ok` seperti tes lain. Nama berkas juga harus `19_...` atau berurut dengan tes lain.
  - A143 dan A144: konflik di `packages/shared/src/data.ts` (sama-sama menambah metode); rebase pada main.
  - Masih konflik dengan main: A117, A119, A140, A141. Belum diperbaiki: A114, A118, A142, A87.
