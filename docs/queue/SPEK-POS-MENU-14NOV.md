# SPEK-POS-MENU-14NOV — menu samping kasir acuan (pengamatan langsung 14 Nov 2026)

Sumber: Claude mengamati aplikasi acuan di emulator atas izin Louis (akun uji, kas awal 0). Isi di bawah adalah DESKRIPSI FUNGSI dan TATA LETAK dengan kata sendiri. Jangan menyalin teks, ikon, gambar, atau warna persis (clean room). Semua label tulis sendiri dalam Bahasa Indonesia.

## Menu samping (hamburger)
- Kartu profil: logo outlet, nama usaha, nama outlet, nama kasir, ID pelanggan dengan tombol salin.
- Isi menu berurutan: Kasir, Penjualan, Laporan, Absensi, Inventori, Pengaturan, Bantuan, garis pemisah, Tutup Kasir; di dasar: Keluar Kasir.
- Tiap layar memakai pita atas yang sama: hamburger kiri, judul, penanda "Online".

## Penjualan
- Dua kartu ringkasan (Total Penjualan, Total Transaksi) lalu tabel: Jenis (ikon jenis order + nama meja), Nama pelanggan, No Transaksi, Waktu, Kasir, Pembayaran (jumlah + metode).
- Pita atas: Filter dan Cari. Filter: Periode (rentang tanggal), Outlet, Jenis Penjualan; tombol Reset dan Terapkan.
- Detail Penjualan (ketuk baris): kiri daftar pesanan (chip Pesanan 1, item + ekstra) dan Rincian Pembayaran (subtotal, total); kanan total besar, waktu, jenis, nomor; No Urut, Pelanggan, Kasir Order, Kasir Bayar, Status, Metode Bayar, Catatan Pesanan; tombol Riwayat dan Refund; Cetak di pita atas.

## Laporan
Dua kolom: kiri "Kategori Laporan" (Ringkasan Penjualan, 10 Laporan Teratas, Komisi, Void, Kasir, Kas Kasir, Produk Terjual, Jenis Bayar, Kepuasan Pelanggan, Lainnya, Penjualan Deposit); kanan isi. Atas: pemilih periode (Hari ini dll) + panah geser tanggal + pemilih outlet.
- Ringkasan: 8 kartu KPI (Total Penjualan, Total Transaksi, Laba Kotor, Total Produk, Terima Pembayaran, Refund, Order per Transaksi, Komisi) + grafik batang per jam.
- 10 Laporan Teratas: tujuh daftar peringkat yang dipilih di kolom tengah (Produk Terlaris, Laba Kotor, Stok Terendah, Stok Minimum, Komisi Produk, Komisi Transaksi, Jenis Order).
- Komisi: tiga kartu (Nominal, Komisi Produk, Komisi Penjualan) + daftar; keadaan kosong bergambar.
- Void: kartu Total Void, Total Transaksi; tabel No Nota, Tanggal Void, Tanggal Order, Kasir, Otorisasi, Produk, Sub Total; filter jenis order.
- Kasir: tabel Waktu Buka, Saldo Awal, Kasir, Waktu Tutup, Saldo Akhir, Aksi; filter status.
- Kas Kasir: lima kartu (Pemasukan, Pengeluaran, Total Refund, Total Kas Kasir, Total Penjualan) + daftar (mis. Modal Awal sebagai uang masuk); tombol "+ Transaksi" untuk kas masuk/keluar.
- Produk Terjual: daftar nama dan jumlah; tombol Cetak.
- Jenis Bayar: tiga kartu + tabel per metode (jumlah transaksi, persen transaksi, penjualan, persen penjualan).
- Kepuasan Pelanggan, Penjualan Deposit: keadaan kosong bergambar (deposit memuat catatan info).
- Lainnya: arahan ke dashboard web untuk laporan lengkap.

## Absensi
Layar penuh: kiri kamera langsung (jam, tanggal, tombol ganti kamera), kanan Pilih Karyawan + papan PIN + tombol Clock In/Clock Out; catatan bahwa absen masuk/keluar harus di perangkat yang sama; tombol "Daftar Kehadiran" di pita atas.

## Inventori
Empat bagian di kolom kiri: Faktur Pembelian, Stok Opname, Terima Mutasi Stok, Stok Terbuang. Tiap bagian: pemilih rentang tanggal, pencarian, tombol "Tambah …" di pita atas, keadaan kosong bergambar. Formulir tambah dua langkah (1 Informasi: nomor otomatis bila kosong, outlet, tanggal, waktu, catatan; 2 Produk), tombol Simpan Draf dan Simpan. Menutup formulir selalu bertanya konfirmasi "Keluar halaman?" (Batal / Ya, Keluar).

## Pengaturan (menu kiri "Operasional")
- Produk & Kategori: dua tab (Produk, Kategori); pencarian + ikon filter; tombol lebar "Tambah Produk"; baris: foto/inisial, nama, kategori (bintang bila favorit), harga, stok.
- Order Online: Buka/Tutup Sementara; daftar status kanal (aplikasi sendiri aktif; kanal lain "belum terintegrasi") + Refresh.
- Struk & Biaya: "Lihat Tampilan Struk"; Tampilan Struk (Struk, Surat Jalan, Label); Struk Kasir (Header, Footer, dst).
- Pajak: Status Pajak (Aktif/Mati).
- Kasir: Tampilan Default (mode grid), Default Jenis Order (berapa dipilih), Order Wajib Online, Sembunyikan Stok Produk/Ekstra, Interactive Display (layar pelanggan mengikuti kasir), Notifikasi Gagal Autoprint (pop up), Buka Tutup Kasir: Kas Awal bawaan, Tutup Kasir Otomatis (jam), Kas Keluar: Batasan Pengeluaran per hari.
- Perangkat: daftar + cari + "Tambah Perangkat" (sudah dibuat di A148).
- Notifikasi Suara: satu saklar Status.
- Pembayaran Nontunai: tombol "Tambah Pembayaran" + daftar (nama, tipe: QRIS Statis/Dinamis, Transfer Bank, EDC, Lainnya, rekening).
- Promo: Basic Promo (aktif/nonaktif, diskon tanpa batas waktu), daftar promo (nama, otomatis, periode, tipe, syarat).
- Keluar.

## Bantuan
Dialog "Chat via WhatsApp": layanan bantuan 24 jam, kode QR, tombol nomor. (Isi sendiri: kontak bantuan CG POS.)

## Perilaku keranjang dan detail produk
- Mengetuk kartu produk SELALU membuka Detail Produk (foto, nama, harga; Kuantitas stepper; Satuan dropdown; Ekstra; Catatan 0/100; "Produk tidak dijual: status produk"; Simpan).
- Ekstra wajib belum dipilih: Simpan ditolak dengan pesan singkat "belum memilih ekstra"; grup berlabel "Harus dipilih / Opsional, hanya bisa pilih n"; pilihan yang dicentang naik ke atas; penghitung n/total. (ALUR EKSTRA DITUNDA; jangan ubah.)
- Keranjang: nomor order outlet/terminal/tanggal/urut di atas daftar; item dengan nomor, nama, "+ ekstra (jumlah)", harga, tombol hapus bulat merah; dasar: Hapus (merah bila ada isi), Promo, Bayar dengan lencana jumlah dan total.
