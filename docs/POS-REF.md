# Referensi tampilan kasir (hasil pengamatan, kata-kata sendiri)

Sumber: aplikasi kasir Majoo di BlueStacks, dilihat 10 Nov 2026 (shift dibuka dengan kas awal 0 sesuai arahan Louis; tidak ada pembayaran yang diproses, keranjang percobaan dihapus). Yang diambil hanya susunan dan fungsi, bukan kode, aset, atau teks. Warna bebas, hijau dominan.

## Layar kasir (landscape tablet, 2 kolom)
- Header hijau penuh: kiri tombol menu (hamburger) + logo outlet + "Outlet - nama kasir" + penanda online; tengah logo; kanan ikon notifikasi, ikon pintasan (grid), ikon kunci, dan tombol lebar "Daftar Order (jumlah)".
- Kolom kiri (sekitar 65%): bar cari + tombol "Custom Amount" + ikon scan; di bawahnya rel kategori ikon di kiri (semua, favorit, dst, disusul singkatan kategori) dan grid produk 5 kolom.
- Ubin produk: foto (atau inisial besar bila tak ada foto), lencana stok di pojok kiri atas gambar, nama, harga, bintang kecil bila favorit, lencana kecil bila harga berbeda per satuan. Setelah dimasukkan, ubin tertutup lapisan hijau dengan jumlah di tengah dan stok berkurang di lencana.
- Produk stok 0 tidak bisa dimasukkan ke pesanan.
- Kolom kanan (sekitar 35%): baris atas "Jenis Order" (dropdown) + "Pelanggan"; nomor transaksi tampil di atas daftar; tiap baris: jumlah, nama, harga, ekstra di bawahnya, tombol hapus merah bulat; menghapus item terakhir meminta konfirmasi.
- Dasar kolom kanan: tiga tombol (hapus semua, diskon/promo, simpan) dan batang hijau besar "Bayar" dengan lencana jumlah item di kiri dan total di kanan.
- Jenis order: Meja, Meja bebas, Bungkus, Pengiriman, Ojek online, Reservasi, Dilayani oleh, Reset.

## Dialog detail produk
Judul + tombol Simpan hijau di pojok; kartu produk kecil; stepper kuantitas dan pilihan satuan sebaris; grup ekstra dengan aturan tertulis ("harus dipilih, hanya bisa pilih 1") dan stok per ekstra; kolom catatan dengan penghitung 0/100.

## Layar pembayaran
- Atas: tiga angka sebaris (Total tagihan, Sisa tagihan merah, Kembalian biru).
- Baris aksi: Pisah bayar, Jadikan invoice, Catatan.
- Kiri: rel metode (Tunai, Nontunai, Transfer, QRIS, Komplimen, Deposit). Tengah: tombol nominal cepat (Uang pas, 50.000, 100.000, Lainnya).
- Kanan: ringkasan pesanan (pelanggan, nomor, baris, total) dan batang "Proses bayar" (abu sampai nominal cukup).

## Daftar Order
Judul + tombol Filter + kolom cari; rel kategori kiri (Semua, Kasir, Order online, Faktur penjualan, masing-masing dengan jumlah); tabel: jenis, nama, nomor, tanggal, status (pil), tagihan.

## Menu samping (drawer)
Kasir, Penjualan, Laporan, Absensi, Inventori, Pengaturan, Bantuan, Tutup kasir, Keluar kasir. Header drawer: nama outlet, kasir, ID pelanggan.
- Penjualan: dua kartu ringkas (total penjualan, jumlah transaksi) lalu daftar transaksi (jenis+nama meja, pelanggan, nomor, waktu, kasir, metode+nominal).
- Laporan: rel kategori kiri (Ringkasan penjualan, 10 laporan teratas, Komisi, Void, Kasir, Kas kasir, Produk terjual, Jenis bayar, Kepuasan pelanggan, Lainnya, Penjualan deposit); Ringkasan: filter periode + outlet, delapan kartu angka dengan garis warna bawah, grafik batang per jam.

## Selisih dengan CG POS (per 10 Nov 2026)
1. Header putih tipis -> jadikan band hijau dengan tombol Daftar Order lebar dan ikon notifikasi/pintasan.
2. Ubin produk: belum ada lencana stok, inisial pengganti foto, bintang favorit, lapisan jumlah; grid 4 kolom -> 5 kolom di 1280.
3. Keranjang: tab jenis order -> dropdown Jenis Order + Pelanggan sebaris; nomor transaksi di atas; baris dengan tombol hapus merah; batang Bayar besar dengan lencana jumlah.
4. Pembayaran: belum ada tiga angka (total/sisa/kembalian), nominal cepat, ringkasan pesanan di kanan, Pisah bayar/Catatan.
5. Dialog detail produk: sudah ada ekstra, belum ada aturan tertulis grup dan stok ekstra.
6. Menu drawer dengan Penjualan dan Laporan ringkas (data hari ini).
7. Produk stok 0 tidak bisa dijual (butuh keputusan; ada di parity "batas jual stok habis").
