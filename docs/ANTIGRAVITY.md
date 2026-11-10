# Panduan pembagian tugas: Claude (arsitek) dan Antigravity (pengerja UI)

Tujuan: hemat token Claude. Claude mengerjakan yang **berisiko dan rumit** (database, keamanan, uang, sinkronisasi, produksi, tinjau hasil).
Antigravity mengerjakan yang **berulang dan terkunci polanya** (halaman dashboard di atas DataLayer yang sudah ada, UI kasir sederhana, tes, ekspor/impor sisi klien).
Aturan lengkap untuk agen ada di `AGENTS.md` (repo root) — Antigravity otomatis membacanya; tetap tempel Prompt 0 di bawah pada sesi pertama.

## 1. Pembagian

| Wilayah | Siapa | Alasan |
| --- | --- | --- |
| Migrasi SQL, fungsi server (SECURITY DEFINER), RLS, tes SQL, uji rollback + penerapan ke produksi | **Claude** | Salah sedikit = data uang/stok rusak; butuh akses Supabase |
| `packages/shared/src/data.ts`, `supabase.ts`, sync_push/offline | **Claude** | Kontrak data; menjaga keamanan dan idempotensi |
| Halaman dashboard di atas metode DataLayer yang sudah ada | **Antigravity** | Pola sudah baku (lihat `app/keuangan/kas`, `app/dapur`) |
| UI kasir yang tidak mengubah bentuk data pesanan | **Antigravity** | Hanya tampilan/interaksi |
| Impor/ekspor CSV, cetak, tampilan | **Antigravity** | Sisi klien |
| Tes Playwright, tangkapan layar, perapian a11y/responsif | **Antigravity** | Mekanis |
| Tinjauan PR, perbaikan keamanan, penggabungan | **Claude** | Satu pintu mutu |

### Daftar yang Claude pegang (jangan diberikan ke Antigravity)
Laporan kasir dan tutup toko (butuh daftar shift dari server) · pembayaran komplimen · resep/BOM, HPP per bahan, satuan ganda,
batasi penjualan saat stok habis · transfer stok · log aktivitas · rekonsiliasi non-tunai · reservasi · jual item bebas (custom amount) dan produk layanan di sisi server ·
kirim ke dapur per baris terpilih · kode otorisasi void · rekening outlet · riwayat refund per transaksi di server (bila perlu fungsi baru) · penerapan migrasi 0011 dan hal keamanan lain.

### Daftar untuk Antigravity (urut, tiap butir = 1 PR)
| # | Tugas | Menaikkan skor (perkiraan) |
| --- | --- | --- |
| A1 | Impor dan ekspor produk (CSV) — `/produk/impor` | +4 (2 baris) |
| A2 | Laporan pajak dan biaya layanan — `/laporan/pajak` | +2 |
| A3 | Laporan Void dan Laporan Refund + riwayat refund di detail transaksi — `/laporan/void`, `/laporan/refund` | +4 |
| A4 | Laporan jenis bayar, jenis order, per periode (pecahan dari laporan penjualan yang ada) | +1–2 |
| A5 | Analisa jam ramai — `/laporan/jam-ramai` | +1 |
| A6 | Dashboard keuangan (widget laba rugi, arus kas, saldo kas, umur hutang) — `/keuangan` | +1 |
| A7 | Saldo awal dan Daftar transfer — `/keuangan/saldo-awal`, `/keuangan/transfer` | +0–1 |
| A8 | Kasir: catatan per item dan per pesanan | +2 |
| A9 | Kasir: filter kategori khusus (Semua, Favorit, Paket, Promo) dan mode cari SKU/scan | +4 |
| A10 | Dapur: mode layar penuh, bunyi notifikasi pesanan baru, cetak struk dapur (checker) | +1 |
| A11 | Laporan lain yang cukup dari data penjualan: Meja, Produk, Persediaan, Promo dan loyalti, Pelanggan | +2–3 |

Hitungan: skor sekarang 47,2; target ≥ 60 butuh sekitar +39 bobot. A1–A11 menyumbang kira-kira +22–27 bobot sendirian;
sisanya dari pekerjaan Claude (komplimen, resep/BOM, batasi stok, log aktivitas, reservasi, laporan kasir dan tutup toko).

## 2. Alur kerja

