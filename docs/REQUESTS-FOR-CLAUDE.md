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

## /keuangan/transfer — 2026-11-10 (diperbarui 2026-11-11, S146)
- Status: Sisi server SUDAH SIAP (migrasi `0032_journal_transfer_kind.sql`, dibuat & diuji S146) — `pos.journal_manual_post` sekarang menerima `p_kind = 'transfer'` (nomor dokumen `PS-...`, `source_type = 'transfer'`), dan `pos.journal_reverse` bisa membalik jurnal jenis ini seperti jurnal manual/saldo awal. `JournalInput.kind` di `packages/shared/src/finance.ts` sudah diperluas jadi `'manual' | 'opening' | 'transfer'`. Diuji lokal: `pnpm -r typecheck`, `pnpm -F @cgpos/shared test` (396 lulus), `pnpm -F @cgpos/dashboard build`, serta suite SQL lokal lengkap (`packages/db/tests/run.sh`, termasuk tes baru `19_journal_transfer.sql`) — SEMUA TES LULUS.
- **BELUM diterapkan ke database produksi** — menunggu persetujuan Louis seperti migrasi 0028/0031 sebelumnya. JANGAN ubah dialog "Pindah saldo kas dan bank" (app/keuangan/kas) untuk mengirim `kind: 'transfer'` sebelum migrasi 0032 diterapkan ke produksi — server akan menolak dengan galat "invalid kind" dan memutus fitur pindah saldo nyata sampai diterapkan. Dialog itu tetap mengirim `kind: 'manual'` untuk saat ini.
- Setelah Louis menyetujui penerapan 0032 ke produksi, langkah lanjutan (boleh Antigravity atau Claude, satu PR kecil): (1) ubah dialog "Pindah saldo" supaya mengirim `kind: 'transfer'`; (2) ubah layar `/keuangan/transfer` agar menyaring lewat `sourceType === 'transfer'` (bukan lagi tebak-tebakan kata kunci deskripsi).
- Untuk: Layar `/keuangan/transfer` agar dapat membedakan secara pasti transaksi pemindahan kas/bank dari jurnal manual biasa tanpa mengandalkan teks deskripsi.
- Sementara: Layar membaca jurnal manual (`sourceType: 'manual'`) dan menyaring berdasarkan deskripsi / kata kunci "Pindah saldo", "Transfer", atau "Mutasi kas" — tidak berubah sampai 0032 diterapkan.

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

## /karyawan/hak-akses — 2026-11-11 (diperbarui 2026-11-11, verifikasi langsung ke Majoo asli)
- Status: Claude memverifikasi LANGSUNG alur asli Majoo (`dashboard.majoo.id`, akun Coffee Ground, dengan izin langsung Louis dalam sesi berjalan) dan menemukan strukturnya jauh lebih rinci dari skema di bawah ini yang tadinya diminta Antigravity. Lihat `docs/queue/A61.md` (tugas prioritas, dikerjakan Antigravity SEBELUM A54-A60) untuk detail lengkap alur UI 4-langkah yang harus ditiru. Skema DataLayer di bawah ini SUDAH DIPERBARUI mengikuti temuan itu — gantikan skema lama (yang hanya `level: 'none'|'read'|'write'` per modul) dengan yang berikut:
- Butuh: Dukungan peran kustom dan penyimpanan matriks hak akses granular (dashboard + POS, PER FITUR dan PER AKSI — bukan cuma per modul) di database, flag otorisasi-sebagai-atasan terpisah dari izin melakukan aksi sendiri, halaman awal login per peran, serta dukungan mengaitkan `role_id` kustom ke karyawan (saat ini `Employee['role']` terbatas pada `'owner' | 'manager' | 'cashier'`).
- Untuk: Layar `/karyawan/hak-akses` (A51/A61) agar peran baru/duplikasi dan perubahan izin granular tersimpan lintas perangkat dan menegakkan izin di server (RLS) maupun kasir, sesuai alur wizard 4-langkah Majoo asli (Informasi → Hak Akses Dashboard → Hak Akses POS → Pengaturan Lainnya).
- Bentuk yang diinginkan:
  - Tabel `roles` (`id`, `org_id`, `name`, `description`, `is_built_in`, `base_role`, `owner_app_access` [hanya boleh diubah oleh user dengan peran Owner — tegakkan di RLS/fungsi server, bukan cuma UI], `default_dashboard_page`, `default_pos_page`, `can_authorize_refund` bool, `can_authorize_void` bool, `can_authorize_complimentary` bool, `created_at`)
  - Tabel `role_dashboard_perms` (`role_id`, `module_id`, `enabled` bool — toggle master modul; "jika false, seluruh fitur di modul itu tertutup")
  - Tabel `role_dashboard_feature_perms` (`role_id`, `module_id`, `feature_id`, `sub_feature_id`, `can_view` bool, `can_create` bool, `can_edit` bool, `can_delete` bool, `can_void` bool — grid granular per sub-fitur, meniru "Detail Fitur" Majoo asli; kolom yang tidak relevan untuk sub-fitur tertentu boleh selalu `false`/diabaikan di UI)
  - Tabel `role_pos_perms` (`role_id`, `module_id`, `feature_id`, `sub_feature_id`, kolom sama seperti di atas) — sisi POS punya katalog modul/fitur SENDIRI (beda dari sisi dashboard: mis. Kasir, Penjualan, Laporan, Absensi, Inventori, Pengaturan)
  - Metode di `DataLayer`: `listRoles(): Promise<RoleDefinition[]>`, `saveRolePermissions(role: RoleDefinition): Promise<RoleDefinition>`, `deleteRole(roleId: string): Promise<void>`
