# Goal — paritas Majoo untuk CG POS (Coffee Ground)

Diperbarui 11 Nov 2026 malam atas arahan Louis. Dokumen goal standing: begitu antrean `docs/queue/A*.md` kosong (tidak ada file tanpa
baris `STATUS`), baca ini lalu PILIH SENDIRI item berikutnya tanpa menunggu Claude menulis file tugas satu-satu. Tulis task ringkasmu sendiri
(format sama seperti A1-A63) sebelum mulai kerja, supaya tetap satu tugas = satu cabang = satu PR kecil (AGENTS.md #6).

## Tujuan dan definisi selesai
CG POS senyata mungkin menyamai Majoo: ALUR KERJA dan HASIL yang sama, bukan sekadar tampilan (AGENTS.md #7).
**Proyek dianggap selesai ketika semua fitur "Gelombang A" selesai** (bukan skor paritas 90%). Daftar lengkap: `docs/SCOPE.md`.
Klasifikasi tiap fitur ada di `docs/wave.csv` (A = wajib, B = antarmuka saja, X = dibuang); statusnya ada di `docs/features.csv`.
Hanya Claude (reviewer) yang mengubah kedua berkas itu dan menyatakan sebuah fitur selesai. **Jangan ubah `docs/features.csv`, `docs/wave.csv`,
atau `docs/bugs.md`.** Laporkan hasil kerjamu di `docs/PROGRESS.md` (ringkas) seperti biasa; Claude yang memindahkannya ke berkas status.
(Salinan lama `replica/features.csv` di komputer Louis tidak lagi dipakai.)

## Lingkup
- **Gelombang A (wajib, bisa dicek di laptop dan HP):** semua fitur PERLU yang tidak bergantung pada perangkat atau layanan luar.
- **PEMBARUAN 12 Nov 2026 (keputusan Louis, menimpa dua butir di bawah):** lingkup sekarang mengikuti `docs/wave.csv` (95 fitur Gelombang A) dan `docs/KEPUTUSAN-FITUR-2026-11-12.md`. Fitur yang dulu "dibuang" tetapi kini Gelombang A (gabung meja, denah kustom, reservasi, produksi stok, pemetaan harga beli, server lokal, dst.) BOLEH dikerjakan; yang kini X (mode SKU, saldo deposit sebagai alat bayar, aplikasi owner, consumer app, menu WhatsApp) JANGAN. DOKU/QRIS tetap dilarang (AGENTS.md #4) sampai Louis mencabutnya.
- **Gelombang B (antarmuka dan model data saja):** cetak ke printer (Bluetooth/jaringan), kirim struk digital (WhatsApp/email/SMS), mode offline,
  seluruh alur DOKU/QRIS (QR dinamis, RRN, status, notifikasi, refund QRIS), integrasi nyata marketplace/antar makanan, aplikasi owner native, scan barcode kamera.
  Jangan memanggil layanan nyata dan jangan mengaktifkan DOKU (AGENTS.md #4).
- **Dibuang, JANGAN dikerjakan:** Reservasi/Appointment dan semua turunannya (mode reservasi, jasa, buku menu, produk fasilitas); Custom amount; nomor antrean;
  batch order; orientasi tablet/ponsel; mode jasa dengan formulir; gabung/pisah meja lanjutan, batas waktu duduk, denah kustom drag; e-wallet langsung;
  sinkronisasi manual/total, wajib sinkron 14 hari, server lokal; email laporan harian; produksi stok, nomor batch/kedaluwarsa/serial, pemetaan harga beli, laporan stok kedaluwarsa.
  (Rincian di bagian DIBUANG pada `docs/SCOPE.md`. Beberapa layar yang sudah terlanjur dibangun, mis. denah kustom A52 dan appointment A56, dibiarkan; jangan diperluas.)
- **Keputusan produk yang berlaku:**
  - Dapur: tidak ada "kirim ke dapur" manual. Tiap menu punya tujuan (dapur, bar, atau tidak dikirim) yang diatur di backend dan diteruskan otomatis saat dipesan/dibayar;
    bisa tampil di layar TV (kitchen display) atau dicetak; ada mode cetak (otomatis atau tidak) dan struktur tiket yang bisa diedit.
  - Stok boleh minus; pembatasan stok hanya pengaturan opsional, bawaan mati. PB1 opsional (on/off, tarif bisa diubah, bawaan tidak dikenakan).
  - Aplikasi owner = tampilan web responsif untuk HP; aplikasi pelanggan (self-order) = web, dikerjakan paling akhir.

## Pembagian pekerjaan
- **Claude (JANGAN disentuh Antigravity):** semua yang butuh skema/migrasi/DataLayer baru, mis. Hak Akses di server, denah status meja 6-warna, Deposit, Komisi, Retur pembelian,
  grup pelanggan/harga grosir/penjadwalan harga (wiring ke kasir), Produk fasilitas, Loyalty tier, metode pembayaran, status kanal online, kepuasan pelanggan, kustom pelanggan.
  Detail dan status per item: `docs/REQUESTS-FOR-CLAUDE.md`. Migrasi ke produksi menunggu persetujuan Louis (saat ini ditunda).
- **Antigravity:** semua layar yang DataLayer-nya sudah tersedia, dan tindak lanjut fitur "Pratinjau" begitu Claude menyiapkan skemanya.

## Urutan kerja kalau antrean kosong
1. Cek A63 dulu. Bila belum `STATUS: SELESAI`, itu yang dikerjakan.
2. Baca `docs/wave.csv` (baris `A`) dan `docs/features.csv` (kolom `clone` = `partial`/`no`). Pilih satu baris tanpa catatan "butuh skema baru" dan yang method DataLayer-nya sudah ada di
   `packages/shared/src/data.ts` (cek satu-satu, jangan asumsi). Urutan modul: Produk & Katalog, Pajak/Outlet/Karyawan, Kasir & POS, Meja & Dapur,
   Pembayaran/Void/Promo, Pelanggan/CRM/Deposit, Inventori, Keuangan, HR, Laporan, lalu Dashboard/Order Online/layar tambahan/self-order web.
   Hormati kolom `lingkup` (batas yang dipangkas). Tulis task singkat sendiri, kerjakan.
3. Menemukan baris yang butuh data/method baru: JANGAN dikerjakan dengan data palsu. Tulis permintaannya di `docs/REQUESTS-FOR-CLAUDE.md`, lanjut ke baris lain.
4. Tidak ada lagi yang bisa dikerjakan tanpa skema baru: berhenti, tulis di `docs/PROGRESS.md` bahwa antrean non-database habis dan menunggu Claude/persetujuan Louis.
   Jangan menebak fitur DOKU/QRIS atau aplikasi owner native.

Aturan verifikasi, lingkup, dan larangan tetap ikut Prompt 0 dan `AGENTS.md`.
