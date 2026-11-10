# Peta navigasi target (A12) — hasil pengamatan layout dashboard referensi, 10 Nov 2026

Struktur (bukan kode/aset/teks produk lain). Label ditulis ulang dengan kata sendiri bila perlu; urutan & hierarki ikut referensi.

## Kerangka
- Topbar putih (tinggi ~60px): logo kiri; di tengah **tab modul** horizontal; kanan: lonceng notifikasi (titik merah), nama bisnis + nama pengguna + menu ⋮.
- Sidebar kiri hijau tosca penuh (lebar ~250px), tinggi penuh. Atas: pemilih outlet ("Semua Outlet" + ikon). Bawah tertempel: kotak bantuan "Chat 24 Jam".
- Item sidebar: ikon + label + chevron; **akordeon (satu grup terbuka sekaligus)**; item aktif = latar lebih gelap + garis kuning di tepi kanan; anak item teks putih lebih kecil, menjorok.
- Area isi: latar abu sangat muda, kartu putih sudut membulat, bayangan tipis. Mobile (<~900px): sidebar jadi drawer dengan chip modul di atasnya.

## Tab modul topbar (dan isi sidebar tiap tab)
1. **Penjualan** (default)
   - Menu Favorit (anak: Produk Barang, Absensi, Faktur Pembelian — bisa diatur pengguna)
   - Dashboard
   - Laporan → Penjualan, Dapur, Meja, Produk, Jasa, Fasilitas, Promo & Loyalti, Pajak, Kasir, Deposit, Pelanggan, Karyawan, Persediaan, Settlement (tiap anak punya sub-laporan)
   - Analisa Laporan → Waktu Teramai Produk, Waktu Teramai Penjualan, Perputaran Stok, Kepuasan Pelanggan
   - Produk → Daftar Departemen, Daftar Kategori, Produk Barang, Produk Layanan, Produk Fasilitas, Produk Ekstra, Produk Paket, Deposit, Penjadwalan Perubahan Resep, Daftar Harga Ojek Online, Penjadwalan Harga, Harga Berdasarkan Waktu
   - Inventori → Daftar Bahan Baku, Pembelian Stok(▾), Kelola Stok(▾), Produksi Stok(▾), Mutasi Antar Outlet(▾), Daftar Pemasok
   - Pelanggan → Daftar Pelanggan, Grup Pelanggan, Grup Harga Spesial, Kustom Data Pelanggan, Pengaturan Data Pelanggan
   - Promosi → Promo(▾), Kupon(▾), Loyalty(▾), Poin Reward(▾)
   - Komisi → Daftar Grup Komisi
   - Invoice → Daftar Penawaran Penjualan, Daftar Pesanan Penjualan, Daftar Pengiriman Penjualan, Daftar Invoice, Daftar Penerimaan Penjualan
   - Marketing → Kirim Kampanye Marketing, Beli Kampanye Marketing
2. **Order Online** — kartu saldo order online di atas sidebar; menu: Pesanan (aktif), Order mandiri(▾), Marketplace(▾), Pesan-antar makanan(▾), Kios, Aplikasi konsumen. Isi Pesanan: pencarian, rentang tanggal, filter channel & outlet, 4 kartu hitung (Masuk/Diproses/Dikirim/Selesai) dengan garis warna di bawah, tab status (Masuk, Diproses, Dikirim, Diterima, Selesai, Batal/Refund), tabel kosong + ilustrasi.
3. **Appointment** — terkunci paket (modal "fitur khusus paket lebih tinggi").  → di CG POS: modal serupa, tab tampil tapi nonaktif.
4. **Karyawan** — Menu Favorit; Pengaturan Karyawan → Daftar Karyawan; Payroll(▾); Hak Akses(▾); Absensi(▾); Tim(▾); Jadwal Kerja(▾); Pengaturan Master(▾); Alur Kerja Persetujuan(▾). Isi Daftar Karyawan: banner info, judul + tombol "Ringkasan Outlet" & "Tambah Karyawan", pencarian + filter status, dua kartu kuota (karyawan, admin), tabel (nama+kode, posisi, outlet, kuota, status, ⋯).
5. **Keuangan** — Dashboard Keuangan, Buku Kas(▾), Penerimaan(▾), Pengeluaran(▾), Manajemen Aset(▾), Laporan Keuangan(▾), Daftar Akun(▾). Isi: grafik Laba Rugi (garis, pilih Hari), Arus Kas, kartu Saldo Kas, kartu Neraca; tombol "Panduan Dashboard" & "Tambah Widget".
6. **Whatsapp** — terkunci (butuh add-on) → modal.
7. **Lainnya ▾** (menu turun): Pengaturan, Bantuan, Layanan, Inspirasi, Pendanaan, Supplies. Pengaturan → sidebar: Pesan Masuk, Notifikasi, Akun Profil, Langganan, Layar Dapur, Outlet, Produk dan Inventori, Reservasi, Pengaturan Ruangan, Pembayaran, Cetak, Kasir, Deposit, Terminal, Akses Support, Daftar Ekspor.

## Dashboard Penjualan (isi beranda)
Banner promo (bisa ditutup) → kartu besar: judul + ? + bintang favorit, "Diperbarui <waktu>", tab Harian/Mingguan/Bulan + rentang tanggal dengan panah; KPI kiri (Total Penjualan + % + akumulasi bulan + proyeksi), tengah (Belum Dibayar, Terbayar), kanan 2x2 (Transaksi, Penjualan/Transaksi, Produk Terjual, Produk/Transaksi) — semua dengan % naik (hijau ↗) / turun (merah ↘); grafik garis per jam dengan garis periode sebelumnya; grid 4 kolom kartu bar horizontal (Metode Pembayaran, Kontrol Fraud/Void, Penjualan per Kasir, Produk Terlaris, Stok Terendah, per Kategori, Jenis Order, Komisi per Kasir) masing-masing "⋯" + "Lihat Semua ›".

## Pemetaan ke CG POS (tahap 1 = hanya KERANGKA + tab; isi menyusul)
- Tab yang berfungsi penuh sekarang: Penjualan (isi = halaman yang sudah ada), Keuangan (dashboard keuangan sudah ada), Karyawan (pengaturan/karyawan sudah ada), Pengaturan.
- Tab terkunci/rintisan: Order Online, Appointment, Whatsapp → halaman "Segera hadir" dengan kerangka yang sama (tanpa menjanjikan fitur).
- Halaman yang belum ada tetap dirutekan ke halaman rintisan (pola [...slug] yang sudah dipakai).