- Sementara: Disimpan di `localStorage` peramban (kunci `'cg-role-permissions'`) dengan lencana "Pratinjau — belum tersambung server"; jumlah karyawan terpasang untuk peran bawaan dihitung langsung dari `data.listManagedEmployees()`. A61 akan merombak bentuk data `localStorage` ini mengikuti skema baru di atas (dengan fungsi migrasi dari bentuk lama supaya data pengguna lama tidak hilang).
- **Di luar lingkup untuk saat ini (jangan dikerjakan tanpa tanya Louis dulu)**: Majoo asli juga punya 3 mode hak akses lain di luar "Hak Akses Khusus" di atas — **Hak Akses Departemen** (batasi halaman laporan per departemen/kategori/produk), **Hak Akses Jenis Order** (batasi laporan per jenis order/platform), **Hak Akses per Periode** (batasi akses halaman berdasar tanggal awal periode yang diizinkan). Dicatat di `docs/PROGRESS.md` S161 sebagai temuan, menunggu keputusan Louis apakah perlu dibangun (cakupannya besar, masing-masing butuh skema dan wizard terpisah).

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

## /deposit & /laporan/deposit (A53 — Paket Deposit & Laporan Deposit) — 2026-11-11 (diperbarui 2026-11-11, verifikasi langsung ke Majoo asli)
- Status verifikasi: Claude memeriksa langsung halaman kebijakan deposit asli Majoo (`dashboard.majoo.id/deposit-setting`, akun Coffee Ground) dan menemukan model deposit asli LEBIH KAYA dari skema A53 yang sudah dibangun:
  1. Majoo membedakan **dua jenis deposit**: **"Deposit Saldo"** (saldo uang, sama seperti yang sudah dimodelkan A53) DAN **"Deposit Produk"** (pelanggan membayar di muka untuk KUOTA PRODUK tertentu, mis. "10x kopi", bukan nominal uang) — skema `deposit_packages` di bawah perlu kolom jenis supaya kedua jenis ini bisa dibedakan.
  2. Setiap deposit (baik Saldo maupun Produk) punya **masa berlaku/kedaluwarsa** ("Perpanjangan & Reaktivasi Deposit" khusus mengelola deposit yang masa berlakunya aktif/sudah habis) — kolom `expires_at` perlu ditambahkan di `deposit_sales`.
  3. Refund dibedakan menjadi dua mode terpisah yang masing-masing bisa diatur independen: **refund untuk deposit yang BELUM PERNAH dipakai** vs **refund untuk deposit yang SUDAH PERNAH dipakai sebagian** — tiap mode punya pilihan kebijakan sendiri: **"Otorisasi Saat Ini"** (langsung, pakai otorisasi yang berlaku saat itu) vs **"Alur Kerja Persetujuan"** (perlu disetujui dulu lewat alur persetujuan keuangan terpisah — fitur Prime+, di luar lingkup A53).
  4. Tidak ditemukan halaman katalog paket deposit terpisah di dashboard Majoo dalam penjelajahan ini (kemungkinan paket deposit dibuat sebagai varian produk di modul Produk, atau hanya bisa dibuat dari aplikasi kasir POS) — BELUM dipastikan, jangan menebak; kalau Louis punya info lebih lanjut, catat di sini.