1. Siapkan: `git clone https://github.com/louisf2803/cg-pos` → `pnpm install`. Buka folder di Antigravity.
2. Tempel **Prompt 0** (sekali per sesi/agen). Lalu beri **satu** prompt tugas (A1, A2, …).
3. Antigravity bekerja di cabang `ag/<tugas>` dan membuka PR ke `main` (atau kamu kirim hasilnya).
4. Kembali ke Claude: "tinjau PR ag/a1". Claude memeriksa keamanan/pola, menjalankan semua pengecekan, memperbaiki, menggabungkan, dan menyambungkan ke data nyata bila perlu.
5. Bila Antigravity menulis di `docs/REQUESTS-FOR-CLAUDE.md`, minta Claude "kerjakan permintaan di REQUESTS-FOR-CLAUDE".
6. Jangan jalankan dua agen di berkas yang sama (konflik). `nav.ts` sering disentuh: gabungkan PR satu per satu.

## 3. Prompt 0 — aturan dasar (tempel dulu)

```
Kamu mengerjakan CG POS, POS + dashboard web (clean room, kata dan merek sendiri) di repo ini.
Baca AGENTS.md di root dan ikuti persis. Ringkasnya: (1) jangan salin apa pun dari Majoo atau situs lain, tulis semua teks sendiri dalam Bahasa Indonesia;
(2) jangan menyentuh packages/db, schema public, packages/shared/src/data.ts, supabase.ts; butuh data baru -> tulis di docs/REQUESTS-FOR-CLAUDE.md;
(3) jangan minta/simpan PIN atau kata sandi, jangan aktifkan DOKU; (4) pakai kelas/token di packages/ui, bukan warna atau piksel mentah;
(5) satu tugas = satu cabang ag/<tugas> = satu PR kecil.
Pelajari dulu contoh halaman yang sudah rapi: apps/dashboard/src/app/keuangan/kas/page.tsx dan apps/dashboard/src/app/dapur/page.tsx,
serta apps/dashboard/src/lib/nav.ts (tandai layar yang kamu bangun dengan built: true).
Sebelum selesai wajib lolos: pnpm -r typecheck; pnpm -F @cgpos/shared test; pnpm -F @cgpos/dashboard build (dan pnpm -F @cgpos/pos build bila menyentuh kasir);
lalu uji di peramban pada lebar 390 px dan 1280 px: tanpa galat konsol, tanpa gulir mendatar, ada keadaan memuat/kosong/galat. Lampirkan tangkapan layar di PR.
Jawab "siap" bila paham, lalu tunggu tugas.
```

## 4. Prompt tugas

> Tiap prompt berdiri sendiri setelah Prompt 0. Kalau Antigravity tidak menemukan metode DataLayer yang dibutuhkan, ia berhenti dan menulis permintaan, bukan mengarang.

### A1 — Impor dan ekspor produk
```
Tugas A1: bangun halaman /produk/impor di apps/dashboard (dan ubah item menu "Impor dan ekspor produk" di nav.ts jadi built: true; tambahkan juga tombol Impor/Ekspor di halaman /produk yang mengarah ke sana).
Ekspor: tombol "Unduh CSV" memakai data.listCatalog({ includeInactive: true }); kolom: SKU, Nama, Kategori, Harga jual, Aktif (ya/tidak). Gunakan pemisah koma, UTF-8 dengan BOM agar Excel membaca benar, nama berkas produk-YYYY-MM-DD.csv.
Impor: pilih berkas CSV (kolom yang sama), parse di klien (tanpa pustaka berat; tangani tanda kutip dan koma di dalam sel), tampilkan pratinjau tabel dengan status tiap baris (Baru / Perbarui berdasarkan SKU / Salah + alasan), batas 2000 baris, lalu tombol "Terapkan" yang memanggil data.saveCatalogProduct per baris yang valid (berurutan, dengan penghitung kemajuan, bisa dibatalkan). Ringkasan akhir: berhasil, dilewati, gagal.
Validasi: nama wajib, harga bilangan bulat >= 0, SKU unik di dalam berkas, kategori yang belum ada ditandai salah (jangan membuat kategori otomatis). Sediakan tombol "Unduh contoh berkas".
Tambahkan tes unit untuk fungsi parse/validasi di packages/shared/test (taruh fungsinya di packages/shared/src/csv.ts dan ekspor lewat index.ts) — ini satu-satunya perubahan yang boleh di packages/shared.
Cek akhir sesuai Prompt 0. Perbarui baris "Impor dan ekspor produk (spreadsheet)" dan "Impor produk massal dari file" di replica/features.csv menjadi partial/yes dengan catatan jujur.
```

