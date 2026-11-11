-- CG POS · 0033_roles
-- Peran kustom & hak akses granular (menggantikan permintaan A51/A61 di docs/REQUESTS-FOR-CLAUDE.md).
-- Tahap 1 (migrasi ini): PENYIMPANAN saja — peran kustom, toggle modul, dan grid granular per fitur/sub-fitur
-- tersimpan di server (lintas perangkat) menggantikan localStorage. Penegakan izin nyata di setiap RLS/aksi
-- dashboard & kasir (selain owner-guard yang sudah ada sejak 0011/0028) adalah tahap lanjutan terpisah —
-- BELUM diubah di migrasi ini, supaya tidak mengganggu RLS yang sudah berjalan aman. employees.role
-- (owner/manager/cashier/kitchen/warehouse) tetap sumber kebenaran untuk penjagaan server yang sudah ada;
-- role_id di bawah ini murni tambahan untuk UI /karyawan/hak-akses.
begin;

create table pos.roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 300),
  is_built_in boolean not null default false,
  base_role text not null default 'cashier' check (base_role in ('owner','manager','cashier','kitchen','warehouse')),
  owner_app_access boolean not null default false,
  default_dashboard_page text,
  default_pos_page text,
  can_authorize_refund boolean not null default false,
  can_authorize_void boolean not null default false,
  can_authorize_complimentary boolean not null default false,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create unique index roles_name_unique on pos.roles (org_id, lower(btrim(name))) where deleted_at is null;
create index roles_org on pos.roles (org_id) where deleted_at is null;

-- toggle master per modul dashboard/POS ("jika dinonaktifkan, seluruh fitur di modul itu tertutup").
create table pos.role_dashboard_perms (
  role_id uuid not null references pos.roles(id) on delete cascade,
  module_id text not null check (char_length(module_id) between 1 and 60),
  enabled boolean not null default true,
  primary key (role_id, module_id)
);

create table pos.role_pos_perms_module (
  role_id uuid not null references pos.roles(id) on delete cascade,
  module_id text not null check (char_length(module_id) between 1 and 60),
  enabled boolean not null default true,
  primary key (role_id, module_id)
);

-- grid granular per fitur/sub-fitur x [lihat, buat, ubah, hapus, void] — dashboard dan POS punya katalog
-- modul/fitur sendiri-sendiri (lihat packages/shared/src/permission-matrix.ts), jadi dipisah dua tabel.
create table pos.role_dashboard_feature_perms (
  role_id uuid not null references pos.roles(id) on delete cascade,
  module_id text not null check (char_length(module_id) between 1 and 60),
  feature_id text not null check (char_length(feature_id) between 1 and 60),
  sub_feature_id text not null default '',
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_void boolean not null default false,
  primary key (role_id, module_id, feature_id, sub_feature_id)
);

create table pos.role_pos_feature_perms (
  role_id uuid not null references pos.roles(id) on delete cascade,
  module_id text not null check (char_length(module_id) between 1 and 60),
  feature_id text not null check (char_length(feature_id) between 1 and 60),
  sub_feature_id text not null default '',
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_void boolean not null default false,
  primary key (role_id, module_id, feature_id, sub_feature_id)
);

-- penghubung opsional karyawan -> peran kustom. Tidak menggantikan employees.role (tetap dipakai RLS lama).
alter table pos.employees add column role_id uuid references pos.roles(id) on delete set null;
create index employees_role_id on pos.employees (role_id) where role_id is not null;

-- employees memakai hak akses per-kolom (lihat 0010_client_rpcs.sql) supaya kolom rahasia (pin_hash dkk)
-- tidak pernah tersentuh klien langsung. role_id adalah kolom baru, setara risikonya dengan "permissions"
-- yang sudah bisa ditulis klien langsung di sana — tambahkan ke daftar kolom yang boleh diubah.
-- Kebijakan RLS 'upd' pos.employees (dari 0009, pos.can_manage(org_id)) tetap berlaku di atas ini.
grant select (role_id) on pos.employees to authenticated;
grant update (role_id) on pos.employees to authenticated;

alter table pos.roles enable row level security;
create policy sel on pos.roles for select to authenticated using (org_id in (select pos.user_org_ids()));
create policy ins on pos.roles for insert to authenticated with check (pos.can_manage(org_id));
create policy upd on pos.roles for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id));
create policy del on pos.roles for delete to authenticated using (pos.can_manage(org_id));
revoke all on pos.roles from anon;
grant select, insert, update, delete on pos.roles to authenticated;

do $$
declare t text;
begin
  foreach t in array array['role_dashboard_perms','role_pos_perms_module','role_dashboard_feature_perms','role_pos_feature_perms'] loop
    execute format('alter table pos.%I enable row level security', t);
    execute format($pol$create policy sel on pos.%I for select to authenticated using (role_id in (select id from pos.roles where org_id in (select pos.user_org_ids())))$pol$, t);
    execute format($pol$create policy ins on pos.%I for insert to authenticated with check (role_id in (select id from pos.roles where pos.can_manage(org_id)))$pol$, t);
    execute format($pol$create policy upd on pos.%I for update to authenticated using (role_id in (select id from pos.roles where pos.can_manage(org_id))) with check (role_id in (select id from pos.roles where pos.can_manage(org_id)))$pol$, t);
    execute format($pol$create policy del on pos.%I for delete to authenticated using (role_id in (select id from pos.roles where pos.can_manage(org_id)))$pol$, t);
    execute format('revoke all on pos.%I from anon', t);
    execute format('grant select, insert, update, delete on pos.%I to authenticated', t);
  end loop;
end $$;