- Butuh: Skema database dan metode `DataLayer` untuk paket deposit prabayar (Saldo DAN Produk), penjualan paket deposit (dengan masa berlaku), dan pengembalian (refund) saldo/kuota deposit pelanggan (dibedakan belum-dipakai vs sudah-dipakai).
- Untuk: Layar `/deposit` (katalog paket deposit) dan `/laporan/deposit` (tab Penjualan Deposit & Refund Deposit).
- Bentuk yang diinginkan:
  - Tabel `deposit_packages` (`id`, `org_id`, `nama`, `jenis: 'saldo' | 'produk'`, `nominal_didapat` [untuk jenis saldo] ATAU `product_id` + `qty_didapat` [untuk jenis produk], `harga_jual`, `masa_berlaku_bulan?: number`, `aktif`, `created_at`)
  - Tabel `deposit_sales` (`id`, `org_id`, `customer_id`, `package_id`, `nominal_atau_qty`, `harga_jual`, `metode_bayar`, `order_id`, `expires_at?`, `created_at`)
  - Tabel `deposit_refunds` (`id`, `org_id`, `customer_id`, `deposit_sale_id`, `pernah_dipakai: boolean`, `nominal_atau_qty`, `alasan`, `authorized_by`, `created_at`)
  - Metode `DataLayer`:
    - `listDepositPackages(): Promise<DepositPackage[]>`
    - `saveDepositPackage(input: { id?: string; name: string; kind: 'saldo'|'produk'; creditAmount?: number; productId?: string; productQty?: number; salePrice: number; validityMonths?: number; isActive: boolean; note?: string }): Promise<DepositPackage>`
    - `listDepositSales(range: { from: string; to: string }): Promise<DepositSaleRecord[]>`
    - `listDepositRefunds(range: { from: string; to: string }): Promise<DepositRefundRecord[]>`