### A2 — Laporan pajak dan biaya layanan
```
Tugas A2: bangun /laporan/pajak (item menu "Pajak dan biaya layanan"). Pakai komponen range-picker.tsx dan pola halaman /laporan yang sudah ada.
Data: data.salesSummary(range) dan data.listOrders({ status:'paid', from, to, all:true }). Tampilkan kartu: Total pajak, Total biaya layanan, Penjualan kena pajak, Jumlah transaksi; tabel per hari (tanggal, penjualan, pajak, biaya layanan) dengan total di bawah; tabel per jenis pajak bila ada rincian pajak di pesanan (cek tipe Order di packages/shared). Tombol "Unduh CSV".
Jangan menghitung ulang pajak; hanya menjumlah nilai yang tersimpan di pesanan. Keadaan kosong: "Belum ada transaksi pada rentang ini."
Cek akhir sesuai Prompt 0. Perbarui baris "Laporan pajak dan service charge" di replica/features.csv.
```

### A3 — Laporan void, laporan refund, riwayat refund
```
Tugas A3: bangun /laporan/void dan /laporan/refund. Void = pesanan berstatus void (data.listOrders dengan status 'void'; tampilkan nomor, waktu, kasir, alasan, yang menyetujui, total). Refund = data.listRefundsBetween(range) (nomor pesanan, waktu, alasan, jumlah, dikembalikan ke stok ya/tidak, metode).
Fitur: rentang tanggal, kotak cari nomor/alasan, filter kasir, baris yang bisa dibuka untuk rincian (dialog), kartu ringkasan (jumlah dan nilai), Unduh CSV.
Lalu di halaman detail transaksi yang sudah ada (cari di apps/dashboard/src/app/laporan/penjualan) tambahkan bagian "Riwayat refund" memakai data.listRefunds(orderId): daftar refund pesanan itu beserta waktu, alasan, dan barangnya.
Cek akhir sesuai Prompt 0. Perbarui baris "Laporan void di POS dengan filter dan detail" dan "Riwayat refund per transaksi" di replica/features.csv.
```

### A4 — Jenis bayar, jenis order, per periode
```
Tugas A4: bangun /laporan/jenis-bayar, /laporan/jenis-order, /laporan/periode dari data.salesSummary(range) (sudah memuat rincian per metode bayar dan jenis pesanan; periksa tipe SalesSummary). Setiap halaman: rentang tanggal, kartu ringkasan, tabel dengan persentase terhadap total, batang proporsi sederhana (HTML/CSS, tanpa pustaka grafik), Unduh CSV.
Per periode: pilihan pengelompokan Harian/Mingguan/Bulanan; hitung di klien dari data.listOrders.
Cek akhir sesuai Prompt 0; tandai built: true di nav.ts.
```

### A5 — Analisa jam ramai
```
Tugas A5: bangun /laporan/jam-ramai: dari data.listOrders (paid, rentang 30 hari default, bisa diganti) kelompokkan transaksi dan penjualan per jam (00–23, zona Asia/Jakarta) dan per hari dalam minggu. Tampilkan peta panas hari x jam (tabel CSS dengan intensitas dari token warna, sertakan angka dan label teks agar tidak bergantung warna saja), dan daftar 3 jam teramai. Sertakan pembaca layar: setiap sel punya aria-label "Senin 10.00: 12 transaksi".
Cek akhir sesuai Prompt 0; perbarui baris "Analisa jam ramai" di replica/features.csv.
```

### A6 — Dashboard keuangan
```
Tugas A6: bangun /keuangan (item "Dashboard keuangan"). Rentang default bulan ini. Kartu: Laba bersih (data.incomeStatement), Saldo kas dan bank (data.trialBalance, akun kas/bank), Arus kas masuk dan keluar (data.cashFlow), Total hutang dan hutang jatuh tempo (data.payablesAging). Tabel: 5 biaya terbesar (dari incomeStatement). Tiap kartu punya tautan ke laporan terkait (/keuangan/laporan?tab=…, /keuangan/kas). Hanya bacaan; peringatan bila neraca tidak seimbang. Perhatikan: fungsi laporan ini hanya untuk pemilik/admin — tampilkan pesan "Hanya pemilik dan admin yang dapat melihat" bila galat izin.
Cek akhir sesuai Prompt 0.
```

### A7 — Saldo awal dan daftar transfer
```
Tugas A7: bangun /keuangan/saldo-awal (daftar jurnal berjenis saldo awal: data.listJournal dengan sourceType yang sesuai; tombol "Saldo awal baru" membuka dialog jurnal baru jenis saldo awal yang sudah ada di app/keuangan/jurnal — gunakan ulang komponennya, jangan menyalin) dan /keuangan/transfer (daftar pindah saldo kas/bank: jurnal manual hasil dialog "Pindah saldo" di app/keuangan/kas). Pelajari app/keuangan/jurnal dan app/keuangan/kas terlebih dulu. Bila daftar tidak bisa dibedakan dari jurnal lain dengan data yang ada, tulis permintaan di docs/REQUESTS-FOR-CLAUDE.md.
Cek akhir sesuai Prompt 0.
```

