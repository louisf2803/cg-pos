# CG POS — SCOPE (sumber kebenaran lingkup fitur)

Simpan di repo sebagai `docs/SCOPE.md`. File ini diturunkan dari keputusan checklist paritas CG POS vs Majoo (PERLU / TIDAK PERLU), dengan konflik internal sudah diselesaikan: **keputusan TIDAK PERLU menang**, dan dapur memakai routing otomatis per menu.

Catatan penamaan: **Gelombang A / B** = kelompok fitur di dokumen ini. **A51, A52, ...** = nomor urut tugas di `docs/queue/` (tidak berhubungan dengan Gelombang A).

## Definisi selesai

Proyek dianggap selesai ketika **semua fitur Gelombang A berstatus `done`**. Satu fitur `done` hanya jika:

1. Alur kerjanya sama dengan Majoo (langkah yang sama, data hasil yang sama), bukan sekadar tampilan mirip.
2. Tidak ada mode "preview" atau placeholder permanen.
3. Ada bukti screenshot laptop (1280 px) dan HP (390 px) di `docs/shots/<id>/` (atau `docs/evidence/<id>/`), dicatat di kolom `evidence` pada `docs/wave.csv`.
4. Tidak ada bug S1/S2 terbuka untuk fitur itu.

Gelombang B tidak masuk syarat selesai (tidak dihitung `scripts/goal-check.mjs`). Untuk Gelombang B, bangun antarmuka dan model datanya saja, tanpa memanggil layanan atau perangkat nyata.

Berkas pendukung: `docs/features.csv` (status per fitur; kolom `clone` = `yes` berarti selesai, hanya reviewer yang mengubahnya), `docs/wave.csv` (gelombang A/B/X per fitur, lingkup yang dipangkas, dan bukti), `docs/bugs.md`, `docs/CYCLE.md`.

---

## GELOMBANG A — wajib, bisa diverifikasi di web (laptop dan HP)

Urutan modul yang disarankan (dari fondasi ke turunan):
1 Produk & Katalog → 2 Pajak, Outlet, Karyawan & Hak Akses → 3 Kasir & POS → 4 Meja & Dapur → 5 Pembayaran, Void & Refund, Promo → 6 Pelanggan, CRM, Deposit → 7 Inventori → 8 Keuangan → 9 HR → 10 Laporan & Analisa → 11 Dashboard, Order Online, Layar Pelanggan, Owner, Self-order web.

### 1. Produk & Katalog
- Produk ekstra (modifier): grup wajib atau opsional, pilih satu atau banyak, maksimal pilihan, harga tambahan
- Produk layanan (jasa) sebagai tipe produk tanpa stok (tanpa formulir pemesan)
- Penjadwalan harga; penjadwalan perubahan harga dan resep; harga berdasarkan waktu
- Hak kasir mengubah harga jual (batas maksimal persen per produk)
- Grup pelanggan dan harga spesial
- Harga grosir bertingkat (sampai 5 tingkat)
- Master resep dan kategori catatan
- Impor dan ekspor produk (spreadsheet)

### 2. Pajak & Biaya, Outlet, Karyawan
- Pajak per outlet: sebelum diskon, sesudah diskon, atau harga termasuk pajak; per transaksi atau per produk; per jenis order. PB1 bisa dihidupkan/dimatikan dan tarifnya bisa diubah (default: tidak dikenakan)
- Outlet: informasi bisnis, rekening, grup outlet
- Karyawan, peran, dan hak akses; komisi per kasir

### 3. Kasir & POS
- Mode SKU untuk ritel (cari dan input/scan kode lewat scanner keyboard)
- Filter kategori khusus: semua, favorit, paket, promo, deposit
- Pilih mode tampilan kasir: grid, SKU, meja
- Catatan per item atau per order (kategori catatan)
- Kasir boleh ubah harga jual dengan batas maksimal persen per produk
- Layar Pilih Karyawan dengan PIN setelah login perangkat; hak akses menentukan mode tampilan (kasir, dapur)
- Pengaturan per kasir: kas awal otomatis, tutup kasir otomatis, batas kas keluar, foto bukti kas
- Buat faktur penjualan dari layar pembayaran (Jadikan Invoice)

