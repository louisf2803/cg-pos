-- CG POS · 0144_org_docs
-- Dokumen pengaturan per organisasi (jsonb bernama). Dipakai dashboard untuk preferensi bisnis yang sebelumnya hanya ada di localStorage satu peramban:
-- grup komisi, metadata fasilitas, tingkat loyalti, aturan ulang tahun, kolom kustom pelanggan, dan sejenisnya. Dengan ini semua perangkat dan pengelola
-- melihat isi yang sama. Dibaca semua anggota org, ditulis pengelola lewat pos.org_doc_save (nama dibatasi huruf kecil/angka/-/_, isi maks 256 KB,
-- terakhir menyimpan menang). Tabel ini TIDAK untuk data transaksi.

create table pos.org_docs (
  org_id uuid not null references pos.orgs(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_-]{1,40}$'),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 262144),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (org_id, name)
);

alter table pos.org_docs enable row level security;
create policy sel on pos.org_docs for select to authenticated using (org_id in (select pos.user_org_ids()));
revoke all on pos.org_docs from anon;
grant select on pos.org_docs to authenticated;
grant all on pos.org_docs to service_role;

create or replace function pos.org_doc_save(p_org uuid, p_name text, p_data jsonb) returns timestamptz
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if p_name is null or p_name !~ '^[a-z0-9_-]{1,40}$' then raise exception 'invalid doc name'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'doc must be an object'; end if;
  if pg_column_size(p_data) > 262144 then raise exception 'doc too large'; end if;
  insert into pos.org_docs(org_id, name, data, updated_at, updated_by) values (p_org, p_name, p_data, v_at, auth.uid())
  on conflict (org_id, name) do update set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return v_at;
end $$;
revoke all on function pos.org_doc_save(uuid, text, jsonb) from public, anon;
grant execute on function pos.org_doc_save(uuid, text, jsonb) to authenticated, service_role;
