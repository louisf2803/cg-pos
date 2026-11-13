# EFISIENSI — cara bekerja lebih cepat dan menghindari pengerjaan ulang

Keputusan Louis, 13 Nov 2026: satu tugas sekarang makan 30–60 menit karena waktu terbanyak habis membaca berkas panjang ("Analyzed page.tsx Line…"). Aturan ini berlaku untuk SEMUA tugas mulai A125 dan perbaikan di `REWORK-13NOV.md`.

## 1. Kurangi bacaan
- Berkas di atas 400 baris: JANGAN dibaca penuh. Pakai Grep untuk menemukan nama fungsi/kata kunci, lalu Read dengan `offset` dan `limit` (maksimal sekitar 120 baris sekali baca).
- Berkas besar yang sering terpakai: `packages/shared/src/supabase.ts` (±2900), `fake.ts` (±2200), `data.ts` (±420), `docs/PROGRESS.md` (±1050), `apps/dashboard/src/lib/nav.ts` (±460), halaman `pengaturan/denah`, `keuangan`, `pengaturan/karyawan`, `pos/screens/Register.tsx`, `Orders.tsx`. Cari dengan Grep (mis. `Grep "async listStockLocations"`), jangan buka dari baris 1.
- `docs/PROGRESS.md`: jangan dibaca. Tambahkan 3 baris di akhir berkas.
- Tiap tugas punya blok "Cara kerja cepat" dengan titik mulai (berkas dan nama fungsi). Mulailah dari sana.
- Tulis kode baru di BERKAS BARU kecil (komponen, helper di `packages/shared/src/<fitur>.ts`) daripada memperpanjang berkas besar. Halaman baru maksimal sekitar 400 baris. Untuk `supabase.ts`/`fake.ts`/`data.ts`, tambahkan metode di BAGIAN AKHIR objeknya dan, bila lebih dari ±40 baris, taruh logikanya di berkas baru lalu panggil dari sana.

## 2. Verifikasi (satu aturan, menimpa aturan umum AGENTS.md)
Sebelum menandai selesai cukup tiga perintah:
```
pnpm -r typecheck
pnpm -F @cgpos/shared test
bash scripts/lint-tailwind.sh origin/main
```
Tanpa build penuh, tanpa Playwright/peramban, tanpa screenshot (Claude yang memeriksa). Lint HARUS "LULUS"; ini penyebab penolakan terbanyak.

## 3. Daftar periksa lint (kegagalan yang berulang)
- Hanya awalan breakpoint `tablet:`, `laptop:`, `desktop:`, `wide:`. JANGAN `sm:`, `md:`, `lg:`, `xl:`.
- Spasi hanya nilai yang terdefinisi di `packages/ui` (mis. `gap-8`, `p-12`). JANGAN `gap-6`, `px-4`, `py-1`, `mt-2`, `gap-4`, `gap-2`, `px-6`. Bila perlu ukuran di luar token, tulis nilai eksplisit (contoh yang diterima lint: `w-[14px]`), atau lebih baik pakai kelas `cg-*`. Jalankan lint, jangan menebak.
- Pesan galat dialog harus terlihat di dalam dialog (jangan hanya di atas halaman).

## 4. Daftar periksa migrasi SQL
- Berkas `packages/db/migrations/NNNN_nama.sql`, aditif saja. Fungsi `security definer` + `set search_path = pos, pg_temp` + `revoke all ... from public, anon` + `grant execute ... to authenticated, service_role`.
- JANGAN memanggil fungsi yang belum ada (mis. `pos.touch()` TIDAK ADA; isi `updated_at` langsung atau buat triggernya sendiri). Cari dulu: `Grep "create.*function pos.<nama>" packages/db/migrations`.
- JANGAN memberi hak ke kolom rahasia (`qr_code`, `pin_hash`, `pin_failed_count`, `pin_locked_until`) dan jangan membuat pemicu/RLS yang menghalangi fungsi `security definer` yang sudah ada (contoh gagal: A142 memblokir `custom_item_product`).
- Tes SQL: `packages/db/tests/19_<nama>.sql` memakai pola `pg_temp.okNN(...)` seperti `19_fixed_assets.sql`. JANGAN pgTAP (`plan()`, `is()`). Nama berkas harus berurut setelah tes lain yang terkait. Tes harus menghapus data yang ia buat bila tes lain menghitung baris pada tabel yang sama.
- Tanggal: pakai `(now() at time zone 'Asia/Jakarta')::date`, bukan `current_date`.
- Claude yang menjalankan `packages/db/tests/run.sh` dan menerapkan ke produksi. Kamu cukup menulis migrasi dan tesnya dengan teliti dan memeriksa nama fungsi yang kamu panggil.

## 5. Konflik dengan cabang lain
- Sebelum push: `git fetch origin && git rebase origin/main`. Selesaikan konflik di `data.ts`, `fake.ts`, `supabase.ts`, `index.ts`, `nav.ts` dengan MENGGABUNGKAN kedua sisi (jangan membuang metode orang lain).
- `docs/PROGRESS.md`: kedua sisi dipertahankan.
