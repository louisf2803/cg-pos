-- Templat struk per outlet (tema huruf, bagian yang tampil/sembunyi, batas cetak ulang), disimpan sebagai jsonb.
-- Hanya menambah kolom; baris lama memakai '{}' = semua bawaan, jadi struk lama tidak berubah.
-- Isi divalidasi aplikasi (kunci tak dikenal dibuang); basis data menjaga bentuknya: objek jsonb dan tidak lebih dari 2 KB.
-- Diterapkan ke produksi hanya atas persetujuan Louis.
alter table pos.outlet_settings
  add column if not exists receipt_template jsonb not null default '{}'::jsonb
    check (jsonb_typeof(receipt_template) = 'object' and pg_column_size(receipt_template) <= 2048);
comment on column pos.outlet_settings.receipt_template is 'Templat struk pelanggan (tema, tampil/sembunyi, batas cetak); {} = bawaan';
