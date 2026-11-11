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

## /karyawan/hak-akses — 2026-11-11
- Butuh: Dukungan peran kustom dan penyimpanan matriks hak akses granular (dashboard + POS) di database beserta metode DataLayer (`listRoles`, `saveRolePermissions`, `deleteRole`), serta dukungan mengaitkan `role_id` kustom ke karyawan (saat ini `Employee['role']` terbatas pada `'owner' | 'manager' | 'cashier'`).
- Untuk: Layar `/karyawan/hak-akses` (A51) agar peran baru/duplikasi dan perubahan izin per modul dashboard serta aksi kasir tersimpan lintas perangkat dan menegakkan izin di server (RLS) maupun kasir.
- Bentuk yang diinginkan:
  - Tabel `roles` (`id`, `org_id`, `name`, `description`, `is_built_in`, `base_role`, `owner_app_access`, `created_at`)
  - Tabel `role_dashboard_perms` (`role_id`, `module_id`, `level: 'none' | 'read' | 'write'`)
  - Tabel `role_pos_perms` (`role_id`, `permission_id`, `level: 'allow' | 'approve' | 'deny'`)
  - Metode di `DataLayer`: `listRoles(): Promise<RoleDefinition[]>`, `saveRolePermissions(role: RoleDefinition): Promise<RoleDefinition>`, `deleteRole(roleId: string): Promise<void>`
- Sementara: Disimpan di `localStorage` peramban (kunci `'cg-role-permissions'`) dengan lencana "Pratinjau — belum tersambung server"; jumlah karyawan terpasang untuk peran bawaan dihitung langsung dari `data.listManagedEmployees()`.

## /deposit & /laporan/deposit (A53 — Paket Deposit & Laporan Deposit) — 2026-11-11
- Butuh: Skema database dan metode `DataLayer` untuk paket deposit prabayar, penjualan paket deposit, dan pengembalian (refund) saldo deposit pelanggan.
- Untuk: Layar `/deposit` (katalog paket deposit) dan `/laporan/deposit` (tab Penjualan Deposit & Refund Deposit).
- Bentuk yang diinginkan:
  - Tabel `deposit_packages` (`id`, `org_id`, `nama`, `nominal_didapat`, `harga_jual`, `aktif`, `created_at`)
  - Tabel `deposit_sales` (`id`, `org_id`, `customer_id`, `package_id`, `nominal`, `harga_jual`, `metode_bayar`, `order_id`, `created_at`)
  - Tabel `deposit_refunds` (`id`, `org_id`, `customer_id`, `nominal`, `alasan`, `authorized_by`, `created_at`)
  - Metode `DataLayer`:
    - `listDepositPackages(): Promise<DepositPackage[]>`
    - `saveDepositPackage(input: { id?: string; name: string; creditAmount: number; salePrice: number; isActive: boolean; note?: string }): Promise<DepositPackage>`
    - `listDepositSales(range: { from: string; to: string }): Promise<DepositSaleRecord[]>`
    - `listDepositRefunds(range: { from: string; to: string }): Promise<DepositRefundRecord[]>`
- Sementara: Dibangun dengan data contoh statis di memori komponen (tidak memakai `localStorage` untuk data laporan) berlabel **"Pratinjau tampilan — menunggu dukungan server"**.


