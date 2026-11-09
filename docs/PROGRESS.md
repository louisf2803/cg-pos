# Catatan kemajuan CG POS (dibaca Louis saat bangun)

Format: tanggal, apa yang selesai, apa yang menunggu keputusan Louis.

## 2026-11-10
- Selesai: katalog gaya Majoo. Satu produk berisi varian (S/M/L) di POS dan dashboard (/produk, tambah, ubah). Data nyata sudah terkelompok: 79 produk induk, 230 varian, tidak ada varian yatim.
- Selesai: pembayaran campuran (split per nominal) di kasir; kategori dan departemen di dashboard (/kategori).
- Menunggu keputusan Louis:
  - Migrasi `packages/db/migrations/0011_employee_owner_guard.sql` (hanya pemilik yang boleh memberi/mengubah peran pemilik dan mengatur PIN pemilik; mencegah manajer mengangkat diri jadi pemilik) **belum diterapkan**. Server Supabase meminta konfirmasi saat uji rollback dan tidak terjawab. Mohon izinkan/jalankan uji lalu terapkan, atau minta saya ulang. Belum ada perubahan dari percobaan itu yang tersimpan (transaksinya diakhiri rollback).
- Berikutnya: karyawan + peran (agar ada manajer untuk PIN void), laporan penjualan, info outlet, meja/denah, struk, refund, Ekstra (modifier), Paket, lalu PB1 inklusif.
