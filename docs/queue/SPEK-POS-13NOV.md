# SPEK-POS-13NOV — acuan alur dan tata letak layar kasir (hasil pengamatan langsung, 13 Nov 2026)

Sumber: Claude mengamati aplikasi acuan di emulator atas izin Louis (13 Nov 2026). Isi di bawah adalah DESKRIPSI FUNGSI dan TATA LETAK dengan kata sendiri; JANGAN menyalin teks, ikon, gambar, atau warna persis (clean room). Semua label tulis sendiri dalam Bahasa Indonesia. Pakai kelas dan token `packages/ui`.

Perbandingan wajib: untuk tiap layar, buka layar kita di lebar tablet landscape (1280 x 800) dan cocokkan susunannya dengan deskripsi ini. Bila satu elemen di sini tidak ada di layar kita, tambahkan. Bila alurnya beda, ubah alurnya.

## 1. Layar kasir utama (landscape)
- Pita atas berwarna merek: tombol menu (hamburger) di kiri, logo outlet bulat + nama outlet + nama kasir + penanda "Online" (titik hijau), merek di tengah, di kanan: ikon lonceng notifikasi (titik merah bila ada), ikon tampilan (ganti mode), ikon gembok (kunci layar), dan tombol lebar "Daftar Order (jumlah)" dengan titik merah bila ada order baru.
- Bawahnya dibagi dua kolom: kiri produk (sekitar 2/3 lebar), kanan keranjang (sekitar 1/3).
- Kolom kiri: baris pencarian ("ketik minimal 3 karakter"), tombol "Jumlah bebas" (item custom), ikon pindai barcode. Di bawahnya jalur kategori VERTIKAL di tepi kiri berisi ikon/singkatan: Semua (kotak-kotak), Favorit (bintang), Paket, Buku/Resep, Promo (label), Deposit (dompet), lalu kategori produk memakai singkatan 1–3 huruf (mis. "L-", "SI", "CS"). Ada tombol buka/tutup jalur di atasnya.
- Kartu produk: kotak dengan foto (atau inisial besar di latar abu bila tanpa foto), lencana kecil di sudut kiri atas (jumlah stok atau 0), nama produk, harga di bawah; bintang kuning di kanan bawah untuk favorit; penanda "Rp" biru kecil bila harga bervariasi. 5 kartu per baris di lebar tablet.
- Kolom kanan (keranjang): baris atas "Jenis Order" (dropdown) dan pelanggan (ikon orang + nama, ketuk untuk memilih/menambah). Tengah: daftar item atau teks kosong "silakan masukkan pesanan dari pelanggan". Nomor order tampil di atas daftar setelah ada item (format outlet/terminal/tanggal/urut). Tiap item: nomor, nama, ekstra terpilih dengan baris kecil "+ nama ekstra (jumlah)", harga di kanan, tombol hapus merah bulat. Bawah: dua tombol "Hapus" (kosongkan semua; minta konfirmasi) dan "Promo". Paling bawah tombol besar hijau "Bayar" dengan lencana jumlah item di sudut dan total di kanan.

## 2. Dialog detail produk (ketuk kartu produk)
- Header: tombol tutup, judul, tombol "Simpan" hijau di kanan. Baris ringkas: foto kecil, nama, harga.
- Kuantitas dengan tombol minus/plus (stepper) dan Satuan (dropdown). Bagian Ekstra: kelompok ekstra memuat aturan ("Harus dipilih" atau opsional, "Hanya bisa pilih 1" atau banyak) dan tiap opsi punya harga tambahan, stepper jumlah, dan "Stok tersedia: n". Menyimpan tanpa memilih ekstra yang WAJIB menampilkan pesan singkat "belum memilih ekstra" dan dialog tidak menutup. Kolom catatan opsional (0/100). Bagian "Produk tidak dijual" untuk mengatur status produk (hanya di kasir, dll.).

