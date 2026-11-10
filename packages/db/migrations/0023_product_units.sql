-- CG POS · 0023_product_units
-- Satuan ganda dan konversi: satu barang boleh dibeli atau diresepkan dalam satuan lain (mis. bahan dalam gram, dibeli per kg).
--   * pos.product_unit_save()  : tambah atau ubah satuan lain suatu barang (pemilik/admin/manajer). Konversi = berapa satuan dasar
--                                dalam satu satuan ini. Satuan dasar tidak bisa diubah konversinya (selalu 1). Mengubah konversi satuan
--                                yang sudah dipakai (resep, pesanan stok, faktur, penjualan) ditolak, karena angka lama ikut berubah arti.
--                                Nama satuan baru dibuat otomatis bila belum ada (tanpa membedakan huruf besar kecil).
--   * pos.product_unit_remove(): arsipkan satuan lain (bukan dasar) yang belum dipakai.
--   * pos.product_unit_list()  : daftar satuan satu barang beserta penanda sudah dipakai.
-- Tabel pos.product_units tidak diubah.
begin;

create or replace function pos.product_unit_in_use(p_product uuid, p_unit uuid, p_pu uuid) returns boolean
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select exists (select 1 from pos.recipe_lines where ingredient_id = p_product and unit_id = p_unit)
      or exists (select 1 from pos.purchase_order_lines where product_id = p_product and unit_id = p_unit)
      or exists (select 1 from pos.purchase_invoice_lines where product_id = p_product and unit_id = p_unit)
      or exists (select 1 from pos.order_items where product_unit_id = p_pu)
$$;
revoke all on function pos.product_unit_in_use(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function pos.product_unit_save(p_product uuid, p_unit_name text, p_conversion numeric, p_buy_price numeric default 0, p_min_purchase numeric default 1)
returns uuid
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  v_org uuid; v_kind text; v_base uuid; v_unit uuid; v_name text := btrim(coalesce(p_unit_name, '')); r pos.product_units;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select org_id, kind, base_unit_id into v_org, v_kind, v_base from pos.products where id = p_product and deleted_at is null;
  if not found then raise exception 'product not found'; end if;
  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  if v_kind not in ('goods', 'ingredient') then raise exception 'product kind % has no units', v_kind; end if;
  if v_name = '' or char_length(v_name) > 30 then raise exception 'unit name must be 1 to 30 characters'; end if;
  if p_conversion is null or p_conversion <= 0 or p_conversion > 1000000 or p_conversion <> round(p_conversion, 6) then raise exception 'conversion must be between 0 and 1000000 with at most 6 decimals'; end if;
  if p_buy_price is null or p_buy_price < 0 or p_buy_price <> round(p_buy_price, 4) then raise exception 'buy price must be zero or more with at most 4 decimals'; end if;
  if p_min_purchase is null or p_min_purchase <= 0 or p_min_purchase <> round(p_min_purchase, 4) then raise exception 'minimum purchase must be above zero with at most 4 decimals'; end if;

  select id into v_unit from pos.units where org_id = v_org and lower(name) = lower(v_name) and deleted_at is null;
  if v_unit is null then insert into pos.units(org_id, name) values (v_org, v_name) returning id into v_unit; end if;

  select * into r from pos.product_units where product_id = p_product and unit_id = v_unit;
  if found then
    if r.is_base then
      if p_conversion <> 1 then raise exception 'base unit conversion is always 1'; end if;
      update pos.product_units set buy_price = p_buy_price, min_purchase = p_min_purchase where id = r.id;
      return r.id;
    end if;
    if r.deleted_at is null and r.conversion <> p_conversion and pos.product_unit_in_use(p_product, v_unit, r.id) then raise exception 'unit in use: conversion cannot change'; end if;
    update pos.product_units set conversion = p_conversion, buy_price = p_buy_price, min_purchase = p_min_purchase, deleted_at = null where id = r.id;
    return r.id;
  end if;
  if v_unit = v_base then raise exception 'unit is already the base unit'; end if;
  insert into pos.product_units(org_id, product_id, unit_id, conversion, is_base, buy_price, min_purchase)
  values (v_org, p_product, v_unit, p_conversion, false, p_buy_price, p_min_purchase) returning id into r.id;
  return r.id;
end $$;
revoke all on function pos.product_unit_save(uuid, text, numeric, numeric, numeric) from public, anon;
grant execute on function pos.product_unit_save(uuid, text, numeric, numeric, numeric) to authenticated, service_role;

create or replace function pos.product_unit_remove(p_product uuid, p_unit uuid) returns boolean
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; r pos.product_units;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select org_id into v_org from pos.products where id = p_product and deleted_at is null;
  if not found then raise exception 'product not found'; end if;
  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  select * into r from pos.product_units where product_id = p_product and unit_id = p_unit and deleted_at is null;
  if not found then return false; end if;
  if r.is_base then raise exception 'base unit cannot be removed'; end if;
  if pos.product_unit_in_use(p_product, p_unit, r.id) then raise exception 'unit in use: cannot remove'; end if;
  update pos.product_units set deleted_at = now() where id = r.id;
  return true;
end $$;
revoke all on function pos.product_unit_remove(uuid, uuid) from public, anon;
grant execute on function pos.product_unit_remove(uuid, uuid) to authenticated, service_role;

create or replace function pos.product_unit_list(p_product uuid)
returns table(id uuid, unit_id uuid, unit_name text, conversion numeric, is_base boolean, buy_price numeric, min_purchase numeric, in_use boolean)
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select pr.org_id into v_org from pos.products pr where pr.id = p_product and pr.deleted_at is null;
  if not found then raise exception 'product not found'; end if;
  if v_org not in (select pos.user_org_ids()) then raise exception 'not allowed'; end if;
  return query
  select pu.id, pu.unit_id, u.name, pu.conversion, pu.is_base, pu.buy_price, pu.min_purchase, pos.product_unit_in_use(p_product, pu.unit_id, pu.id)
    from pos.product_units pu join pos.units u on u.id = pu.unit_id
   where pu.product_id = p_product and pu.deleted_at is null
   order by pu.is_base desc, pu.conversion, u.name;
end $$;
revoke all on function pos.product_unit_list(uuid) from public, anon;
grant execute on function pos.product_unit_list(uuid) to authenticated, service_role;

commit;
