-- CG POS · 0146_org_doc_pos_names
-- Dokumen organisasi (0144) hanya boleh ditulis pengelola. Data operasional kasir seperti grup meja gabungan dibuat KASIR di kasir, jadi dokumen
-- yang namanya diawali "pos-" boleh ditulis semua anggota organisasi (terakhir menyimpan menang). Dokumen lain tetap hanya pengelola.

create or replace function pos.org_doc_save(p_org uuid, p_name text, p_data jsonb) returns timestamptz
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  if p_name is null or p_name !~ '^[a-z0-9_-]{1,40}$' then raise exception 'invalid doc name'; end if;
  if not (pos.can_manage(p_org) or (p_name like 'pos-%' and p_org in (select pos.user_org_ids()))) then raise exception 'not allowed'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'doc must be an object'; end if;
  if pg_column_size(p_data) > 262144 then raise exception 'doc too large'; end if;
  insert into pos.org_docs(org_id, name, data, updated_at, updated_by) values (p_org, p_name, p_data, v_at, auth.uid())
  on conflict (org_id, name) do update set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return v_at;
end $$;
