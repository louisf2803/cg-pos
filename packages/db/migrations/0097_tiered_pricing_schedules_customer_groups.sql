-- CG POS · 0097_tiered_pricing_schedules_customer_groups
-- Menambahkan dukungan server penuh untuk:
-- 1. Grup Pelanggan (customer_groups & customer_group_members)
-- 2. Harga Grosir Bertingkat per grup & produk (tiered_prices, sampai 5 tingkat)
-- 3. Penjadwalan Harga produk (price_schedules)
-- ASUMSI: Setiap pelanggan hanya dapat menjadi anggota dari tepat satu grup aktif. Harga bertingkat tersimpan sebagai array JSONB tiers [{tier, minQty, unitPrice}].

-- 1. Perluas tabel customer_groups
alter table pos.customer_groups add column if not exists description text default '';
alter table pos.customer_groups add column if not exists updated_at timestamptz not null default now();

-- 2. Tabel customer_group_members
create table if not exists pos.customer_group_members (
  org_id uuid not null references pos.orgs(id) on delete cascade,
  customer_id uuid not null references pos.customers(id) on delete cascade,
  group_id uuid not null references pos.customer_groups(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (org_id, customer_id)
);

alter table pos.customer_group_members enable row level security;
drop policy if exists sel on pos.customer_group_members;
create policy sel on pos.customer_group_members for select to authenticated using (pos.can_manage(org_id));
revoke all on pos.customer_group_members from anon;
grant select on pos.customer_group_members to authenticated;

-- 3. Tabel tiered_prices
create table if not exists pos.tiered_prices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  group_id uuid not null references pos.customer_groups(id) on delete cascade,
  product_id uuid not null,
  tiers jsonb not null default '[]'::jsonb check (jsonb_typeof(tiers) = 'array'),
  updated_at timestamptz not null default now(),
  foreign key (product_id, org_id) references pos.products(id, org_id) on delete cascade,
  unique (org_id, group_id, product_id)
);

alter table pos.tiered_prices enable row level security;
drop policy if exists sel on pos.tiered_prices;
create policy sel on pos.tiered_prices for select to authenticated using (pos.can_manage(org_id));
revoke all on pos.tiered_prices from anon;
grant select on pos.tiered_prices to authenticated;

-- 4. Perluas price_schedules
alter table pos.price_schedules add column if not exists product_id uuid;
alter table pos.price_schedules add column if not exists note text default '';
alter table pos.price_schedules alter column product_unit_id drop not null;

-- Backfill product_id dari product_units bila belum terisi
update pos.price_schedules ps
   set product_id = pu.product_id
  from pos.product_units pu
 where ps.product_unit_id = pu.id and ps.product_id is null;

-- Tambahkan foreign key untuk product_id jika belum ada
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'price_schedules_product_id_fkey'
  ) then
    alter table pos.price_schedules
      add constraint price_schedules_product_id_fkey
      foreign key (product_id, org_id) references pos.products(id, org_id) on delete cascade;
  end if;
end $$;

alter table pos.price_schedules enable row level security;
drop policy if exists sel on pos.price_schedules;
create policy sel on pos.price_schedules for select to authenticated using (pos.can_manage(org_id));
revoke all on pos.price_schedules from anon;
grant select on pos.price_schedules to authenticated;

-- 5. RPC Grup Pelanggan
create or replace function pos.customer_group_save(
  p_org uuid,
  p_id uuid,
  p_name text,
  p_description text default ''
) returns pos.customer_groups
language plpgsql security definer set search_path = pos, pg_temp as $$
declare
  v_res pos.customer_groups;
  v_name text;
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  v_name := trim(p_name);
  if v_name is null or length(v_name) = 0 then raise exception 'invalid group name'; end if;

  if p_id is not null and exists (select 1 from pos.customer_groups where id = p_id and org_id = p_org) then
    update pos.customer_groups
       set name = v_name,
           description = coalesce(p_description, ''),
           updated_at = now()
     where id = p_id and org_id = p_org
     returning * into v_res;
  else
    insert into pos.customer_groups (id, org_id, name, description, created_at, updated_at)
    values (coalesce(p_id, gen_random_uuid()), p_org, v_name, coalesce(p_description, ''), now(), now())
    returning * into v_res;
  end if;
  return v_res;
end $$;

create or replace function pos.customer_group_delete(
  p_org uuid,
  p_id uuid
) returns void
language plpgsql security definer set search_path = pos, pg_temp as $$
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  delete from pos.customer_group_members where group_id = p_id and org_id = p_org;
  delete from pos.tiered_prices where group_id = p_id and org_id = p_org;
  delete from pos.customer_groups where id = p_id and org_id = p_org;