### A8 — Kasir: catatan per item dan per pesanan
```
Tugas A8: di apps/pos/src/screens/Register.tsx tambahkan (1) catatan per item: ketuk baris di keranjang -> kolom "Catatan" (maks 120 huruf) dengan chip catatan cepat yang bisa diatur (mis. "Tanpa gula", "Pedas", simpan daftar di localStorage dengan try/catch); (2) catatan pesanan (maks 200 huruf) di panel pesanan. Bentuk data SUDAH ada: OrderItem.note dan Order.note di packages/shared (periksa tipenya; jangan ubah). Catatan harus tercetak di struk (Receipt.tsx) dan tampil di layar dapur yang sudah membaca note.
Uji di 390 px dan 1280 px; pastikan keranjang yang panjang tidak meluap. Tambahkan tes pada logika yang kamu pindahkan ke packages/shared bila ada.
Cek akhir sesuai Prompt 0 (build POS wajib). Perbarui baris "Catatan per item atau per order (kategori catatan)".
```

### A9 — Kasir: filter kategori khusus dan mode SKU/scan
```
Tugas A9: di Register.tsx (1) tambahkan chip filter di atas grid produk: Semua, Favorit, Paket, Promo selain kategori biasa. "Favorit" = produk yang paling sering dijual perangkat ini (hitung di klien dari pesanan lokal, simpan penanda di localStorage dengan try/catch, bisa diberi bintang manual); "Paket" = data.listBundles; "Promo" hanya muncul bila ada data.listPromotions({activeOnly:true}). (2) Mode "Cari/scan": kolom pencarian yang fokus otomatis; ketik atau scan pemindai barcode (pemindai bertindak seperti keyboard + Enter) -> bila SKU persis cocok satu produk, langsung masuk keranjang dan kolom dikosongkan; bila banyak cocok, tampilkan daftar. Pastikan tidak mencuri fokus saat dialog terbuka.
Jangan mengubah bentuk data pesanan. Uji di 390 dan 1280 px, build POS wajib.
Perbarui baris "Filter kategori khusus…" dan "Mode SKU untuk ritel (cari dan scan kode)".
```

### A10 — Dapur: layar penuh, bunyi, struk dapur
```
Tugas A10: di apps/dashboard/src/app/dapur/page.tsx tambahkan (1) tombol "Layar penuh" (Fullscreen API dengan fallback pesan); (2) opsi "Bunyi pesanan baru" (default mati, tersimpan di localStorage dengan try/catch) yang membunyikan nada pendek lewat Web Audio saat ada tiket baru setelah pemuatan pertama — tanpa berkas audio; (3) tombol "Cetak struk dapur" per tiket yang membuka dialog cetak peramban berisi: nomor pesanan, meja, jam kirim, daftar item (jumlah x nama), catatan dan tambahan; lebar 58/80 mm mengikuti gaya apps/pos/src/screens/Receipt.tsx (pelajari cara cetaknya, jangan salin teks apa pun dari luar). Tanpa harga.
Cek akhir sesuai Prompt 0. Perbarui baris "Cetak bill sebelum bayar dan struk dapur atau checker".
```

### A11 — Laporan lain dari data penjualan
```
Tugas A11: bangun /laporan/meja (penjualan per meja: jumlah pesanan, total, rata-rata tamu, rata-rata lama makan bila waktu tersedia), /laporan/produk (terlaris per jumlah dan per nilai, per kategori), /laporan/persediaan (data.listStock: nilai persediaan, stok menipis/habis/minus), /laporan/promo-loyalti (diskon yang diberikan per jenis, poin diberikan dan ditukar dari data.listLoyaltyLedger bila cukup), /laporan/pelanggan (pelanggan teratas dari data.listCustomers + listOrders). Tiap halaman: rentang tanggal, kartu ringkasan, tabel, Unduh CSV, keadaan kosong. Hanya data yang sudah ada; yang tidak ada -> catat di docs/REQUESTS-FOR-CLAUDE.md.
Kerjakan satu per satu, satu PR tiap laporan. Cek akhir sesuai Prompt 0.
```

## 5. Setelah Antigravity selesai satu PR

Kirim ke Claude: `tinjau PR ag/<tugas>` (atau tempel tautan/diff). Claude akan: memeriksa kepatuhan clean room dan keamanan, menjalankan pengecekan, memperbaiki, menyambungkan ke data nyata bila perlu, memperbarui `features.csv` + `docs/PROGRESS.md`, lalu commit dan push.