### 4. Meja & Denah, Dapur
- Mode meja dengan denah dan status berwarna
- Denah meja dari gambar (grid meja) di dashboard
- **Dapur (keputusan baru):** tidak ada tombol "kirim ke dapur" manual. Di backend, tiap menu diatur tujuannya (dapur, bar, atau tidak dikirim). Item diteruskan otomatis saat dipesan/dibayar
- Layar dapur (kitchen display) yang bisa dibuka di TV/browser, dan layar gudang
- Pengaturan mode cetak tiket dapur (otomatis atau tidak) dan struktur tiket yang bisa diedit (pencetakan fisik ada di Gelombang B)

### 5. Pembayaran, Void & Refund, Promo
- Split bill per produk dengan hitung ulang pajak, biaya layanan, harga grosir, promo
- Bayar dengan saldo deposit pelanggan
- Pengaturan metode pembayaran (aktifkan/nonaktifkan metode, simulasi biaya MDR)
- Laporan settlement QRIS: tab berhasil, gagal, diproses, tertunda; biaya transaksi; tanggal settlement (data dari tabel sendiri; sumber data nyata DOKU ada di Gelombang B)
- Laporan void di POS dengan filter dan detail
- Refund: opsi kembalikan stok dan ongkos kirim; riwayat refund per transaksi
- Terapkan kupon dengan kode dan nomor referensi
- Tukar poin loyalty (potongan atau produk gratis)

### 6. Pelanggan, CRM & Loyalti, Deposit
- Daftar pelanggan dengan riwayat transaksi, poin, deposit
- CRM: loyalty, grup loyalty, loyalty ulang tahun, kampanye
- Paket deposit (beli saldo, pakai di POS)

### 7. Inventori & Stok
- Stok per outlet dan gudang; daftar stok produk dan bahan baku dengan filter
- Stok opname dengan draf dan final, penyesuaian stok otomatis, impor Excel
- Permintaan barang (barang jual)
- Pemesanan stok (PO) dengan referensi permintaan atau tanpa referensi, diskon, pajak, biaya lain, uang muka
- Faktur pembelian: termin, penerimaan sebagian, lampiran
- Retur pembelian
- Notifikasi stok minimum, habis, dan minus
- Pembatasan penjualan dan mutasi saat stok habis: **pengaturan opsional, default MATI** (keputusan produk: stok boleh minus)
- HPP dengan metode rata-rata

### 8. Keuangan
- Hutang dan piutang
- Pencatatan biaya dan tagihan rutin terjadwal
- Rekonsiliasi penerimaan non-tunai per shift dan metode bayar (belum/terekonsiliasi)
- Akun piutang gateway dan biaya transaksi gateway
- Faktur penjualan dengan termin dan status bayar
- Penawaran, pesanan penjualan, pengiriman, penerimaan penjualan (alur B2B)
- Perbandingan laporan antar outlet
- Manajemen aset tetap
- Pengaturan per outlet: pencatatan non-tunai otomatis atau lewat rekonsiliasi manual
- Buku besar per akun dengan saldo berjalan dan pilih banyak akun
- Arus kas metode langsung dan tidak langsung dari akun
- Laporan hutang per pemasok dan piutang per pelanggan
- Akun perantara untuk buka/tutup kasir dan kas/bank non-tunai

### 9. HR
- Absensi dan payroll karyawan (absensi: pilih karyawan, selfie kamera, PIN, clock in/out)

### 10. Laporan & Analisa
- Penjualan bersih dan piutang (penjualan belum dibayar) di daftar penjualan
- Atur kolom tabel laporan dan ekspor
- Laporan Dapur, Meja, Pajak, Persediaan, Pelanggan, Karyawan, Deposit, Promo dan Loyalti
- Laporan kas kasir, penjualan per terminal, tutup kasir, tutup toko
- Analisa: jam teramai produk dan penjualan, perputaran stok, kepuasan pelanggan