## 3. Layar Pembayaran (Checkout)
- Header: panah kembali, judul "Pembayaran", penanda Online. Tiga angka besar sejajar: Total Tagihan, Sisa Tagihan (merah selama belum lunas), Kembalian (biru).
- Dua tombol lebar di bawahnya: "Jadikan Invoice" dan "Catatan".
- Bagian kiri: daftar Metode Pembayaran vertikal (Tunai, Nontunai, Transfer, QRIS, Komplimen, Deposit) dengan ikon menu di pojok kanan atas; satu metode terpilih dengan latar hijau muda dan garis hijau. (Pada kita: Deposit sebagai alat bayar dibatalkan oleh keputusan Louis; QRIS tampil "Payment belum tersambung".)
- Bagian tengah (untuk Tunai): tombol nominal cepat dalam grid 2 kolom: "Uang Pas", dua nominal pecahan yang masuk akal terhadap total, dan "Lainnya" (nominal bebas).
- Kolom kanan: ringkasan pesanan: chip pelanggan + nomor order, daftar item (nomor, nama, ekstra, harga), lalu bar bawah "Total n Produk" dengan nilai total dan panah-atas kecil untuk membuka rincian (Jenis Pesanan, Subtotal, diskon/pajak/biaya bila ada, Total). Tombol "Proses Bayar" lebar di dasar kolom, abu-abu dan tidak aktif sampai sisa tagihan terpenuhi, hijau saat bisa diproses.

## 4. Menu samping (hamburger)
Kartu profil outlet (logo, nama outlet, nama kasir, ID) lalu menu: Kasir, Penjualan, Laporan, Absensi, Inventori, Pengaturan, Bantuan, Tutup Kasir; di dasar "Keluar Kasir".

## 5. Pengaturan > Perangkat
- Daftar perangkat dengan kolom cari di atas dan tombol lebar berpinggir "Tambah Perangkat". Bila kosong: ilustrasi printer, judul "Perangkat tidak tersedia", petunjuk memakai tombol Tambah Perangkat.
- Alur Tambah (tiga langkah, tiap langkah dialog kecil Batal/Simpan; Simpan abu-abu sampai ada pilihan):
  1. Jenis perangkat (pilihan tunggal): Printer Kasir, Printer Dapur, Printer Labeling, Printer Alamat, Printer Server, Printer Terpusat, Pemindai Barcode, Mesin ECR.
  2. Jenis koneksi (untuk printer): Bluetooth, LAN/WiFi, USB/Serial, Printer Server. (Keputusan Louis: hanya Bluetooth yang dikerjakan; opsi lain tampil nonaktif "belum didukung".)
  3. Form "<jenis> - <koneksi>": tombol "Pindai" di kanan atas; Tipe Driver (dropdown, mis. beberapa varian generik untuk printer kasir; untuk printer label satu model khusus); Tipe Kertas (dropdown: 58 mm, 76 mm, 80 mm, A4 untuk printer kasir; ukuran label khusus untuk printer label); bagian "Pilih Printer" berisi daftar perangkat Bluetooth hasil pindai, atau pesan "Bluetooth belum diaktifkan" bila tidak aktif. Tombol tutup di kiri atas.
- Tugas kita: bangun layar ini di dashboard kasir (apps/pos) memakai Web Bluetooth/`printer.ts` yang sudah ada; pasangan perangkat tersimpan per perangkat (localStorage boleh; ini pengaturan perangkat, bukan data bisnis), dengan tombol uji cetak.

## 6. Pengaturan > Cetak Barcode (label)
- Dua baris: "Kertas" (nilai terpilih di kanan, buka daftar) dan "Produk" (jumlah produk terpilih di kanan, buka pemilih produk). Di bawahnya "Pratinjau barcode": kartu contoh berisi barcode, angka, nama produk, harga.
- Daftar kertas: pilihan tunggal dengan tombol "Tambah Kertas" di header dan "Atur Kertas" per kertas.
- Atur Ukuran Kertas (form): catatan "ukuran kertas hanya berlaku untuk printer laser/inkjet"; Nama Kertas (maks 50 karakter), Panjang Kertas (mm), Lebar Kertas (mm), Jumlah Kolom, Panjang Label (mm), Lebar Label (mm), Jarak Baris (mm), Jarak Kolom (mm), Jarak Kiri (mm), Jarak Atas (mm). Bagian "Isi Label Barcode": Ukuran Huruf (mm), Maksimal Karakter, sakelar Tampilkan Barcode + Tinggi Barcode (mm), sakelar Tampilkan Kode Produk, Nama Produk, Satuan, Nama Merchant (bawaan mati), Harga + Ukuran Harga (mm). Tombol "Preview" dan "Simpan" di header. Kertas bawaan boleh baca-saja (kolom abu).
- Contoh nilai awal yang wajar: kertas 165 x 210 mm, 3 kolom, label 50 x 18 mm, jarak baris 2, jarak kolom 5, jarak kiri 3, jarak atas 7, huruf 2,4, maks 15 karakter, tinggi barcode 1,6, harga 2,3.
- (Keputusan Louis: "mode SKU" dibuang; "Kode Produk" boleh tampil sebagai pilihan isi label saja.)
