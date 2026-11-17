-- CG POS · 0150_ingredient_unavailable
-- Bahan habis (ditandai MANUAL oleh pengelola) per outlet. Semua menu yang berisi bahan itu (resep, paket, atau barang yang dijual langsung)
-- ikut tidak tersedia di kasir. Keputusan Louis (17 Nov 2026):
--  * stok di sistem yang 0 atau minus TIDAK otomatis menonaktifkan (sistem dan kenyataan bisa berbeda); hanya penanda manual yang berlaku;
--  * penanda per outlet; pesanan yang sudah tersimpan tetap boleh dibayar (penegakan hanya saat menambah item di kasir);
--  * saat stok diisi lagi (penerimaan pembelian, transfer masuk, produksi masuk, stok awal, atau opname yang menambah) penanda hilang sendiri.
-- Tulis hanya lewat ingredient_availability_set (pengelola); semua anggota organisasi boleh membaca (kasir perlu daftar menu yang habis).

create table pos.ingredient_unavailable (
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid not null,
  product_id uuid not null,
  marked_by uuid,
  marked_at timestamptz not null default now(),
  primary key (outlet_id, product_id),
  foreign key (outlet_id, org_id) references pos.outlets(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references pos.products(id, org_id) on delete cascade
);
create index ingredient_unavailable_org on pos.ingredient_unavailable (org_id);

alter table pos.ingredient_unavailable enable row level security;
create policy sel on pos.ingredient_unavailable for select to authenticated using (org_id in (select pos.user_org_ids()));
revoke all on pos.ingredient_unavailable from anon;
grant select on pos.ingredient_unavailable to authenticated;
grant all on pos.ingredient_unavailable to service_role;

create or replace function pos.ingredient_availability_set(p_outlet uuid, p_product uuid, p_unavailable boolean) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select org_id into v_org from outlets where id = p_outlet;
  if v_org is null then raise exception 'outlet not found'; end if;
  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  select name into v_name from products where id = p_product and org_id = v_org and deleted_at is null;
  if v_name is null then raise exception 'product not found'; end if;
  if p_unavailable then
    insert into ingredient_unavailable(org_id, outlet_id, product_id, marked_by) values (v_org, p_outlet, p_product, auth.uid())
    on conflict (outlet_id, product_id) do nothing;
  else
    delete from ingredient_unavailable where outlet_id = p_outlet and product_id = p_product;
  end if;
  insert into activity_logs(org_id, outlet_id, actor_user_id, action, entity, entity_id, detail)
  values (v_org, p_outlet, auth.uid(), case when p_unavailable then 'stock.marked_unavailable' else 'stock.marked_available' end, 'product', p_product, jsonb_build_object('name', v_name));
end $$;
revoke all on function pos.ingredient_availability_set(uuid, uuid, boolean) from public, anon;
grant execute on function pos.ingredient_availability_set(uuid, uuid, boolean) to authenticated, service_role;

-- Stok masuk membersihkan penanda: hanya jenis yang benar-benar mengisi stok (bukan pengembalian penjualan).
create or replace function pos.clear_unavailable_on_restock() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  if new.qty_delta > 0 and new.kind in ('purchase_receipt', 'transfer_in', 'production_in', 'opening', 'opname_adjust') then
    delete from ingredient_unavailable u
     using locations l
     where l.id = new.location_id and l.outlet_id is not null and u.outlet_id = l.outlet_id and u.product_id = new.product_id;
  end if;
  return null;
end $$;
create trigger stock_movements_clear_unavailable after insert on pos.stock_movements
  for each row execute function pos.clear_unavailable_on_restock();

-- Menu yang tidak tersedia di satu outlet: bahannya (lewat resep, paket, atau dirinya sendiri) ada di daftar habis.
create or replace function pos.unavailable_products(p_outlet uuid) returns table(product_id uuid, ingredient_ids uuid[], ingredient_names text[])
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid;
begin
  select org_id into v_org from outlets where id = p_outlet;
  if v_org is null or v_org not in (select pos.user_org_ids()) then return; end if;
  if not exists (select 1 from ingredient_unavailable where outlet_id = p_outlet) then return; end if;
  return query
    select p.id, array_agg(distinct ing.id), array_agg(distinct ing.name order by ing.name)
      from products p
      cross join lateral pos.sale_components(p.id, 1) c
      join ingredient_unavailable u on u.outlet_id = p_outlet and u.product_id = c.component_id
      join products ing on ing.id = u.product_id
     where p.org_id = v_org and p.deleted_at is null
     group by p.id;
end $$;
revoke all on function pos.unavailable_products(uuid) from public, anon;
grant execute on function pos.unavailable_products(uuid) to authenticated, service_role;
