# Goal — paritas Majoo untuk CG POS (Coffee Ground)

Catatan: aku (Claude) sudah cari, tidak ada skill/fitur bernama "Goal" yang baku di Claude atau di
Antigravity yang bisa aku pastikan bentuknya. Jadi ini dibuat sebagai dokumen goal standing — kamu
(Antigravity) baca ini begitu antrean docs/queue/A*.md kosong (tidak ada file tanpa STATUS), lalu PILIH
SENDIRI item berikutnya dari daftar di bawah tanpa menunggu Claude menulis file tugas baru satu-satu.
Tulis task kamu sendiri (ringkas, di PROGRESS.md atau file docs/queue/A<nomor-berikut>.md baru) sebelum
mulai kerja, supaya tetap tercatat "satu tugas = satu cabang = satu PR kecil" (AGENTS.md #6).

## Tujuan

Coffee Ground (café coworking milik Louis) perlu CG POS senyata mungkin menyamai Majoo — bukan sekadar
tampilan sama, tapi ALUR KERJA dan HASIL yang sama (AGENTS.md #7). Louis sudah menandai fitur mana yang
dia PERLU vs TIDAK PERLU dari daftar fitur Majoo; ringkasannya:

- **TIDAK PERLU (jangan dikerjakan sama sekali):** Reservasi / Appointment.
- **Ditunda, perlu keputusan Louis langsung (jangan dikerjakan tanpa tanya):** aktivasi DOKU/QRIS
  (bertentangan dengan AGENTS.md #4 — rahasia pembayaran); Aplikasi Owner native di HP (scope besar, belum
  diputuskan platform/pendekatannya).
- **PERLU, tapi butuh skema database baru (sedang/akan dikerjakan Claude, JANGAN disentuh Antigravity):**
  Hak Akses (skema sudah jadi, wiring DataLayer menyusul), Denah status meja 6-warna, Deposit, Komisi,
  Retur pembelian, Grup pelanggan/harga grosir/penjadwalan harga (tabelnya sudah ada, tinggal disambung),
  Produk fasilitas, Loyalty tier + bonus ulang tahun, perluasan kolom metode pembayaran, status kanal
  online, kepuasan pelanggan, kustom pelanggan + policy. Lihat docs/REQUESTS-FOR-CLAUDE.md untuk detail per
  item dan statusnya.
- **PERLU dan TIDAK butuh skema baru (ini bagianmu, Antigravity):** semua layar lain yang nav.ts tandai
  `built: true` tapi masih "partial" atau "pratinjau" di replica/features.csv PADAHAL DataLayer-nya sudah
  tersedia — ini isi utama A63 (docs/queue/A63.md). Kerjakan ini dulu sebelum mengarang tugas sendiri lain.

## Urutan kerja kalau antrean kosong

1. Cek A63 dulu — kalau belum STATUS: SELESAI, itu yang dikerjakan.
2. Kalau A63 sudah selesai: baca replica/features.csv, cari baris Perlu yang masih "no"/"partial" TANPA
   catatan "butuh skema baru", dan DataLayer method yang dibutuhkan sudah ada di data.ts. Pilih satu, tulis
   task singkat sendiri (format sama seperti A1-A63), kerjakan.
3. Kalau menemukan baris Perlu yang ternyata butuh data/method baru: JANGAN dikerjakan dengan data palsu.
   Tulis permintaannya di docs/REQUESTS-FOR-CLAUDE.md, lanjut ke item lain.
4. Kalau benar-benar tidak ada lagi yang bisa dikerjakan tanpa skema baru: berhenti, tulis di PROGRESS.md
   bahwa antrean non-database sudah habis dan menunggu Claude menyelesaikan skema (jangan menebak-nebak
   fitur DOKU/QRIS atau Aplikasi Owner — itu ditunda sampai Louis putuskan).

Aturan verifikasi, lingkup, dan larangan tetap ikut Prompt 0 / AGENTS.md seperti biasa.
