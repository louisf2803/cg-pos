# Peta jalan Gelombang A (94 fitur, 17 selesai) — disusun reviewer, 12 Nov 2026

Sumber: `docs/wave.csv` (baris `A`), `docs/features.csv`, `docs/KEPUTUSAN-FITUR-2026-11-12.md`. Setiap batch punya sisi server (Claude: migrasi, DataLayer, tes SQL; migrasi ke produksi hanya setelah Louis setuju) lalu sisi layar (Antigravity). Dikerjakan berurutan; satu batch = satu atau dua PR kecil.

Aturan yang berlaku: QRIS hanya menampilkan "Payment belum tersambung" (tanpa DOKU); tidak ada struk WhatsApp/email/SMS; tidak ada bayar dengan saldo deposit.

## Batch 1 — SDM lanjutan (pengembangan dari absensi dan payroll yang sudah ada)
Fitur: Pengaturan akses absensi, Radius absensi, Tingkat jabatan, Organisasi, Tipe karyawan, Quick PIN karyawan, Kirim notifikasi ke karyawan.
- Claude: tabel `job_levels`, `org_units`, `employee_types`, kolom radius lokasi di outlet, aturan akses absensi per peran. Quick PIN: JANGAN simpan PIN mentah (AGENTS.md #4), hanya hash.
- Antigravity: layar pengaturan di `/karyawan/*`, peta radius sederhana (tanpa layanan peta pihak ketiga).
- Perlu jawaban Louis (tulis di `MAJOO-VERIFICATION.md`): apa beda Quick PIN dengan PIN biasa di Majoo; apakah radius memblokir absen atau hanya menandai.

## Batch 2 — Persetujuan dan tagihan
Fitur: Alur persetujuan pembelian, Alur persetujuan keuangan, Daftar mitra, Pencatatan biaya dan tagihan rutin, Permintaan barang, Pemetaan harga beli manual dan terakhir.
- Claude: tabel persetujuan (status, penyetuju), `partners`, `recurring_bills` + penjadwal, `stock_requests`, tabel pemetaan harga beli.
- Antigravity: daftar + detail + tombol setuju/tolak, kalender tagihan rutin.

## Batch 3 — Produksi dan harga
Fitur: Produksi stok dengan acuan produksi, Master resep dan kategori catatan, Penjadwalan perubahan harga dan resep (harga berdasarkan waktu), Daftar harga ojek online, Hak kasir mengubah harga jual (tinjau ulang status: sisi server sudah ada di 0034).
- Claude: `production_orders` (potong bahan, tambah barang jadi), jadwal resep, daftar harga per kanal.
- Perlu jawaban Louis: urutan langkah produksi di Majoo (artikel 82 dan 84 belum dibaca).

## Batch 4 — Penjualan B2B dan keuangan
Fitur: Faktur penjualan dengan termin, Jadikan Invoice dari layar bayar, Penawaran/pesanan/pengiriman/penerimaan penjualan, Laporan uang muka, Manajemen aset tetap, Perbandingan laporan antar outlet, Pengaturan non-tunai per outlet.
- Claude: skema faktur penjualan + termin + jurnal, dokumen B2B berantai, aset tetap + penyusutan.
- Besar: pecah jadi minimal tiga PR (faktur, rantai dokumen, aset).

## Batch 5 — Meja, reservasi, laporan
Fitur: Denah meja dari gambar, Laporan reservasi dan utilisasi, Beli kampanye marketing, Gabung meja dan sisa pesanan (ujung ke ujung), Server lokal/antrean offline per perangkat.
- Sebagian besar UI di atas DataLayer yang ada; Antigravity boleh mulai dari sini tanpa menunggu server.

## Batch 6 — Sisa fitur "partial"
46 fitur berstatus partial: tiap satu perlu diuji ujung ke ujung (fungsi, bukan sekadar tombol) dan diberi bukti 390 dan 1280 px sebelum jadi `yes`. Urutan: Kasir dan Pembayaran, Meja dan Dapur, Inventori, Laporan, Pelanggan, Pengaturan. Catatan status lama di kolom `notes` `features.csv` sering sudah usang; reviewer menilai ulang.

## Ditunda sesuai keputusan Louis
- Layar QRIS dan laporan settlement QRIS: antarmuka saja, pesan "Payment belum tersambung".
- Akun piutang gateway dan biaya gateway: ikut nanti saat payment tersambung.