end $$;

create or replace function pos.customer_group_assign(
  p_org uuid,
  p_customer_id uuid,
  p_group_id uuid
) returns void
language plpgsql security definer set search_path = pos, pg_temp as $$
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if not exists (select 1 from pos.customers where id = p_customer_id and org_id = p_org and deleted_at is null) then
    raise exception 'customer not found';
  end if;

  if p_group_id is null then
    delete from pos.customer_group_members where org_id = p_org and customer_id = p_customer_id;
    update pos.customers set group_id = null where id = p_customer_id and org_id = p_org;
  else
    if not exists (select 1 from pos.customer_groups where id = p_group_id and org_id = p_org) then
      raise exception 'group not found';
    end if;
    insert into pos.customer_group_members (org_id, customer_id, group_id, assigned_at)
    values (p_org, p_customer_id, p_group_id, now())
    on conflict (org_id, customer_id) do update set group_id = excluded.group_id, assigned_at = excluded.assigned_at;
    update pos.customers set group_id = p_group_id where id = p_customer_id and org_id = p_org;
  end if;
end $$;

-- 6. RPC Harga Grosir Bertingkat
create or replace function pos.tiered_price_save(
  p_org uuid,
  p_id uuid,
  p_group_id uuid,
  p_product_id uuid,
  p_tiers jsonb
) returns pos.tiered_prices
language plpgsql security definer set search_path = pos, pg_temp as $$
declare
  v_res pos.tiered_prices;
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if not exists (select 1 from pos.customer_groups where id = p_group_id and org_id = p_org) then
    raise exception 'group not found';
  end if;
  if not exists (select 1 from pos.products where id = p_product_id and org_id = p_org and deleted_at is null) then
    raise exception 'product not found';
  end if;
  if jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) > 5 then
    raise exception 'invalid tiers count';
  end if;

  insert into pos.tiered_prices (id, org_id, group_id, product_id, tiers, updated_at)
  values (coalesce(p_id, gen_random_uuid()), p_org, p_group_id, p_product_id, p_tiers, now())
  on conflict (org_id, group_id, product_id) do update
     set tiers = excluded.tiers,
         updated_at = now()
  returning * into v_res;
  return v_res;
end $$;

create or replace function pos.tiered_price_delete(
  p_org uuid,
  p_id uuid default null,
  p_group_id uuid default null,
  p_product_id uuid default null
) returns void
language plpgsql security definer set search_path = pos, pg_temp as $$
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if p_id is not null then
    delete from pos.tiered_prices where id = p_id and org_id = p_org;
  elsif p_group_id is not null and p_product_id is not null then
    delete from pos.tiered_prices where group_id = p_group_id and product_id = p_product_id and org_id = p_org;
  end if;
end $$;

-- 7. RPC Penjadwalan Harga
create or replace function pos.price_schedule_save(
  p_org uuid,
  p_id uuid,
  p_product_id uuid,
  p_price numeric,
  p_start timestamptz,
  p_end timestamptz,
  p_note text default ''
) returns pos.price_schedules
language plpgsql security definer set search_path = pos, pg_temp as $$
declare
  v_res pos.price_schedules;
  v_unit_id uuid;
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if p_price < 0 then raise exception 'price cannot be negative'; end if;
  if p_end <= p_start then raise exception 'end time must be after start time'; end if;
  if not exists (select 1 from pos.products where id = p_product_id and org_id = p_org and deleted_at is null) then
    raise exception 'product not found';
  end if;

  select id into v_unit_id from pos.product_units where product_id = p_product_id and org_id = p_org and is_base limit 1;

  if p_id is not null and exists (select 1 from pos.price_schedules where id = p_id and org_id = p_org) then
    update pos.price_schedules
       set product_id = p_product_id,
           product_unit_id = coalesce(v_unit_id, product_unit_id),
           price = p_price,
           starts_at = p_start,
           ends_at = p_end,
           note = coalesce(p_note, ''),
           updated_at = now()
     where id = p_id and org_id = p_org
     returning * into v_res;
  else
    insert into pos.price_schedules (id, org_id, product_id, product_unit_id, price, starts_at, ends_at, note, is_active, created_at, updated_at)
    values (coalesce(p_id, gen_random_uuid()), p_org, p_product_id, v_unit_id, p_price, p_start, p_end, coalesce(p_note, ''), true, now(), now())
    returning * into v_res;
  end if;
  return v_res;
end $$;

create or replace function pos.price_schedule_delete(
  p_org uuid,
  p_id uuid
) returns void
language plpgsql security definer set search_path = pos, pg_temp as $$
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  delete from pos.price_schedules where id = p_id and org_id = p_org;
end $$;

