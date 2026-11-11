# Pelacak verifikasi alur kerja vs Majoo asli

Dipakai oleh sesi terjadwal (lihat tugas terjadwal "CG POS — kejar paritas Majoo") untuk tahu area mana yang sudah/belum diverifikasi langsung ke `dashboard.majoo.id` (akun Coffee Ground milik Louis) atau dokumentasi publik Majoo, supaya tidak mengulang area yang sama tiap giliran. Update baris status begitu satu area selesai diverifikasi DAN temuannya sudah ditulis ke `docs/queue/A*.md` / `docs/REQUESTS-FOR-CLAUDE.md` / `docs/PROGRESS.md`.

Status: `belum` | `sedang` (sesi ini mengerjakan, lanjutkan) | `selesai-verifikasi` (temuan sudah ditulis, implementasi Antigravity/Claude masih bisa berjalan terpisah) | `terblokir` (butuh keputusan Louis, jangan dikerjakan sampai ada keputusan) | `butuh-skema` (butuh keputusan desain skema dari Claude dulu sebelum jadi tugas Antigravity)

| Area | Fitur queue terkait | Status | Catatan |
|---|---|---|---|
| Hak Akses — mode "Hak Akses Khusus" | A51 → perbaikan A61 | selesai-verifikasi | Wizard 4-langkah dicatat lengkap di A61.md. Implementasi Antigravity masih berjalan. |
| Hak Akses — 3 mode lain (Departemen/Jenis Order/Periode) | — | terblokir | Menunggu keputusan Louis apakah perlu dibangun (lihat REQUESTS-FOR-CLAUDE.md). Jangan tanya ulang tiap giliran — cukup cek sekali tiap beberapa hari apakah ada jawaban baru di chat/PROGRESS.md dari Louis. |
| Denah & Meja (dashboard) | A52 → perbaikan A62 | selesai-verifikasi | Dari dokumentasi publik (akun Louis terkunci Prime+). 2 celah ditulis di A62.md. |
| Status meja hidup di kasir (6 warna, dsb) + Pisah Item/Grup Meja | — | butuh-skema | Butuh Claude merancang field/entitas baru dulu (lihat REQUESTS-FOR-CLAUDE.md bagian "Status meja hidup"). Sesi terjadwal BOLEH mengerjakan rancangan skema ini sendiri (ini pekerjaan Claude, bukan Antigravity) kalau tidak ada pekerjaan lain yang lebih prioritas. |
| Deposit (pengaturan kebijakan) | A53 | selesai-verifikasi | `/deposit-setting` sudah diperiksa. Deposit Saldo vs Produk, masa berlaku, refund terpisah — sudah ditulis di REQUESTS-FOR-CLAUDE.md. |
| Deposit (katalog paket deposit, tempat paket dibuat) | A53 | belum | BELUM ditemukan di mana paket deposit dibuat di dashboard Majoo asli (dugaan: modul Produk, atau hanya dari POS). Perlu dicari lagi kalau ada waktu/akses. |
| Komisi | A54 | belum | Field "Komisi" sudah terlihat di beberapa tempat (Hak Akses Dashboard & POS modul Penjualan/Laporan) tapi alur pengaturan komisinya sendiri (skema komisi per produk/kasir, dsb) belum diverifikasi. |
| Retur & Faktur | A55 | belum | "Invoice" sudah terlihat sebagai fitur terpisah di Hak Akses, tapi alur retur barang/faktur pembelian belum diverifikasi. |
| Reservasi / Appointment | A56 | belum | Modul "Appointment" di Majoo asli tampak berorientasi klinik/medis (Tenaga Medis, Pasien, Satu Sehat) — perlu dicek apakah relevan untuk kafe/coworking, atau apakah "Reservasi" meja terpisah dari modul Appointment itu (ada menu "Reservasi" sendiri di sidebar Pengaturan yang terlihat sekilas S162). |
| Grup pelanggan & harga grosir | A57 | belum | Belum diverifikasi. |
| Fasilitas & Loyalty | A58 | belum | Belum diverifikasi. |
| Metode bayar nontunai & Order Online | A59 | belum | Modul "Order Online" sudah dipetakan sekilas (Pesanan, majoo Order, Marketplace, Food Order, Toko Supplies, KiosK) di S161 lewat Hak Akses, tapi alur kerja sebenarnya (bagaimana order online masuk, diproses, dibayar) belum diverifikasi langsung. |
| Kepuasan pelanggan & Gudang | A60 | belum | Belum diverifikasi. |

## Cara kerja sesi terjadwal memakai tabel ini
1. Baca tabel ini dulu.
2. Pilih SATU baris berstatus `belum` (urut dari atas), ATAU lanjutkan baris `sedang` kalau ada peninggalan sesi sebelumnya.
3. Set jadi `sedang` di awal sesi (commit kecil), kerjakan, lalu update jadi `selesai-verifikasi`/`butuh-skema`/`terblokir` sesuai hasil di akhir sesi (commit lagi).
4. JANGAN mengerjakan dua baris sekaligus dalam satu giliran — satu area per giliran supaya tetap bisa di-review dan di-rollback kalau salah.

## Perlu verifikasi Majoo — Stok opname (A66, 12 Nov 2026)
- Impor hitung fisik saat ini CSV (titik koma atau koma, BOM, pratinjau validasi). Apakah Majoo menerima berkas .xlsx langsung, atau cukup templat CSV? Bila harus .xlsx, fitur "Stok opname ... impor Excel" tetap partial.

## Perlu verifikasi Majoo — Daftar ekspor (A69, 12 Nov 2026)
- Riwayat ekspor kita tersimpan di peramban per perangkat (maks 50 berkas, 128 KB per berkas). Apakah Majoo menyimpan berkas ekspor di server sehingga bisa diambil dari perangkat lain? Bila ya, dibutuhkan penyimpanan server (permintaan ke Claude).
