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

## /pengaturan/struk — 2026-11-11
- Butuh: Kolom database dan dukungan DataLayer untuk:
  1. `receipt_logo_url` (unggah/tautan gambar logo outlet untuk dicetak di kepala struk thermal)
  2. `receipt_show_qr` (opsi cetak kode QR pembayaran dinamis di struk)
  3. `receipt_default_paper` (pilihan lebar kertas bawaan outlet: 58 mm vs 80 mm)
- Untuk: Layar `/pengaturan/struk` (A47 editor tampilan struk pelanggan).
- Bentuk yang diinginkan: Kolom di tabel `outlet_options` atau properti dalam `OutletOptions` / `ReceiptTemplate`.
- Sementara: Ditampilkan sebagai opsi nonaktif berlabel "Segera" di tab Header dan Body pada editor struk.

