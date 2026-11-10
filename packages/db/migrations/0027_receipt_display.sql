-- Tampilan struk per outlet: teks kepala (di bawah nama/alamat) dan pilihan menampilkan nama kasir / pelanggan.
-- Hanya menambah kolom; baris lama otomatis memakai bawaan (kasir dan pelanggan tampil, tanpa teks kepala).
-- Diterapkan ke produksi hanya atas persetujuan Louis.
alter table pos.outlet_settings
  add column if not exists receipt_header text check (receipt_header is null or char_length(receipt_header) <= 200),
  add column if not exists receipt_show_cashier boolean not null default true,
  add column if not exists receipt_show_customer boolean not null default true;
comment on column pos.outlet_settings.receipt_header is 'Teks kepala struk (maks 200 karakter); NULL = tidak ada';
comment on column pos.outlet_settings.receipt_show_cashier is 'Tampilkan nama kasir di struk';
comment on column pos.outlet_settings.receipt_show_customer is 'Tampilkan nama pelanggan di struk';
