# AGENTS.md — aturan kerja untuk agen AI di repo CG POS

CG POS = POS + dashboard web bergaya Majoo, **kata dan merek sendiri** (clean room). Monorepo pnpm:
`apps/dashboard` (Next 15, ekspor statis), `apps/pos` (Vite + React), `packages/shared` (tipe, logika, DataLayer),
`packages/ui` (token + CSS), `packages/db` (migrasi + tes SQL). Bahasa antarmuka: Bahasa Indonesia, tanpa singkatan aneh.

## Aturan keras (jangan dilanggar)
1. **Clean room.** Jangan salin HTML/CSS/JS/gambar/teks dari Majoo atau situs lain. Tulis semua label dan kalimat sendiri.
2. **Jangan ubah database.** Folder `packages/db/migrations` dan tabel schema `public` dilarang disentuh. Migrasi hanya dibuat Claude.
3. **Jangan ubah antarmuka `DataLayer`** (`packages/shared/src/data.ts`) dan `supabase.ts`. Butuh data/aksi baru? Tulis di
   `docs/REQUESTS-FOR-CLAUDE.md` (apa, untuk layar apa, bentuk data yang diinginkan) lalu kerjakan tugas lain.
4. **Jangan minta atau simpan PIN dan kata sandi.** Jangan aktifkan DOKU/QRIS. Jangan taruh kunci rahasia di repo.
5. Jangan pakai nilai warna/piksel mentah di komponen: pakai kelas dan token di `packages/ui` (cg-btn, cg-input, cg-data, cg-badge, cg-banner, cg-empty, cg-modal, …).
6. Satu tugas = satu cabang = satu PR kecil. Jangan campur banyak fitur.
7. **Paritas = fungsi dan alur kerja yang sama, bukan sekadar ada tombolnya.** Arahan Louis (11 Nov 2026): fitur dianggap "selesai" hanya kalau proses kerjanya benar-benar menghasilkan hasil yang sama seperti Majoo (urutan langkah, data yang dihasilkan, akibatnya ke laporan/stok/uang) — tampilan mirip tapi tidak berfungsi, atau berfungsi tapi urutan/hasilnya beda, tetap dihitung belum selesai. Fitur yang masih "Pratinjau — menunggu dukungan server" HARUS ditindaklanjuti jadi fungsi nyata (bukan dibiarkan jadi pajangan permanen) begitu Claude sudah menyiapkan skema/DataLayer-nya. Kalau ragu urutan langkah atau perilaku asli Majoo, JANGAN menebak: tulis pertanyaan presisi di `docs/REQUESTS-FOR-CLAUDE.md` atau `docs/PROGRESS.md` untuk dicek bersama Louis langsung (sesi otomatis tidak boleh cek Majoo/BlueStacks sendiri, lihat `docs/ANTIGRAVITY.md` #6).

## Pola kode yang sudah ada (ikuti)
- Halaman dashboard: `apps/dashboard/src/app/<rute>/page.tsx`, `'use client'`, ambil data lewat `useData()` dari `@/lib/data`, status `loading | error | ready`
  dengan kerangka (`cg-skeleton`), keadaan kosong (`cg-empty`), galat (`cg-banner`). Contoh rapi: `app/keuangan/kas/page.tsx`, `app/dapur/page.tsx`.
- `useAsync` mengembalikan objek BARU tiap render: jangan taruh objeknya di dependency array; pakai `.data` atau ref.
- Dialog: `useDialog` dari `components/fin-common.tsx`. Rentang tanggal: `components/range-picker.tsx`. Tabel laporan: `components/report-view.tsx`.
- Menu ada di `apps/dashboard/src/lib/nav.ts`. Layar yang sudah jadi diberi `built: true`; yang belum otomatis tampil sebagai halaman rintisan.
  Saat membangun satu layar: buat `page.tsx`-nya lalu ubah item menunya jadi `built: true`.
- Item grid yang berisi tabel lebar wajib `className="min-w-0"` agar tidak meluap di 390 px.
- Uang selalu bilangan bulat rupiah; format dengan helper yang ada (`formatRp`). Tanggal lokal Asia/Jakarta.
- Data palsu (`packages/shared/src/fake.ts`) dipakai saat pengembangan; data nyata (Supabase) dipasang Claude.

## Lolos semua ini sebelum minta digabung
```
pnpm install
pnpm -r typecheck
pnpm -F @cgpos/shared test
pnpm -F @cgpos/dashboard build        # dan pnpm -F @cgpos/pos build bila menyentuh kasir
```
Lalu cek dengan Playwright/peramban di lebar **390 px dan 1280 px**: tidak ada galat konsol, tidak ada gulir mendatar,
keadaan kosong/memuat/galat tampil benar, bisa dipakai dengan keyboard. Tambahkan gambar layar ke PR.

## Format PR
Judul `feat: <layar>`; isi: apa yang dibuat, baris `features.csv` yang terdampak, cara mencoba, hasil perintah di atas, hal yang sengaja belum.
