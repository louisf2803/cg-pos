-- CG POS · 0036_attendance_photos
-- Bucket privat untuk selfie absensi. Hanya berjalan di Supabase (skema storage ada); di database lokal/tes dilewati.
-- Jalur objek: <org_id>/<employee_id>/<nama>.jpg. Anggota org dan perangkat kasir aktif (akun device bukan anggota org) boleh
-- mengunggah ke folder org-nya sendiri; hanya pemilik/manajer org itu boleh melihat. Tidak ada kebijakan update/delete: foto absensi tidak bisa ditimpa atau dihapus lewat API klien.
-- Bucket tidak publik (selfie karyawan adalah data pribadi); tampilan memakai tautan bertanda tangan berumur pendek.
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'skema storage tidak ada, 0036 dilewati';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('attendance-photos', 'attendance-photos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'attendance_photos_insert') then
    execute $p$create policy attendance_photos_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'attendance-photos' and (storage.foldername(name))[1] in (
        select u::text from pos.user_org_ids() u
        union
        select d.org_id::text from pos.devices d where d.user_id = auth.uid() and d.is_active))$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'attendance_photos_select') then
    execute $p$create policy attendance_photos_select on storage.objects for select to authenticated
      using (bucket_id = 'attendance-photos' and (storage.foldername(name))[1] in (select o.id::text from pos.orgs o where pos.can_manage(o.id)))$p$;
  end if;
end $$;
