# CG POS — panduan trial (mode demo)

Trial memakai **data palsu di memori peramban** (tanpa database, tanpa internet, tanpa DOKU). Data kembali ke awal setiap muat ulang. Kasir dan dashboard punya data demo masing-masing (tidak saling terhubung di mode demo).

## Menjalankan
```bash
pnpm install
# kosongkan VITE_/NEXT_PUBLIC_ Supabase di .env.local (atau jangan buat file itu) → otomatis mode demo
pnpm -F @cgpos/pos build && python3 -m http.server 4311 --directory apps/pos/dist      # kasir  → http://localhost:4311
pnpm -F @cgpos/dashboard build && python3 -m http.server 4310 --directory apps/dashboard/out  # dashboard → http://localhost:4310
```
Pengembangan: `pnpm -F @cgpos/pos dev`, `pnpm -F @cgpos/dashboard dev`.

## Akun demo (khusus data palsu, bukan akun nyata)
| Nama | Peran | PIN demo |
|---|---|---|
| Pemilik | owner | 111111 |
| Sari | kasir | 222222 |
| Budi | manajer | 333333 |

## Alur yang sudah bisa dicoba
**Kasir (apps/pos):** pilih karyawan + PIN → buka kasir (modal awal) → cari produk / ketik SKU lalu Enter (contoh `nk-001`) → pilih ekstra/ukuran → **Item bebas** (nama + harga sendiri) → pilih jenis order/meja → **Pisah item** (bayar sebagian item lebih dulu) atau Bayar (tunai, kartu, QRIS tampil "belum diaktifkan") → struk (cetak lewat peramban) → Ringkasan Shift (kas masuk/keluar) → Tutup kasir (hitung uang + PIN).
**Stasiun cetak (dapur/bar):** tidak ada tombol "Kirim ke dapur" lagi. Produk yang sudah ditetapkan ke stasiun diteruskan otomatis saat pesanan disimpan atau dibayar; tiket tiap stasiun muncul sebagai kartu kecil (Cetak / Lihat / tutup). Di demo, stasiun Dapur dan Bar sudah terisi. Di database nyata fitur ini menunggu migrasi 0029 (belum diterapkan).
Pengaturan perangkat (ikon gir) memilih tampilan produk: kartu, daftar ringkas, atau mode SKU ritel. Dashboard > Pengaturan > Bisnis dan outlet mengatur teks dan isi struk.
**Dashboard (apps/dashboard):** tab modul Penjualan, Order Online, Karyawan, Keuangan (+ Appointment/Whatsapp terkunci); beranda ringkasan; laporan penjualan/produk/kasir/pajak/void/refund/meja/promo/persediaan/pelanggan/jam ramai; produk, kategori, ekstra, paket, impor CSV, satuan ganda, stok, opname, transfer stok, pembelian, faktur, pemasok; promo, loyalty; keuangan (akun, jurnal, buku besar, kas, laporan); pengaturan outlet, denah meja, pajak, biaya, karyawan + PIN.

## Uji otomatis alur kasir
```bash
NODE_PATH=$(npm root -g) node scripts/split-e2e.js     # pisah bayar per item; juga scripts/viewmode-e2e.js (mode tampilan)
NODE_PATH=$(npm root -g) node scripts/trial-e2e.js     # buka shift → pesan → item bebas → bayar → kas keluar → tutup shift (1280 & 390 px)
bash scripts/review.sh                                   # typecheck + tes shared + build dashboard
export PGHOST=/tmp/pgsock PGPORT=54329 PGUSER=postgres; bash packages/db/tests/run.sh   # tes database lokal
```

## Batasan yang diketahui
- Migrasi 0001–0030 sudah diterapkan ke database produksi (0011, 0025–0027 pada 10 Nov 2026 dan 0028–0030 pada 11 Nov 2026, atas persetujuan Louis; terverifikasi lewat katalog, belum dicoba dengan login nyata). Migrasi berikutnya diuji lokal dulu dan menunggu persetujuan. Fitur yang butuh migrasi belum disetujui ditandai "partial / menunggu diterapkan" di `replica/features.csv`.
- QRIS DOKU sengaja belum aktif. Printer thermal Bluetooth teruji dengan perangkat tiruan, belum dengan printer fisik; belum ada printer jaringan/iPhone.
- Offline: penjualan dan pembayaran tertunda bisa dikirim ulang; belum untuk refund/void/shift offline dan login PIN offline.
- Belum ada: foto bukti kas, mode tampilan kasir reservasi dan buku menu, split bill dengan hitung ulang promo/harga grosir, denah meja gambar bebas, multi-outlet penuh, layar pelanggan, aplikasi konsumen, reservasi, payroll.
- Isi Appointment dan Whatsapp memang terkunci (tidak ada fiturnya).
