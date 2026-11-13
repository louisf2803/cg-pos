-- CG POS · 0135_channel_and_time_prices
-- Harga per kanal ojek online (A135) dan harga berdasarkan waktu (hari + jam). Disimpan dan dikelola dari dashboard; penerapan di kasir menyusul
-- (kasir belum membaca tabel ini). Aturan waktu tidak boleh tumpang tindih untuk produk dan hari yang sama. Hanya pengelola (pos.can_manage).

create table pos.channel_prices (
  org_id uuid not null references pos.orgs(id) on delete cascade,
  product_id uuid not null,
  channel text not null check (channel in ('gofood', 'grabfood', 'shopeefood')),
  price numeric(18,2) not null check (price >= 0 and price <= 1000000000),
  updated_at timestamptz not null default now(),
  primary key (org_id, product_id, channel),
  foreign key (product_id, org_id) references pos.products(id, org_id) on delete cascade
);
create table pos.time_prices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  product_id uuid not null,
  days smallint[] not null check (cardinality(days) between 1 and 7),
  start_time time not null,
  end_time time not null,
  price numeric(18,2) not null check (price >= 0 and price <= 1000000000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (product_id, org_id) references pos.products(id, org_id) on delete cascade,
  check (end_time > start_time)
);
create index time_prices_product on pos.time_prices (org_id, product_id);
alter table pos.channel_prices enable row level security;
alter table pos.time_prices enable row level security;
create policy sel on pos.channel_prices for select to authenticated using (pos.can_manage(org_id));
create policy sel on pos.time_prices for select to authenticated using (pos.can_manage(org_id));
revoke all on pos.channel_prices, pos.time_prices from anon;
grant select on pos.channel_prices, pos.time_prices to authenticated;

create or replace function pos.channel_price_save(p_org uuid, p_product uuid, p_channel text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if p_channel not in ('gofood', 'grabfood', 'shopeefood') then raise exception 'invalid channel'; end if;
  if p_price is null or p_price < 0 or p_price > 1000000000 or p_price <> round(p_price, 2) then raise exception 'invalid price'; end if;
  if not exists (select 1 from products where id = p_product and org_id = p_org and deleted_at is null) then raise exception 'product not found'; end if;
  insert into channel_prices(org_id, product_id, channel, price) values (p_org, p_product, p_channel, p_price)
  on conflict (org_id, product_id, channel) do update set price = excluded.price, updated_at = now();
  return jsonb_build_object('product_id', p_product, 'channel', p_channel, 'price', p_price);
end $$;

create or replace function pos.channel_price_delete(p_org uuid, p_product uuid, p_channel text) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  delete from channel_prices where org_id = p_org and product_id = p_product and channel = p_channel;
  return jsonb_build_object('product_id', p_product, 'channel', p_channel, 'deleted', true);
end $$;

-- Simpan aturan harga waktu. p_days = hari 1 (Senin) sampai 7 (Minggu). Idempoten menurut p_id (id sama = ubah).
create or replace function pos.time_price_save(p_id uuid, p_org uuid, p_product uuid, p_days smallint[], p_start time, p_end time, p_price numeric, p_active boolean)
returns jsonb language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  if p_id is null then raise exception 'id required'; end if;
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if p_days is null or cardinality(p_days) not between 1 and 7 or exists (select 1 from unnest(p_days) d where d not between 1 and 7) then raise exception 'invalid days'; end if;
  if (select count(distinct d) from unnest(p_days) d) <> cardinality(p_days) then raise exception 'invalid days'; end if;
  if p_start is null or p_end is null or p_end <= p_start then raise exception 'invalid time'; end if;
  if p_price is null or p_price < 0 or p_price > 1000000000 or p_price <> round(p_price, 2) then raise exception 'invalid price'; end if;
  if not exists (select 1 from products where id = p_product and org_id = p_org and deleted_at is null) then raise exception 'product not found'; end if;
  if exists (select 1 from time_prices t where t.org_id = p_org and t.product_id = p_product and t.id <> p_id and t.is_active and coalesce(p_active, true)
             and t.days && p_days and t.start_time < p_end and p_start < t.end_time) then raise exception 'overlapping rule'; end if;
  if exists (select 1 from time_prices where id = p_id and org_id <> p_org) then raise exception 'not allowed'; end if;
  insert into time_prices(id, org_id, product_id, days, start_time, end_time, price, is_active)
  values (p_id, p_org, p_product, p_days, p_start, p_end, p_price, coalesce(p_active, true))
  on conflict (id) do update set product_id = excluded.product_id, days = excluded.days, start_time = excluded.start_time, end_time = excluded.end_time,
                                 price = excluded.price, is_active = excluded.is_active;
  return jsonb_build_object('id', p_id);
end $$;

create or replace function pos.time_price_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare t time_prices%rowtype;
begin
  select * into t from time_prices where id = p_id;
  if not found then return jsonb_build_object('id', p_id, 'deleted', false); end if;
  if not pos.can_manage(t.org_id) then raise exception 'not allowed'; end if;
  delete from time_prices where id = p_id;
  return jsonb_build_object('id', p_id, 'deleted', true);
end $$;

revoke all on function pos.channel_price_save(uuid, uuid, text, numeric), pos.channel_price_delete(uuid, uuid, text),
  pos.time_price_save(uuid, uuid, uuid, smallint[], time, time, numeric, boolean), pos.time_price_delete(uuid) from public, anon;
grant execute on function pos.channel_price_save(uuid, uuid, text, numeric), pos.channel_price_delete(uuid, uuid, text),
  pos.time_price_save(uuid, uuid, uuid, smallint[], time, time, numeric, boolean), pos.time_price_delete(uuid) to authenticated, service_role;
