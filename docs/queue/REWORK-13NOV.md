# REWORK-13NOV — perbaikan cabang yang dikembalikan Claude (13 Nov 2026)

Kerjakan SEBELUM A125 dan seterusnya, satu per satu, dalam urutan ini. Baca dulu `docs/queue/EFISIENSI.md` (cara membaca berkas panjang dan daftar periksa). Untuk tiap cabang: `git fetch origin && git rebase origin/main` di cabangnya sendiri, perbaiki, jalankan tiga perintah verifikasi, tambahkan 3 baris di akhir `docs/PROGRESS.md`, push. JANGAN membuat cabang baru; pakai cabang yang sama.

Nomor migrasi terpakai di main: sampai 0044, lalu 0097, 0098 (diterapkan di produksi). Bila migrasimu bernomor lebih kecil dari 0098 dan sudah ada di main, ganti nama ke nomor kosong berikutnya yang lebih besar dari semua yang ada di `packages/db/migrations`.

## Urutan dan isi perbaikan
1. **A142 `ag/a142-izin-granular`** (migrasi 0103). Dua cacat nyata:
   - Hapus `grant select (qr_code)` dan `grant update (qr_code)` ke `authenticated`. `qr_code` rahasia; tes `15_client_rpcs` menegaskan klien TIDAK boleh membacanya. Bila layar perlu status QR, pakai fungsi `security definer` yang mengembalikan boolean (ada/tidak), bukan kode aslinya.
   - Pemicu `guard_granular_catalog` memblokir `custom_item_product` (fungsi `security definer` yang membuat produk "Item bebas" saat kasir menambah item bebas). Pemicu harus mengizinkan jalur fungsi `security definer` yang sudah ada (mis. periksa `current_user` atau variabel sesi yang diatur fungsi itu), dan tes lama `19_custom_item.sql` HARUS lulus.
2. **A114 `ag/a114-denah-meja`**: `lint-tailwind` GAGAL di `apps/dashboard/src/app/pengaturan/denah/page.tsx` (1.946 baris; pecah ke komponen di `components/denah/`, tiap berkas maksimal sekitar 400 baris). Perbaiki nilai spasi tak terdefinisi (`px-4`, `py-1`, `gap-6`, `mt-2`, …).
3. **A118 `ag/a118-struk-lanjut`**: lint GAGAL di `pengaturan/struk/page.tsx` dan `apps/pos/src/screens/Receipt.tsx` (nilai spasi tak terdefinisi).
4. **A120 `ag/a120-ekstra-bahan`**: lint GAGAL (nilai spasi tak terdefinisi). Migrasi 0120: tes SQL-nya harus lulus di `run.sh` (Claude yang menjalankan).
5. **A121 `ag/a121-produk-layanan`**: lint GAGAL (awalan breakpoint tidak ada; pakai `tablet:`/`laptop:`/`desktop:`/`wide:`).
6. **A145 `ag/a145-metode-bayar-server`**: migrasi `0109_payment_method_settings.sql` baris 46 memanggil `pos.touch()` yang TIDAK ADA, sehingga migrasi gagal dimuat. Ganti dengan pembaruan `updated_at` langsung (atau trigger yang kamu definisikan sendiri di migrasi yang sama). Periksa juga nomor: 0109 lebih kecil dari 0120 sehingga tidak berurut; tidak masalah selama unik dan lebih besar dari 0098.
7. **A123 `ag/a123-outlet-info`**: tes `packages/db/tests/28_outlet_business_bank_group.sql` memakai pgTAP (`select plan(5)`), yang TIDAK dipakai proyek ini dan membuat seluruh `run.sh` gagal. Tulis ulang dengan pola `pg_temp.okNN` (contoh `19_fixed_assets.sql`) dan ganti nama ke `19_outlet_business_bank_group.sql`.
8. **A143 `ag/a143-reservasi-server`** dan **A144 `ag/a144-deposit-paket-laporan`**: konflik di `packages/shared/src/data.ts` saat digabung. Rebase pada `origin/main`; gabungkan kedua sisi (tambahkan semua metode, jangan buang milik cabang lain).
9. **A117, A119, A140, A141** (konflik): rebase pada `origin/main` satu per satu. Konflik di `packages/shared/src/index.ts`, `data.ts`, `fake.ts`, `supabase.ts`, `offline.ts`, `device-prefs.ts`, `cart.ts`, `SplitBillDialog.tsx`, `product-form.tsx`, `types.ts`, `variants.ts`: GABUNGKAN kedua sisi. Setelah rebase `pnpm -r typecheck` dan tes shared harus lulus.
10. **A87 `ag/a87-struktur-sdm`**: rebase pada `origin/main` (konflik besar sebelumnya di 12 hunk; selesaikan dengan menggabungkan).

Sudah masuk main (jangan dikerjakan lagi): A86, A113, A116, A139, A115, A122.

Setelah semua di atas selesai, lanjut A125 dan seterusnya (A124 yang sedang berjalan selesaikan dulu).