- Sementara: Dibangun dengan data contoh statis di memori komponen (tidak memakai `localStorage` untuk data laporan) berlabel **"Pratinjau tampilan — menunggu dukungan server"**. BELUM diminta Antigravity menambah UI "Deposit Produk"/masa-berlaku/pemisahan refund — menunggu Claude menyiapkan skema di atas dulu (ikuti AGENTS.md #3: Antigravity tidak boleh menebak bentuk data baru sebelum ada di DataLayer).

## Pertanyaan terbuka untuk Louis — /pengaturan/denah (A52) — 2026-11-11
- Saat verifikasi langsung ke Majoo asli, ditemukan bahwa **seluruh menu "Pengaturan Ruangan" (tempat fitur Denah/tata-letak meja berada) di akun Coffee Ground milik Louis terkunci dengan pesan "Sayang sekali, fitur ini hanya bisa diakses oleh pengguna PRIME+ dan PRIME"** — akun Louis saat ini bukan paket Prime+/Prime, jadi Claude TIDAK BISA memverifikasi langsung urutan klik/wizard asli fitur Denah Kustom dari akun Louis sendiri.
- Ini berarti: (a) A52 yang sudah dibangun BELUM bisa diverifikasi cocok/tidaknya dengan alur asli sampai ada akses, atau (b) karena ini fitur premium di Majoo asli, mungkin masuk akal kalau CG POS pun memperlakukannya sebagai fitur opsional/lanjutan, bukan wajib sama persis — ini keputusan produk yang sebaiknya Louis yang menentukan, bukan ditebak sepihak oleh Claude/Antigravity.
- Perlu keputusan Louis: (1) apakah Louis ingin berlangganan Prime+/Prime sementara di akun Majoo aslinya supaya bisa diverifikasi langsung, (2) apakah cukup mencari dokumentasi/video bantuan publik Majoo tentang fitur ini (tanpa akses langsung), atau (3) terima A52 apa adanya untuk sekarang dan prioritaskan area lain dulu.
- **Keputusan Louis (11 Nov 2026): "ngikut aja, kalau masih ke-block karena belum langganan, lihat dari dokumentasi publiknya."** Dikerjakan: Claude membaca 2 artikel panduan resmi publik Majoo (`majoo.id/panduan-pengguna/detail/378` dan `/55`) tentang Pengaturan Denah & Meja dan Mode Meja. Ditemukan 2 celah konkret di A52 (Minimum Tagihan cuma 1 nominal, padahal asli punya 3 mode perilaku: wajib dipenuhi / boleh di bawah minimum tanpa biaya / otomatis tambah selisih sebagai biaya; dan kanvas Denah Kustom belum punya elemen dekoratif non-meja seperti tanaman/dinding/pintu) — ditulis sebagai `docs/queue/A62.md` (prioritas, setelah A61 sebelum A54-A60). Juga ditemukan fitur BESAR yang jauh lebih dalam dari cakupan A52 sekarang: lihat bagian baru di bawah.

## Temuan baru (dari dokumentasi publik) — Status meja hidup & operasi meja di kasir (apps/pos) — 2026-11-11
- Dari `majoo.id/panduan-pengguna/detail/55` ("Mode Meja"): tampilan meja di aplikasi kasir Majoo asli memakai **6 warna status**, bukan cuma kosong/terisi seperti CG POS sekarang:
  - Putih = kosong/tersedia
  - Hijau = tamu sudah memesan (order masuk)
  - Biru = tamu sudah duduk tapi belum memesan apa pun
  - Ungu = pesanan dibuat DAN struk sementara sudah dicetak
  - Kuning = batas waktu meja hampir habis
  - Merah = batas waktu meja sudah habis
  - Ada juga ikon jam di pojok kanan atas untuk mengganti tampilan info per meja antara: Durasi (lama duduk), Total tagihan, Batas waktu (sisa waktu), Pelanggan (jumlah tamu).
- Juga ditemukan 2 operasi meja yang belum ada di CG POS sama sekali (CG POS baru punya Pindah Meja & Gabung Meja via `packages/shared/src/table-ops.ts`): **Pisah Item** (pindahkan sebagian item pesanan ke meja lain, bukan seluruh pesanan) dan **Grup Meja** (kelompokkan beberapa meja yang sama-sama sudah pesan TANPA menggabungkan tagihannya jadi satu, beda dari Gabung Meja yang menyatukan tagihan).
- **BELUM ditulis sebagai tugas Antigravity** karena beberapa status (terutama "biru = duduk belum pesan" dan "ungu = struk sementara sudah dicetak") butuh KEPUTUSAN SKEMA dari Claude dulu: `Order` saat ini tidak punya cara membedakan "meja aktif tanpa order" dari "tidak ada siapa-siapa" (perlu entitas baru semacam "sesi meja" terpisah dari `Order`, atau field `seatedAt` di `TableStatus`), dan tidak ada state "struk sementara dicetak" yang terlacak terpisah dari status pembayaran (`status: 'open'|'partially_paid'|'paid'|'void'`). Butuh: (a) keputusan apakah menambah entitas `TableSession`/`seatedAt` terpisah dari `Order`, (b) field baru semacam `Order.provisionalReceiptPrintedAt?: string` untuk status ungu, (c) perhitungan status meja dari kombinasi field tsb + `timeLimitMinutes`/`reminderBeforeMinutes` dari A52.
- Untuk: Tampilan pilih meja (`apps/pos/src/screens/TablePicker.tsx`) dan operasi meja (`packages/shared/src/table-ops.ts`) di kasir, agar kasir melihat status meja yang sama informatifnya dengan Majoo asli.
- Sementara: CG POS tetap pakai status biner kosong/terisi untuk saat ini. Ditulis di sini supaya tidak terlupa; BUKAN diprioritaskan sebelum keputusan skema di atas diambil Claude, dan BUKAN tugas Antigravity sampai keputusan itu selesai (lihat AGENTS.md #3: Antigravity tidak boleh menebak bentuk data baru).


## Dari Antigravity (A60) — Analisa Kepuasan, Kustom Data Pelanggan, & Kebijakan Pelanggan

1. **Analisa Kepuasan Pelanggan (`/analisa/kepuasan`, `S85`)**:
   - Saat ini menampilkan **Pratinjau — Data Contoh** (`SAMPLE_SATISFACTION_ITEMS` dan status tindak lanjut di `localStorage`) karena belum ada tabel maupun endpoint umpan balik / rating pelanggan di server.
   - **Bentuk data & DataLayer yang dibutuhkan**: `listCustomerFeedback(range)` dan `markFeedbackHandled(id, note)` (menyimpan skor bintang 1–5, tag topik, komentar, `order_id`, dan saluran order dari struk digital maupun CG Order).

2. **Kustom Data & Pengaturan Kebijakan Pelanggan (`/pelanggan/kustom`, `/pelanggan/pengaturan`, `S41`)**:
   - Definisi kolom tambahan (`CustomerCustomField`) dan kebijakan pengisian (`CustomerPolicySettings`) saat ini disimpan di peramban (`Pratinjau`), sementara statistik kelengkapan profil dibaca langsung dari `data.listCustomers()`.
   - **Bentuk data & DataLayer yang dibutuhkan**: `listCustomerCustomFields()`, `saveCustomerCustomFields()` (serta `customValues` JSONB pada `Customer`), dan kolom/RPC kebijakan pelanggan di `OutletOptions` (`requirePhoneOnCreate`, `uniquePhoneEnforcement`, `allowCashierCreate`, `allowCashierEdit`, `hidePhoneMaskOnReceipt`) agar formulir pelanggan di kasir & dashboard mengikuti aturan yang sama.
