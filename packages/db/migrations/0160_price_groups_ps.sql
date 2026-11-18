-- CG POS · 0160_price_groups_ps
-- Tipe pelanggan (grup harga spesial) untuk rental PS: "Normal" wajib ada dan tidak bisa dihapus/diganti nama/disembunyikan;
-- grup lain bebas ditambah pemilik (mis. Ojek Online, Shopee, Grab) dan masing-masing punya status "tayang di POS".
--  * customer_groups.is_default / show_in_pos / sort  : Normal = is_default; hanya grup dengan show_in_pos yang muncul sebagai pilihan di kasir.
--  * ps_group_rates          : tarif per jam konsol untuk satu grup (menggantikan tarif dasar dan pita jam; kosong = ikut harga Normal).
--  * ps_group_package_prices : harga paket untuk satu grup (kosong = ikut harga paket Normal).
--  * ps_group_prices_save(grup, tarif[], paket[]) mengganti semua harga PS satu grup (pengelola; grup Normal tidak punya penggantian).
alter table pos.customer_groups
  add column if not exists is_default boolean not null default false,
  add column if not exists show_in_pos boolean not null default true,
  add column if not exists sort int not null default 0;
create unique index if not exists customer_groups_one_default on pos.customer_groups (org_id) where is_default;

-- grup Normal untuk semua organisasi yang sudah ada (pakai grup bernama Normal bila sudah ada)
update pos.customer_groups g set is_default = true
 where lower(btrim(g.name)) = 'normal' and not exists (select 1 from pos.customer_groups d where d.org_id = g.org_id and d.is_default);
insert into pos.customer_groups(org_id, name, description, is_default, show_in_pos, sort)
select o.id, 'Normal', 'Harga biasa untuk pelanggan umum', true, true, -1 from pos.orgs o
 where not exists (select 1 from pos.customer_groups d where d.org_id = o.id and d.is_default);

-- organisasi baru otomatis punya grup Normal
create or replace function pos._org_default_price_group() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  insert into pos.customer_groups(org_id, name, description, is_default, show_in_pos, sort)
  select new.id, 'Normal', 'Harga biasa untuk pelanggan umum', true, true, -1
   where not exists (select 1 from pos.customer_groups d where d.org_id = new.id and d.is_default);
  return new;
end $$;
drop trigger if exists orgs_default_price_group on pos.orgs;
create trigger orgs_default_price_group after insert on pos.orgs for each row execute function pos._org_default_price_group();

-- penjaga grup Normal: tidak boleh dihapus, diganti nama, disembunyikan, atau dicopot statusnya
create or replace function pos._default_price_group_guard() returns trigger
language plpgsql set search_path = pos, extensions, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if old.is_default and exists (select 1 from pos.orgs where id = old.org_id) then raise exception 'default group cannot be deleted'; end if;
    return old;
  end if;
  if old.is_default then
    if new.is_default is not true or new.show_in_pos is not true or lower(btrim(new.name)) <> lower(btrim(old.name)) then raise exception 'default group is locked'; end if;
  elsif new.is_default and not old.is_default and lower(btrim(new.name)) <> 'normal' then
    raise exception 'default group must be named Normal';
  end if;
  return new;
end $$;
drop trigger if exists customer_groups_default_guard on pos.customer_groups;
create trigger customer_groups_default_guard before update or delete on pos.customer_groups for each row execute function pos._default_price_group_guard();

-- tayang atau tidak di POS (grup Normal selalu tayang)
create or replace function pos.customer_group_pos_visibility(p_org uuid, p_id uuid, p_show boolean) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  update pos.customer_groups set show_in_pos = coalesce(p_show, true), updated_at = now() where id = p_id and org_id = p_org;
  if not found then raise exception 'group not found'; end if;
end $$;

create table pos.ps_group_rates (
  org_id uuid not null references pos.orgs(id) on delete cascade,
  group_id uuid not null references pos.customer_groups(id) on delete cascade,
  table_id uuid not null,
  rate_per_hour numeric(18,0) not null check (rate_per_hour between 0 and 100000000),
  primary key (group_id, table_id),
  foreign key (table_id, org_id) references pos.tables(id, org_id) on delete cascade
);
create table pos.ps_group_package_prices (
  org_id uuid not null references pos.orgs(id) on delete cascade,
  group_id uuid not null references pos.customer_groups(id) on delete cascade,
  package_id uuid not null references pos.ps_packages(id) on delete cascade,
  price numeric(18,0) not null check (price between 0 and 100000000),
  primary key (group_id, package_id)
);
do $$
declare t text;
begin
  foreach t in array array['ps_group_rates', 'ps_group_package_prices'] loop
    execute format('alter table pos.%I enable row level security', t);
    execute format('create policy sel on pos.%I for select to authenticated using (org_id in (select pos.user_org_ids()))', t);
    execute format('revoke all on pos.%I from anon', t);
    execute format('revoke insert, update, delete on pos.%I from authenticated', t);
    execute format('grant select on pos.%I to authenticated', t);
    execute format('grant all on pos.%I to service_role', t);
  end loop;
end $$;

-- Ganti semua harga PS satu grup: p_rates = [{table_id, rate_per_hour}], p_packages = [{package_id, price}]; entri tanpa nilai dilewati.
create or replace function pos.ps_group_prices_save(p_group uuid, p_rates jsonb, p_packages jsonb) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare g pos.customer_groups%rowtype; r jsonb;
begin
  select * into g from pos.customer_groups where id = p_group;
  if not found then raise exception 'group not found'; end if;
  if not pos.can_manage(g.org_id) then raise exception 'not allowed'; end if;
  if g.is_default then raise exception 'default group has no overrides'; end if;
  if coalesce(jsonb_typeof(p_rates), 'array') <> 'array' or coalesce(jsonb_typeof(p_packages), 'array') <> 'array' then raise exception 'invalid prices'; end if;
  delete from pos.ps_group_rates where group_id = p_group;
  delete from pos.ps_group_package_prices where group_id = p_group;
  for r in select * from jsonb_array_elements(coalesce(p_rates, '[]'::jsonb)) loop
    if r->>'rate_per_hour' is null then continue; end if;
    if not exists (select 1 from pos.ps_stations s where s.table_id = (r->>'table_id')::uuid and s.org_id = g.org_id) then raise exception 'station not found'; end if;
    insert into pos.ps_group_rates(org_id, group_id, table_id, rate_per_hour) values (g.org_id, p_group, (r->>'table_id')::uuid, (r->>'rate_per_hour')::numeric);
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_packages, '[]'::jsonb)) loop
    if r->>'price' is null then continue; end if;
    if not exists (select 1 from pos.ps_packages p where p.id = (r->>'package_id')::uuid and p.org_id = g.org_id) then raise exception 'package not found'; end if;
    insert into pos.ps_group_package_prices(org_id, group_id, package_id, price) values (g.org_id, p_group, (r->>'package_id')::uuid, (r->>'price')::numeric);
  end loop;
end $$;

revoke all on function pos._org_default_price_group(), pos._default_price_group_guard() from public, anon, authenticated;
revoke all on function pos.customer_group_pos_visibility(uuid, uuid, boolean), pos.ps_group_prices_save(uuid, jsonb, jsonb) from public, anon;
grant execute on function pos.customer_group_pos_visibility(uuid, uuid, boolean), pos.ps_group_prices_save(uuid, jsonb, jsonb) to authenticated, service_role;
