-- CG POS · 0143_table_layouts
-- Denah meja kustom tersimpan di server (A114): posisi dan bentuk meja, elemen dekor, pengaturan meja (batas duduk, minimal tagihan), mode denah per lantai,
-- dan meja nonaktif. Sebelumnya semua ini hanya ada di localStorage peramban dashboard, jadi tidak pernah sampai ke perangkat kasir.
-- Satu dokumen jsonb per outlet (kunci = nama pengaturan, nilai = isinya). Terakhir menyimpan menang. Dibaca semua anggota org (kasir memakai denah dan
-- pengaturan meja), ditulis hanya pengelola lewat pos.table_layout_save. Gambar latar lantai sengaja TIDAK disimpan di sini (ukurannya besar; tetap di perangkat).

create table pos.table_layouts (
  outlet_id uuid primary key references pos.outlets(id) on delete cascade,
  org_id uuid not null references pos.orgs(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 262144),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index table_layouts_org on pos.table_layouts (org_id);

alter table pos.table_layouts enable row level security;
create policy sel on pos.table_layouts for select to authenticated using (org_id in (select pos.user_org_ids()));
revoke all on pos.table_layouts from anon;
grant select on pos.table_layouts to authenticated;
grant all on pos.table_layouts to service_role;

create or replace function pos.table_layout_save(p_outlet uuid, p_data jsonb) returns timestamptz
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select org_id into v_org from pos.outlets where id = p_outlet and deleted_at is null;
  if not found then raise exception 'outlet not found'; end if;
  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'layout must be an object'; end if;
  if pg_column_size(p_data) > 262144 then raise exception 'layout too large'; end if;
  insert into pos.table_layouts(outlet_id, org_id, data, updated_at, updated_by) values (p_outlet, v_org, p_data, v_at, auth.uid())
  on conflict (outlet_id) do update set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return v_at;
end $$;
revoke all on function pos.table_layout_save(uuid, jsonb) from public, anon;
grant execute on function pos.table_layout_save(uuid, jsonb) to authenticated, service_role;
