-- CG POS · 0141_cash_photos_bucket
-- Bucket privat untuk foto bukti kas masuk/keluar (A138). Hanya berjalan di Supabase (skema storage ada); di database lokal/tes dilewati.
-- Jalur objek: <org_id>/<shift_id>/<id_gerakan_kas>.jpg (jpg/png/webp, maks 1 MB). Anggota org dan perangkat kasir aktif (akun device bukan anggota org)
-- boleh mengunggah ke folder org-nya sendiri; hanya pemilik/admin/manajer org itu boleh melihat. Tidak ada kebijakan update/delete: bukti tidak bisa ditimpa atau dihapus lewat API klien.
-- Kolom cash_movements.photo_path dan pemeriksaan "wajib foto" (outlet_settings.require_cash_photo) sudah ada sejak migrasi awal; migrasi ini hanya menambah tempat penyimpanan.
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'skema storage tidak ada, 0141 dilewati';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('cash-photos', 'cash-photos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cash_photos_insert') then
    execute $p$create policy cash_photos_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'cash-photos' and (storage.foldername(name))[1] in (
        select u::text from pos.user_org_ids() u
        union
        select d.org_id::text from pos.devices d where d.user_id = auth.uid() and d.is_active))$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cash_photos_select') then
    execute $p$create policy cash_photos_select on storage.objects for select to authenticated
      using (bucket_id = 'cash-photos' and (storage.foldername(name))[1] in (select o.id::text from pos.orgs o where pos.can_manage(o.id)))$p$;
  end if;
end $$;
