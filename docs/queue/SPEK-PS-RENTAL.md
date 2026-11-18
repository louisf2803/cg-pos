# Spesifikasi: rental PS di kafe (Coffee Ground)

Keputusan Louis (18 Nov 2026). Kafe yang punya tempat PS: satu bisnis, satu laporan, satu outlet; PS adalah bagian kafe, bukan usaha terpisah.

## Tampilan di POS
- Toggle **Kafe | PS** di POS. Tampilan Kafe tidak berubah. Tampilan PS: denah station (diatur di backend, terpisah dari denah meja kafe).
- Kartu station: nama, status, sisa waktu (mundur), penyewa, tipe konsol. Status: Aktif, Kosong, Booking, Lewat waktu, Perawatan.
- Ketuk station: detail (penyewa, sisa waktu, status bayar, **daftar game station itu**), aksi: Mulai sewa, Tambah waktu, Tambah makanan, Selesai dan bayar, Booking.
- Lewat waktu: kartu merah dan menampilkan lewat berapa menit; **kasir menegur manual** dan menambah paket waktu (konsol belum bisa dimatikan jarak jauh; pikirkan nanti).

## Waktu dan sewa
- Paket dipilih saat mulai (mis. 2 jam atau 3 jam). Bayar TIDAK harus di awal: boleh simpan tagihan seperti pesanan kafe, bayar saat selesai.
- **Tanpa pembulatan waktu.** Ada tenggang **5 menit** di awal untuk persiapan: tombol mulai pukul 15.21 -> waktu sewa dihitung 15.26 sampai 16.26 (untuk paket 1 jam).
- Lewat waktu: kasir menambah paket waktu sesuai tarif (bukan tagihan otomatis per menit).

## Harga (diatur di backend, per station)
- Tarif per jam **berbeda tiap station**.
- **Pita jam** per station: jam X sampai Y tarif berbeda. Sesi yang melewati dua pita **dipecah per menit sesuai pita** (tarif/60 per menit di tiap pita).
- **Paket jam khusus** (mis. 18.00-21.00 langsung Rp X): hanya berlaku di jendela itu dan **selesai tepat saat jendela berakhir**, tanpa toleransi: datang 20.00 tetap selesai 21.00. (ASUMSI: harga paket tetap sama walau datang terlambat; konfirmasi ke Louis.)
- Paket biasa berdurasi tetap (2 jam, 3 jam, ...) dengan harga paket.

## Booking
- Dibuat dari **kasir (POS)** dan dari **aplikasi HP karyawan** sisi manajer dan pemilik.
- **Bayar penuh lewat transfer**; pembayaran diarahkan lewat WhatsApp. (Sistem tidak mengirim WA otomatis: sediakan teks pesan siap salin dengan rekening dan nominal; konfirmasi lunas manual.)
- **Hangus otomatis** bila belum ditandai lunas setelah batas waktu (diatur di backend; usulan awal 2 jam, ASUMSI).
- Status bayar terlihat di kartu station dan daftar booking.

## Satu tagihan lewat pelanggan
- Pelanggan dipilih di sesi PS maupun di pesanan kafe. Dari data pelanggan terlihat: berapa jam PS yang dipakai, makanan apa yang dipesan, lalu semuanya masuk **satu nota**.

## Daftar game
- **Per station** (tiap station punya daftar game sendiri), diisi di backend, tampil saat station diketuk di POS.

## Laporan
- Tidak dipisah: PS dan kafe satu kesatuan (boleh tetap diberi kategori produk "Sewa PS" agar bisa difilter bila perlu).

## Rancangan data (usulan)
- `ps_stations`: outlet, nama, tipe konsol, tarif dasar per jam, posisi denah, aktif/perawatan, daftar game.
- `ps_rate_bands`: station, jam mulai, jam selesai, tarif per jam (hari bila perlu).
- `ps_packages`: nama, durasi, harga, station berlaku, jendela jam opsional (paket khusus), hari berlaku.
- `ps_sessions`: station, pelanggan, mulai (ketuk), mulai hitung (+5 menit), selesai, paket, status, nota (order) terkait.
- `ps_bookings`: station, pelanggan, waktu, paket, status bayar, batas hangus.
- Sewa masuk ke nota sebagai baris (produk "Sewa PS" dengan harga hasil hitung) sehingga satu nota dengan makanan.

## Risiko dan hal yang perlu diputuskan saat membangun
- POS bekerja offline dan timer memakai jam perangkat; sesi PS perlu mulai/tambah/selesai lewat antrean sinkronisasi atau wajib online (usulan: tahap 1 wajib online untuk mulai/tambah, tampil dari cache bila offline).
- Konflik booking dengan sesi berjalan (cek jadwal bentrok di server).
- Jam operasional dan sesi yang melewati tengah malam (tanggal buku).
- Pengendalian konsol jarak jauh: ditunda.

## Tahap pengerjaan
1. Data dan pengaturan backend (station, tarif, pita, paket, game, denah PS).
2. Tampilan PS di POS (toggle, denah, timer, mulai/tambah/selesai) + menempel ke nota dan pelanggan.
3. Pembayaran satu nota dengan makanan + hitung harga pita/paket.
4. Booking (POS dan aplikasi HP) + bayar penuh + hangus otomatis.
