-- CG POS · 0025_custom_item
-- Item bebas (custom amount): jual barang/jasa yang tidak ada di menu dengan nama dan harga ditulis kasir.
--   * pos.custom_item_product(p_org): mengembalikan id produk sistem "Item bebas" milik org (dibuat otomatis, satu per org).
--     Produk ini disembunyikan dari menu (show_in_menu = false), tanpa stok, sehingga tidak muncul di daftar produk kasir.
--     Nama dan harga tiap baris tetap disalin ke order_items oleh klien, jadi laporan menampilkan nama yang diketik kasir.
--     Siapa saja anggota org (termasuk kasir) boleh memanggil; non-anggota ditolak. Tabel tidak diubah.
begin;

create or replace function pos.custom_item_product(p_org uuid) returns uuid
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  v_id uuid; v_unit uuid;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  if not exists (select 1 from pos.org_members where org_id = p_org and user_id = auth.uid()) then raise exception 'not allowed'; end if;
  select p.id into v_id from pos.products p
   where p.org_id = p_org and p.name = 'Item bebas' and p.show_in_menu = false and p.is_sellable and p.kind = 'goods' and p.deleted_at is null limit 1;
  if v_id is not null then return v_id; end if;
  select id into v_unit from pos.units where org_id = p_org and name = 'pcs' and deleted_at is null limit 1;
  if v_unit is null then
    insert into pos.units(org_id, name) values (p_org, 'pcs') on conflict (org_id, name) do update set deleted_at = null returning id into v_unit;
  end if;
  insert into pos.products(org_id, kind, name, base_unit_id, is_sellable, show_in_menu, track_stock, is_active)
    values (p_org, 'goods', 'Item bebas', v_unit, true, false, false, true) returning id into v_id;
  insert into pos.product_units(org_id, product_id, unit_id, conversion, is_base, price) values (p_org, v_id, v_unit, 1, true, 0);
  return v_id;
end $$;
revoke all on function pos.custom_item_product(uuid) from public, anon;
grant execute on function pos.custom_item_product(uuid) to authenticated, service_role;

commit;
