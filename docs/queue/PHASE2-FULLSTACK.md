# FASE 2 — Antigravity mengerjakan layar DAN server sampai semi goal 93/93

Keputusan Louis, 13 Nov 2026: supaya semua fitur Gelombang A bisa "ada" tanpa menunggu Claude, Antigravity boleh mengerjakan bagian server. Ini MENIMPA sementara aturan keras `AGENTS.md` nomor 2 dan 3 untuk tugas A113 sampai A145 saja.

## Yang BOLEH sekarang
- Mengubah `packages/shared/src/data.ts`, `fake.ts`, `supabase.ts` (menambah metode DataLayer; JANGAN mengubah atau menghapus metode yang sudah ada).
- Menulis berkas migrasi BARU di `packages/db/migrations/` (nomor sesuai tugas, atau berikutnya yang kosong) dan tes SQL di `packages/db/tests/19_<nama>.sql`.
- Memakai pola migrasi 0038 sampai 0043 sebagai contoh: tabel baru + RLS aktif + `revoke all from anon` + hak `authenticated` seperlunya; penulisan lewat fungsi `security definer` dengan `set search_path`; pemeriksaan peran (`pos.can_manage`, `pos.is_org_admin`); idempoten menurut id; batas panjang/rentang lewat `check`.

## Yang TETAP DILARANG
- Menerapkan migrasi ke produksi atau memakai alat Supabase apa pun. Migrasi hanya DITULIS; Claude yang menguji di Postgres lokal, meninjau, dan menerapkannya.
- Mengubah/menghapus tabel atau data yang sudah ada, menyentuh schema `public`, mengubah migrasi lama (0001 sampai 0044).
- Meminta/menyimpan PIN atau kata sandi, mengaktifkan DOKU/QRIS, menaruh kunci rahasia di repo (AGENTS.md #4).
- Mengubah `features.csv`, `wave.csv`, `semi.csv`, `bugs.md` (hanya Claude).
- Menyalin apa pun dari Majoo (clean room).

## Definisi "ADA" untuk semi goal (tanpa screenshot)
Sebuah fitur dinilai ADA oleh Claude bila SEMUA ini benar:
1. Layar atau alurnya ada, terhubung ke menu (`nav.ts`, `built: true`), dan bisa dijalani di mode demo (`fake.ts`).
2. Data tersimpan lewat DataLayer yang punya implementasi `supabase.ts` yang nyata (bukan localStorage), didukung migrasi yang ditulis dan tes SQL.
3. Tidak ada label "Pratinjau — belum tersambung server" lagi untuk fitur itu.
4. `pnpm -r typecheck`, tes shared yang terkait, dan `lint-tailwind` lulus (mode cepat: build penuh dan peramban TIDAK perlu).
5. Bagian yang sengaja tidak dikerjakan (di luar keputusan Louis: tanpa WhatsApp/email/SMS, QRIS cukup "Payment belum tersambung", tanpa saldo deposit sebagai alat bayar, printer Bluetooth saja, tanpa mode SKU/buku menu, tanpa integrasi marketplace nyata) ditulis jelas di `docs/PROGRESS.md`.

## Fitur yang urutan langkah Majoo-nya belum diketahui
Rancang sendiri berdasarkan praktik umum yang masuk akal, tandai "ASUMSI" di komentar migrasi dan di `PROGRESS.md`, dan jangan berhenti menunggu. Pencocokan dengan Majoo dilakukan di tahap berikutnya. Ini berlaku untuk: produksi stok, penawaran/pesanan/pengiriman/penerimaan penjualan, faktur penjualan, aset tetap (sudah ada), master resep, harga berdasarkan waktu, server lokal/riwayat sinkronisasi, tutup kasir otomatis.

## Urutan dan pembagian
- Urutan: A87 (rebase dulu), `FIX-LINT-A88-A99.md`, lalu A113 sampai A145. Satu halaman/fitur per cabang bila besar.
- Tiap tugas diakhiri dengan: typecheck, tes terkait, `lint-tailwind` lulus; catat 3 baris di `docs/PROGRESS.md`; tandai `STATUS: SELESAI <commit>`; push.
- Konflik nomor migrasi: pakai nomor cadangan tugasmu; bila bentrok, ambil berikutnya yang kosong dan catat.

## Setelah semua selesai (tahap berikutnya)
1. Claude: gabungkan cabang, jalankan semua tes SQL di Postgres lokal, terapkan migrasi ke produksi, perbarui `docs/semi.csv`, hitung `node scripts/goal-check.mjs --semi`.
2. Antigravity: Playwright dengan screenshot 390 dan 1280 px untuk semua fitur.
3. Claude: cek kesesuaian alur dengan Majoo, lalu naikkan `clone` ke `yes` (goal ketat).
