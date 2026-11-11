# Siklus review (peran: reviewer = Claude)

Dibaca oleh sesi `/goal` (Claude Code di PC Louis). Jalankan di salinan repo TERPISAH, jangan di folder yang dipakai Antigravity
(dua agen di satu folder kerja saling menimpa). Tujuan: kelengkapan fitur Gelombang A (lihat `docs/SCOPE.md`), diukur oleh
`node scripts/goal-check.mjs`. Baca `AGENTS.md` dan `docs/ANTIGRAVITY.md` sekali di awal sesi.

## Pembagian peran supaya tidak dobel
- **Tidak ada lagi tugas terjadwal di cloud** (dimatikan Louis, 12 Nov 2026). Sesi `/goal` ini satu-satunya pe-merge cabang `ag/*` ke `main`.
- **Verifikasi ke Majoo asli:** sesi ini tidak membuka Majoo. Bila alur belum jelas, tulis "perlu verifikasi Majoo" di `docs/MAJOO-VERIFICATION.md`
  (Louis bisa memverifikasi sendiri atau meminta di chat), jangan menebak. Pakai dokumentasi publik Majoo bila ada.
- **Sesi ini:** me-merge cabang `ag/*` yang lulus cek (langkah 1), meninjau hasil yang sudah masuk `main`, menyatakan sebuah fitur selesai (hanya reviewer yang boleh mengubah `docs/features.csv`
  dan `docs/wave.csv`), menjaga antrean tugas, mengerjakan permintaan sisi server secara LOKAL, dan menjalankan `goal-check`.
- Antigravity tidak menyentuh `docs/features.csv`, `docs/wave.csv`, `docs/bugs.md`.

## Satu siklus (jangan membaca file besar utuh; pakai `tail`, `grep`, dan `--list`)
0. `git pull --ff-only`. Bandingkan SHA `main` dengan baris terakhir `docs/REVIEW-LOG.md`.
0b. **Merge cabang Antigravity.** `git fetch origin`, lalu untuk tiap `ag/a<N>-*` yang belum ada di `main` dan punya commit baru: baca `git diff main...ag/<nama>`.
   JANGAN merge dan tulis catatan revisi di file tugasnya bila: menyentuh `packages/db/migrations`, `packages/shared/src/data.ts`, `packages/shared/src/supabase.ts`
   (kecuali tugasnya mengizinkan), menyimpan PIN/password mentah, mengaktifkan DOKU/QRIS, atau menambah kunci rahasia. Bila aman, wajib lulus:
   `pnpm -r typecheck`, `pnpm -F @cgpos/shared test`, `pnpm -F @cgpos/dashboard build` (tambah `pnpm -F @cgpos/pos build` bila menyentuh `apps/pos`),
   `bash scripts/lint-tailwind.sh origin/main` bila ada. Lulus semua: `git merge --no-edit` lalu `git push origin HEAD:main`. Satu cabang per kali, urut nomor tugas.
1. **Tidak ada commit baru di `main`, tidak ada cabang `ag/*` baru, dan antrean masih ≥ 4 tugas terbuka?** Tulis satu baris "idle" di REVIEW-LOG dan lompat ke langkah 6.
2. **Tinjau yang baru masuk (maks 5 tugas per siklus).** Untuk tiap tugas `a<N>` yang baru digabung: baca file tugasnya di `docs/queue/`, entri terakhirnya di
   `docs/PROGRESS.md` (`tail -60`), dan buka paling banyak 2 gambar di `docs/shots/<id>/` (390 px dan 1280 px). Build sudah dijalankan saat merge; jalankan ulang
   hanya jika ada laporan masalah. Standar selesai (`AGENTS.md` #7): alur dan data hasilnya sama dengan Majoo, bukan sekadar tampilan.
   - **Lulus penuh** (seluruh lingkup baris di kolom `lingkup` pada `docs/wave.csv` terpenuhi): ubah kolom `clone` baris itu di `docs/features.csv` menjadi `yes`,
     isi kolom `evidence` di `docs/wave.csv` dengan folder bukti (mis. `docs/shots/a57`, boleh beberapa dipisah `|`), commit `review: <id>`.
   - **Sebagian:** biarkan/ubah menjadi `partial`, tulis sisanya di kolom `notes`.
   - **Gagal atau masih pratinjau:** tulis `docs/queue/<id>-fix.md` berisi kriteria yang gagal, dan catat bug di `docs/bugs.md` (S1/S2 bila menahan alur inti).
3. **Sisi server (satu permintaan per siklus).** Dari `docs/REQUESTS-FOR-CLAUDE.md`, ambil permintaan teratas yang memblokir fitur Gelombang A. Buat migrasi, DataLayer,
   dan tes, lalu uji LOKAL (`packages/db/tests/run.sh`). JANGAN menerapkan migrasi apa pun ke database produksi: migrasi 0031 dan 0032 menunggu
   keputusan Louis (ditunda). Catat di `docs/PROGRESS.md` dan masukkan ke daftar "menunggu persetujuan".
4. **Jaga antrean.** Hitung `docs/queue/A*.md` tanpa baris `STATUS:`. Bila kurang dari 4, tulis tugas baru (nomor berikutnya setelah `git pull`; format sama dengan A57-A63)
   dari `node scripts/goal-check.mjs --list`, urut modul di `docs/SCOPE.md`, hanya fitur yang tidak butuh skema baru. Setiap tugas wajib memuat: fitur (nama persis di
   `features.csv`), alur Majoo langkah demi langkah, kriteria penerimaan yang bisa dicek, dan batas lingkup dari kolom `lingkup`.
5. **Catat dan dorong.** Tambahkan 1-3 baris di `docs/REVIEW-LOG.md` (waktu WIB, SHA main, hasil). `git pull --rebase`, commit, `git push origin HEAD:main`.
6. **Cek tujuan.** Jalankan `node scripts/goal-check.mjs` dan tampilkan hasilnya.
   - `GOAL MET`: selesai. Tulis ringkasan akhir untuk Louis.
   - Belum: `node scripts/wait-for-change.mjs 540`. Jika hasilnya `TIMEOUT`, jalankan sekali lagi (total ±20 menit). Lalu mulai siklus berikutnya.

## Kemajuan, berhenti, dan hemat token
- **Kemajuan** = ada baris yang naik status di `docs/features.csv`, ada bukti baru di `docs/wave.csv`, atau satu tugas/permintaan server baru selesai.
- **6 siklus berturut-turut tanpa kemajuan:** berhenti dan laporkan penyebabnya (contoh: menunggu persetujuan migrasi produksi, atau menunggu Antigravity).
- Butuh keputusan Louis (migrasi produksi, DOKU, lingkup baru): berhenti dan tulis keputusannya dengan jelas.
- Jangan menulis tugas untuk fitur Gelombang B atau yang dibuang. Jangan menyimpan PIN atau kata sandi apa pun di repo.
