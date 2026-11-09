# Catatan kemajuan CG POS (dibaca Louis saat bangun)

Format: tanggal, apa yang selesai, apa yang menunggu keputusan Louis.

## 2026-11-10
- Selesai: katalog gaya Majoo. Satu produk berisi varian (S/M/L) di POS dan dashboard (/produk, tambah, ubah). Data nyata sudah terkelompok: 79 produk induk, 230 varian, tidak ada varian yatim.
- Selesai: pembayaran campuran (split per nominal) di kasir; kategori dan departemen di dashboard (/kategori); tambah/ubah/nonaktifkan karyawan dengan peran kasir atau manajer (/pengaturan/karyawan); laporan penjualan dengan rentang tanggal (/laporan) dan detail transaksi + unduh CSV (/laporan/penjualan); pengaturan outlet (/pengaturan/outlet: nama, alamat, telepon, catatan struk) dan biaya layanan, pembulatan, aturan kasir (/pengaturan/biaya); lantai dan meja (/pengaturan/denah) dengan pemilihan meja, nama pesanan, dan jumlah tamu di kasir; cetak struk dan tagihan sementara (58/80 mm) dari kasir. Langkah berikutnya untukmu: buat karyawan manajer, atur PIN-nya, supaya void di kasir bisa disetujui PIN manajer.
- Menunggu keputusan Louis:
  - **Menerapkan migrasi ke Supabase butuh persetujuanmu.** Setiap perubahan skema lewat alat Supabase memunculkan pertanyaan konfirmasi ke kamu, dan saat kamu tidur tidak terjawab (timeout). Migrasi `0011_employee_owner_guard.sql` (hanya pemilik yang boleh mengangkat/mengubah peran pemilik dan mengatur PIN pemilik) sudah **lulus uji lokal** (tests/17, seluruh suite hijau) tetapi **belum diterapkan** ke project nyata. Saat kamu bangun: jalankan "terapkan migrasi 0011" dan setujui pertanyaannya. Sampai itu terjadi, manajer secara teknis bisa mengangkat diri jadi pemilik. Sementara itu semua kerja lain jalan tanpa perubahan skema.
  - Cetak struk saat ini lewat dialog cetak peramban (bekerja untuk printer thermal yang terpasang sebagai printer sistem). Untuk kirim langsung ke printer Bluetooth/ESC-POS dan buka laci kas, aku perlu tahu **merek/model printer** yang dipakai Coffee Ground dan apakah kasir berjalan di tablet Android, iPad, atau Windows. Belum bisa diuji tanpa printernya.
  - Bacaan (select) dan uji rollback tanpa DDL berjalan tanpa pertanyaan.
- Selesai: refund di kasir (Daftar Order > Lunas > Refund): pilih item dan jumlah, metode, alasan, PIN manajer, opsi kembalikan stok; kas tunai berkurang saat tutup shift; dicek server (total tidak boleh melebihi yang dibayar) dan lolos tes kontrak payload. Dialog di HP kini bisa di-scroll. Catatan: laporan penjualan belum mengurangi refund.
- Berikutnya: daftar transaksi offline tertunda, Ekstra (modifier), Paket, lalu PB1 inklusif.
