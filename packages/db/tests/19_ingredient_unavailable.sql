-- Bahan habis per outlet (migrasi 0150): pengelola menandai, kasir hanya membaca, menu berisi bahan itu ikut tidak tersedia,
-- stok minus TIDAK otomatis menandai, stok masuk menghapus penanda, penjualan tidak, org lain tertutup.
create or replace function pg_temp.ok50(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails50(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); out1 uuid := ctx('out1'); bean uuid; kopi uuid; air uuid; gram uuid; pcs uuid; loc uuid := pos.outlet_location(ctx('out1'));
  mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid; n int;
begin
  select id into pcs from units where org_id = o1 and name = 'porsi'; select id into gram from units where org_id = o1 and name = 'gram';
  insert into products(org_id, kind, name, base_unit_id, is_sellable, track_stock) values (o1, 'ingredient', 'IU Matcha', gram, false, true) returning id into bean;
  insert into product_units(org_id, product_id, unit_id, is_base, conversion) values (o1, bean, gram, true, 1);
  insert into products(org_id, kind, name, base_unit_id) values (o1, 'goods', 'IU Matcha Latte', pcs) returning id into kopi;
  insert into product_units(org_id, product_id, unit_id, is_base, conversion, price) values (o1, kopi, pcs, true, 1, 25000);
  insert into recipe_lines(org_id, product_id, ingredient_id, qty, unit_id) values (o1, kopi, bean, 15, gram);
  insert into products(org_id, kind, name, base_unit_id, track_stock) values (o1, 'goods', 'IU Botol', pcs, true) returning id into air;
  insert into product_units(org_id, product_id, unit_id, is_base, conversion, price) values (o1, air, pcs, true, 1, 6000);
  insert into auth.users(id, email) values (mgr, 'mgr-iu@x'), (cash, 'cash-iu@x'), (stranger, 'stranger-iu@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;

  -- stok minus saja tidak menandai apa pun
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, reason) values (o1, loc, bean, 'waste', -100000, 'uji minus');
  perform pg_temp.ok50((select count(*) from ingredient_unavailable where outlet_id = out1) = 0, 'stok minus tidak otomatis menandai');

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok50(pg_temp.fails50(format('select pos.ingredient_availability_set(%L, %L, true)', out1, bean)), 'kasir tidak boleh menandai');
  reset role;

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pos.ingredient_availability_set(out1, bean, true);
  perform pos.ingredient_availability_set(out1, bean, true);   -- idempoten
  reset role;
  perform pg_temp.ok50((select count(*) from ingredient_unavailable where outlet_id = out1 and product_id = bean) = 1, 'bahan tertandai satu baris');
  perform pg_temp.ok50((select count(*) from activity_logs where action = 'stock.marked_unavailable' and entity_id = bean) >= 1, 'tercatat di log aktivitas');

  -- kasir membaca daftar dan menu yang ikut habis
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok50((select count(*) from pos.ingredient_unavailable) = 1, 'kasir membaca penanda');
  perform pg_temp.ok50(exists (select 1 from pos.unavailable_products(out1) where product_id = kopi), 'menu beresep bahan itu ikut habis');
  reset role;

  -- barang yang dijual langsung ikut habis bila ditandai
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pos.ingredient_availability_set(out1, air, true);
  perform pg_temp.ok50(exists (select 1 from pos.unavailable_products(out1) where product_id = air), 'barang jual langsung ikut habis');
  perform pos.ingredient_availability_set(out1, air, false);
  perform pg_temp.ok50(not exists (select 1 from pos.unavailable_products(out1) where product_id = air), 'dihapus manual: tersedia lagi');
  reset role;

  -- penjualan tidak menghapus penanda; stok masuk menghapus
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta) values (o1, loc, bean, 'sale', -1);
  perform pg_temp.ok50((select count(*) from ingredient_unavailable where outlet_id = out1 and product_id = bean) = 1, 'penjualan tidak menghapus penanda');
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta) values (o1, loc, bean, 'sale_void', 1);
  perform pg_temp.ok50((select count(*) from ingredient_unavailable where outlet_id = out1 and product_id = bean) = 1, 'pembatalan penjualan tidak menghapus penanda');
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta) values (o1, loc, bean, 'purchase_receipt', 500);
  perform pg_temp.ok50((select count(*) from ingredient_unavailable where outlet_id = out1 and product_id = bean) = 0, 'stok masuk menghapus penanda otomatis');

  -- stok masuk manual (dashboard) juga menyalakan lagi
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pos.ingredient_availability_set(out1, bean, true);
  reset role;
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta) values (o1, loc, bean, 'adjust_in', 10);
  perform pg_temp.ok50((select count(*) from ingredient_unavailable where outlet_id = out1 and product_id = bean) = 0, 'stok masuk manual menyalakan lagi');

  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok50(pg_temp.fails50(format('select pos.ingredient_availability_set(%L, %L, true)', out1, bean)), 'org lain tidak boleh menandai');
    perform pg_temp.ok50((select count(*) from pos.unavailable_products(out1)) = 0, 'org lain tidak melihat daftar');
    reset role;
  end if;
  delete from activity_logs where action in ('stock.marked_unavailable', 'stock.marked_available');
end $$;
