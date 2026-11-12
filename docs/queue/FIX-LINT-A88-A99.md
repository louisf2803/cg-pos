# FIX-LINT-A88-A99 — Perbaiki pelanggaran gaya (tailwind-guard) dan rebase A87
Branch: ag/fix-lint-a88-a99
> **MODE CEPAT:** cukup `pnpm -r typecheck` dan `bash scripts/lint-tailwind.sh origin/main` sampai LULUS. Tidak perlu build/peramban/screenshot. Jangan mengubah perilaku, hanya kelas gaya.

Claude menggabungkan A88 sampai A112 ke `main` (tes 587 lulus, typecheck dan build lulus) tetapi `lint-tailwind.sh` GAGAL karena dua pola:
1. **Awalan breakpoint tidak ada:** pakai `tablet:` / `laptop:` / `desktop:` / `wide:`, BUKAN `sm:` `md:` `lg:` `xl:`.
2. **Kunci spasi tak terdefinisi:** nilai seperti `mt-2`, `px-6`, `py-2`, `gap-6`, `space-y-2`, `space-y-6`, `pl-36` tidak ada di token. Pakai nilai eksplisit (mis. `mt-[2px]`) atau kunci yang sudah dipakai di berkas lain (`mt-4`, `gap-8`, `px-8`, ... lihat `packages/ui` dan halaman contoh).

Berkas yang melanggar (jumlah baris): keuangan/tagihan-rutin/page.tsx (13), inventori/harga-beli/page.tsx (10), persetujuan/page.tsx (7), inventori/permintaan/page.tsx (7), pengaturan/karyawan/page.tsx (3), keuangan/aset/page.tsx (2), keuangan/aset/pelepasan/page.tsx (1), dapur/page.tsx (1). Jalankan `bash scripts/lint-tailwind.sh origin/main` untuk melihat barisnya; ulangi sampai tertulis LULUS. Setelah itu push dan tandai `STATUS: SELESAI <commit>`.

## Rebase A87
`ag/a87-struktur-sdm` BELUM digabung karena konflik 12 hunk di `apps/dashboard/src/app/pengaturan/karyawan/page.tsx` dengan A86 (kolom Peran Kustom). Lakukan: `git fetch && git rebase origin/main` pada cabang itu, selesaikan konflik dengan MEMPERTAHANKAN kolom/pilihan peran kustom A86 DAN pilihan Jabatan/Unit/Tipe A87, jalankan typecheck + lint, lalu `git push --force-with-lease`. Tandai di `docs/PROGRESS.md`.

## Tambahan dari uji Chrome (13 Nov 2026)
1. **Pesan galat tak terlihat di Pelepasan Aset** (`apps/dashboard/src/app/keuangan/aset/pelepasan/page.tsx`): bila konfirmasi pelepasan gagal, banner galat muncul di BAGIAN ATAS halaman sehingga pengguna yang sudah scroll ke bawah mengira berhasil. Tampilkan galat di dalam dialog konfirmasi (dan jangan tutup dialog saat gagal), atau scroll ke banner. Periksa pola yang sama di halaman Penyusutan, Tagihan Rutin, Persetujuan, Permintaan Barang, Harga Beli.
2. Setelah kamu memperbaiki, JANGAN memakai `toISOString().slice(0, 10)` untuk "hari ini": itu tanggal UTC (antara 00.00 dan 07.00 WIB masih kemarin). Pakai `localDateString(new Date())` dari `@cgpos/shared`.
