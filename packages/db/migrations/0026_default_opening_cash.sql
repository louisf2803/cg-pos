-- Kas awal bawaan per outlet: kasir melihat angka ini terisi saat membuka shift (boleh diubah). NULL = tidak ada bawaan.
-- Hanya menambah satu kolom nullable; tidak mengubah data yang ada. Diterapkan ke produksi hanya atas persetujuan Louis.
alter table pos.outlet_settings
  add column if not exists default_opening_cash numeric(18,2) check (default_opening_cash is null or default_opening_cash >= 0);
comment on column pos.outlet_settings.default_opening_cash is 'Modal awal bawaan saat buka shift (Rp); NULL = tidak ada';
