# Permintaan untuk Claude (sisi server/database)

Antigravity menulis di sini bila sebuah layar butuh data atau aksi yang belum ada di DataLayer. Claude membacanya tiap giliran,
membuat migrasi + fungsi server + implementasi `supabase.ts`, lalu mengabari. Format:

```
## <nama layar> — <tanggal>
- Butuh: <data/aksi>
- Untuk: <layar dan alasan>
- Bentuk yang diinginkan: <contoh JSON atau tipe TypeScript>
- Sementara: <apa yang dikerjakan dengan data palsu / ditunda>
```

## /keuangan/transfer — 2026-11-10
- Butuh: Penanda atau `sourceType: 'transfer'` pada jurnal hasil aksi "Pindah saldo kas dan bank".
- Untuk: Layar `/keuangan/transfer` agar dapat membedakan secara pasti transaksi pemindahan kas/bank dari jurnal manual biasa tanpa mengandalkan teks deskripsi.
- Bentuk yang diinginkan: `JournalSource` mencakup `'transfer'` saat disimpan lewat dialog pindah saldo, sehingga dapat difilter lewat `data.listJournal({ sourceType: 'transfer' })`.
- Sementara: Layar membaca jurnal manual (`sourceType: 'manual'`) dan menyaring berdasarkan deskripsi / kata kunci "Pindah saldo", "Transfer", atau "Mutasi kas".

## /laporan/terminal — 2026-11-11
- Butuh: Field `deviceCode?: string` atau `deviceId?: string` pada antarmuka `Order` (dan kolom `device_code` pada tabel `orders` / implementasi DataLayer).
- Untuk: Layar Laporan Penjualan per Terminal / Perangkat (A40) untuk mengelompokkan transaksi, total penjualan, rata-rata, kas masuk tunai/non-tunai, dan jam transaksi per perangkat/terminal kasir.
- Bentuk yang diinginkan: `deviceCode: string` pada antarmuka `Order` (misal 'A', 'B', 'POS-01').
- Sementara: Tugas A40 dilewati sesuai instruksi spesifikasi A40 ("Bila tidak ada di tipe Order, JANGAN mengubah data.ts: tulis temuanmu di PROGRESS.md... lalu lewati tugas ini dan lanjut ke tugas berikutnya").

## /pengaturan/struk — 2026-11-11 (diperbarui 2026-11-11, S142)
- Status: butir #3 (lebar kertas bawaan) SUDAH dikerjakan Claude (S142) — `ReceiptTemplate.defaultPaperWidth` ('58'|'80', bawaan '80') memakai kolom jsonb `receipt_template` yang sudah ada (migrasi 0031, tanpa kolom baru); kasir di kasir (apps/pos) memakai bawaan outlet ini sampai kasir pernah memilih manual di perangkatnya sendiri (localStorage tetap menang setelah itu). Kontrol "Lebar Kertas Bawaan" sudah ada di editor `/pengaturan/struk`. Sama seperti seluruh `ReceiptTemplate` lain, ini baru aktif di produksi setelah migrasi 0031 diterapkan (menunggu persetujuan Louis) — bukan migrasi baru, hanya menunggu keputusan yang sama yang sudah tertunda sejak S135.
- Butuh (SISA, belum dikerjakan): Kolom database dan dukungan DataLayer untuk:
  1. `receipt_logo_url` (unggah/tautan gambar logo outlet untuk dicetak di kepala struk thermal) — butuh bucket penyimpanan gambar (Supabase Storage), lebih besar dari sekadar kolom.
  2. `receipt_show_qr` (opsi cetak kode QR pembayaran dinamis di struk) — butuh integrasi metode pembayaran QRIS nyata lebih dulu (lihat tugas A59 metode pembayaran); menampilkan saklar sebelum ada sumber QR yang benar hanya akan jadi saklar kosong.
- Untuk: Layar `/pengaturan/struk` (A47 editor tampilan struk pelanggan).
- Bentuk yang diinginkan: Kolom di tabel `outlet_options`/Supabase Storage bucket, atau properti dalam `OutletOptions` / `ReceiptTemplate`.
- Sementara: Ditampilkan sebagai opsi nonaktif berlabel "Segera" di tab Header dan Body pada editor struk.
## /laporan/teratas (Laba kotor per produk) — 2026-11-11
- Butuh: Agregasi laba kotor per produk (penjualan - HPP historis transaksi) dalam rentang tanggal tertentu.
- Untuk: Kartu "10 Laba Kotor per Produk Teratas" di layar `/laporan/teratas`.
- Bentuk yang diinginkan: Metode di DataLayer `getTopGrossProfitProducts(span: { from: string; to: string }, limit?: number): Promise<{ productId: string; name: string; revenue: number; cogs: number; grossProfit: number; marginPct: number }[]>`.
- Sementara: Kartu ditampilkan nonaktif dengan lencana "Segera" dan penjelasan bahwa perhitungan HPP historis per transaksi penjualan sedang disiapkan di server.

## /pengaturan/denah (A52 — Mode Denah Kustom & Pengaturan Per Meja) — 2026-11-11
- Butuh:
  1. Mode tampilan denah per outlet (`tableLayoutMode`: `'grid' | 'custom'`, bawaan `'grid'`) pada pengaturan outlet (`outlet_options` / `OutletOptions`).
  2. Koordinat dan pengaturan tambahan per meja pada tabel `dining_tables` & `DiningTable`:
     - `posX?: number` (`pos_x`, 0-100%)
     - `posY?: number` (`pos_y`, 0-100%)
     - `timeLimitEnabled?: boolean`, `timeLimitMinutes?: number` (`time_limit_minutes`)
     - `reminderEnabled?: boolean`, `reminderBeforeMinutes?: number` (`reminder_before_minutes`)
     - `minBillEnabled?: boolean`, `minBill?: number` (`min_bill`)
     - `labelEnabled?: boolean`, `label?: string` (maks 20 huruf)
- Untuk: Layar `/pengaturan/denah` (pemilih Grid Meja vs Denah Kustom dengan drag posisi dan 4 toggle pengaturan per meja).
- Bentuk yang diinginkan:
  - Perluasan `OutletOptions` + `saveOutletOptions` (atau `updateFloorMode(outletId, mode)`),
  - Perluasan `saveTable` / metode baru `saveTableLayout(positions: { tableId: string; xPct: number; yPct: number }[])` dan `saveTableSettings(tableId: string, settings: TableSettings)`.
- Sementara: Pilihan mode, koordinat kustom, dan 4 pengaturan per meja disimpan sementara di `localStorage` dengan lencana "Pratinjau".