create trigger trg_touch_roles before update on pos.roles for each row execute function pos.touch_updated_at();
create trigger trg_seq_roles before insert or update on pos.roles for each row execute function pos.set_sync_seq();
create trigger trg_log_roles after insert or update or delete on pos.roles for each row execute function pos.log_change('role');

-- ganti/simpan seluruh izin satu peran dalam satu panggilan atomik (dipakai tombol "Simpan" di wizard 4-langkah).
create or replace function pos.save_role_permissions(
  p_id uuid, p_org uuid, p_name text, p_description text, p_base_role text, p_owner_app_access boolean,
  p_default_dashboard_page text, p_default_pos_page text,
  p_can_authorize_refund boolean, p_can_authorize_void boolean, p_can_authorize_complimentary boolean,
  p_dashboard_modules jsonb, p_pos_modules jsonb, p_dashboard_features jsonb, p_pos_features jsonb
) returns uuid language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_id uuid; v_org uuid; v_row jsonb;
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if p_base_role not in ('owner','manager','cashier','kitchen','warehouse') then raise exception 'invalid base_role'; end if;
  if coalesce(jsonb_array_length(p_dashboard_modules), 0) > 100 or coalesce(jsonb_array_length(p_pos_modules), 0) > 100
     or coalesce(jsonb_array_length(p_dashboard_features), 0) > 2000 or coalesce(jsonb_array_length(p_pos_features), 0) > 2000 then
    raise exception 'too many rows';
  end if;

  if p_id is not null then
    select org_id into v_org from pos.roles where id = p_id and deleted_at is null;
    if v_org is null then raise exception 'role not found'; end if;
    if v_org <> p_org or not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
    update pos.roles set name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), ''),
      base_role = p_base_role, owner_app_access = (owner_app_access and p_owner_app_access) or (pos.is_org_admin(p_org) and p_owner_app_access),
      default_dashboard_page = p_default_dashboard_page, default_pos_page = p_default_pos_page,
      can_authorize_refund = p_can_authorize_refund, can_authorize_void = p_can_authorize_void,
      can_authorize_complimentary = p_can_authorize_complimentary
      where id = p_id returning id into v_id;
  else
    insert into pos.roles(org_id, name, description, base_role, owner_app_access, default_dashboard_page, default_pos_page,
      can_authorize_refund, can_authorize_void, can_authorize_complimentary)
    values (p_org, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_base_role, p_owner_app_access and pos.is_org_admin(p_org),
      p_default_dashboard_page, p_default_pos_page, p_can_authorize_refund, p_can_authorize_void, p_can_authorize_complimentary)
    returning id into v_id;
  end if;

  delete from pos.role_dashboard_perms where role_id = v_id;
  for v_row in select * from jsonb_array_elements(coalesce(p_dashboard_modules, '[]'::jsonb)) loop
    insert into pos.role_dashboard_perms(role_id, module_id, enabled)
    values (v_id, v_row->>'moduleId', coalesce((v_row->>'enabled')::boolean, true));
  end loop;

  delete from pos.role_pos_perms_module where role_id = v_id;
  for v_row in select * from jsonb_array_elements(coalesce(p_pos_modules, '[]'::jsonb)) loop
    insert into pos.role_pos_perms_module(role_id, module_id, enabled)
    values (v_id, v_row->>'moduleId', coalesce((v_row->>'enabled')::boolean, true));
  end loop;

  delete from pos.role_dashboard_feature_perms where role_id = v_id;
  for v_row in select * from jsonb_array_elements(coalesce(p_dashboard_features, '[]'::jsonb)) loop
    insert into pos.role_dashboard_feature_perms(role_id, module_id, feature_id, sub_feature_id, can_view, can_create, can_edit, can_delete, can_void)
    values (v_id, v_row->>'moduleId', v_row->>'featureId', coalesce(v_row->>'subFeatureId', ''),
      coalesce((v_row->>'canView')::boolean, false), coalesce((v_row->>'canCreate')::boolean, false),
      coalesce((v_row->>'canEdit')::boolean, false), coalesce((v_row->>'canDelete')::boolean, false), coalesce((v_row->>'canVoid')::boolean, false));
  end loop;

  delete from pos.role_pos_feature_perms where role_id = v_id;
  for v_row in select * from jsonb_array_elements(coalesce(p_pos_features, '[]'::jsonb)) loop
    insert into pos.role_pos_feature_perms(role_id, module_id, feature_id, sub_feature_id, can_view, can_create, can_edit, can_delete, can_void)
    values (v_id, v_row->>'moduleId', v_row->>'featureId', coalesce(v_row->>'subFeatureId', ''),
      coalesce((v_row->>'canView')::boolean, false), coalesce((v_row->>'canCreate')::boolean, false),
      coalesce((v_row->>'canEdit')::boolean, false), coalesce((v_row->>'canDelete')::boolean, false), coalesce((v_row->>'canVoid')::boolean, false));
  end loop;

  return v_id;
end $$;
revoke all on function pos.save_role_permissions(uuid, uuid, text, text, text, boolean, text, text, boolean, boolean, boolean, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function pos.save_role_permissions(uuid, uuid, text, text, text, boolean, text, text, boolean, boolean, boolean, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

create or replace function pos.delete_role(p_id uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_builtin boolean;
begin
  select org_id, is_built_in into v_org, v_builtin from pos.roles where id = p_id and deleted_at is null;
  if v_org is null then raise exception 'role not found'; end if;
  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  if v_builtin then raise exception 'cannot delete a built-in role'; end if;
  update pos.employees set role_id = null where role_id = p_id;
  update pos.roles set deleted_at = now() where id = p_id;
end $$;
revoke all on function pos.delete_role(uuid) from public, anon;
grant execute on function pos.delete_role(uuid) to authenticated, service_role;

commit;
