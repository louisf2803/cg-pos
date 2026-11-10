# Antrean tugas Antigravity

Cara kerja (LOOP TANPA HENTI): kerjakan tugas di folder ini BERURUTAN tanpa berhenti bertanya. Setelah satu tugas selesai (di-commit + STATUS: SELESAI), LANGSUNG `git pull` dan cari file tugas berikutnya yang belum punya baris STATUS (urut nomor). Ambil yang pertama dan kerjakan. Jika tidak ada, tunggu 10 menit lalu cek lagi (maksimal 12 kali), jangan berhenti sebelum itu. Claude menambah tugas baru ke folder ini selagi kamu bekerja, dan me-review serta merge hasilmu secara paralel.

Penting untuk paralel: tiap tugas mulai dari origin/main terbaru (git fetch; bukan dari branch tugas sebelumnya) kecuali file tugas menyebut ketergantungan. Hindari mengubah file bersama (nav.ts, index.ts) kecuali perlu; bila perlu, ubah minimal (tambah baris, jangan merapikan ulang).

Setiap tugas:  Tiap tugas = satu branch `ag/<id>-<nama>` dari main terbaru (git pull dulu), dikerjakan sampai selesai, di-COMMIT, lalu tandai selesai dengan menambah baris `STATUS: SELESAI <commit>` di akhir file tugas, commit lagi. Lanjut ke tugas berikutnya (branch baru dari branch sebelumnya bila belum di-merge).

Aturan semua tugas:
- Lingkup: apps/dashboard dan packages/shared (helper murni + tes). JANGAN ubah packages/db, supabase.ts, data.ts, apps/pos.
- Kode & teks tulis sendiri; semua warna lewat token (hijau dominan).
- Wajib lulus: pnpm -r typecheck, pnpm -F @cgpos/shared test, pnpm -F @cgpos/dashboard build.
- Playwright 390/1280/1440 px: tanpa overflow horizontal & tanpa galat konsol; screenshot ke docs/shots/<id>/.
- Keadaan wajib: memuat (skeleton), kosong, galat, nama panjang.
- Catat ringkasan di docs/PROGRESS.md. Jangan tinggalkan perubahan tanpa commit.
- Jika ragu, ambil keputusan paling masuk akal dan tulis di PROGRESS.md; jangan berhenti bertanya.
- Referensi struktur: docs/NAV-MAP-A12.md.