### 11. Dashboard, Order Online, tampilan tambahan
- Dashboard web beranda: ringkasan real-time semua outlet
- Daftar ekspor (file hasil ekspor diambil dari satu halaman)
- Pengaturan tampilan struk (logo, teks) dengan pratinjau
- Order Online / kanal pesan mandiri: konfigurasi status kanal, jam layanan, estimasi persiapan (integrasi nyata ke marketplace ada di Gelombang B)
- Layar pelanggan (customer display) sebagai halaman web
- Aplikasi owner: tampilan web responsif untuk HP (pantau bisnis). Aplikasi native di Gelombang B
- Aplikasi pelanggan (self-order): versi web, dikerjakan paling akhir

---

## GELOMBANG B — antarmuka dan model data saja, diuji belakangan di perangkat atau layanan nyata

- Cetak struk ke printer Bluetooth atau jaringan (pendekatan Bluetooth umum, tanpa merek tertentu); cetak bill sebelum bayar; cetak struk dapur/checker
- Kirim struk digital lewat WhatsApp, email, atau SMS
- Mode offline: penjualan tetap berjalan offline dan sinkron saat online; daftar transaksi tertunda (kirim ulang atau hapus dengan PIN)
- DOKU: QRIS dinamis dengan QR di layar kasir; nomor referensi gateway (RRN) per transaksi; status menunggu, cek ulang otomatis, kedaluwarsa QR; notifikasi DOKU idempoten dan rekonsiliasi berkala; refund QRIS lewat API DOKU
- Integrasi nyata kanal order online (marketplace, antar makanan, kios)
- Aplikasi owner native (HP)
- Scan barcode lewat kamera

---

## DIBUANG (TIDAK PERLU) — jangan dikerjakan

- Kasir & POS: Custom amount (item tak terdaftar); Buku menu; Nomor antrean per perangkat atau terpusat; Batch order; Pilih orientasi tablet atau ponsel dengan login ulang; Mode jasa dengan formulir pemesan, pengambil, waktu selesai, status pekerjaan
- Meja & Denah: Gabung meja dengan tagihan, pisah item, grup meja; Batas waktu duduk dan pengingat per meja; Denah meja kustom dengan drag posisi; Gabung sisa pesanan jadi satu transaksi, wajib PIN gabung/reset/pindah meja
- Pembayaran: E-wallet langsung (Dana, Gopay, OVO, LinkAja, ShopeePay)
- Mode Offline: Sinkronisasi manual standar dan total; wajib sinkron setelah offline lebih dari 14 hari; mode server lokal; server lokal master dan client
- Laporan: Email laporan harian otomatis saat outlet tutup
- Inventori & Stok: Produksi stok (konversi bahan jadi); Nomor batch, kedaluwarsa, nomor seri; Pemetaan harga beli manual dan terakhir; Serial number dan batch number per produk; Laporan stok kedaluwarsa
- Reservasi: Reservasi dan appointment dengan kalender
- Turunan dari yang dibuang: mode tampilan kasir reservasi/jasa/buku menu, produk fasilitas, kirim pesanan ke dapur secara manual per item

---

## ASUMSI yang diambil (ubah di sini jika salah)

1. "Produk layanan (jasa)" tetap ada sebagai tipe produk tanpa stok. Laporan Jasa dan Laporan Fasilitas dibuang karena mode jasa, reservasi, dan fasilitas dibuang.
2. Batas penjualan saat stok habis menjadi pengaturan opsional (default mati) agar tidak bertentangan dengan keputusan "stok boleh minus".
3. Aplikasi owner = tampilan web responsif di Gelombang A. Native ke Gelombang B.
4. Aplikasi pelanggan = web saja, urutan terakhir.
5. Migrasi database mengikuti aturan repo (`AGENTS.md` #2): hanya Claude yang membuat dan menguji migrasi; Antigravity tidak menyentuh `packages/db`. Penerapan ke produksi hanya atas persetujuan Louis. Saat ini 0031 dan 0032 menunggu, dan keputusannya ditunda ("nanti"), sehingga fitur yang bergantung padanya tidak bisa selesai sebelum itu.
