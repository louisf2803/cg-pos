-- Varian (migrasi 0162): takaran stok per kolom induk, bahan ikut pilihan (gula, gelas), resep varian menggantikan resep biasa,
-- kolom induk yang belum lengkap tidak memotong stok, paling banyak dua induk, hanya pengelola yang boleh menyimpan.
create or replace function pg_temp.okv(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.failsv(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); out1 uuid := ctx('out1'); loc uuid := pos.outlet_location(ctx('out1'));
  gram uuid; pcs uuid; bean uuid := ctx('bean');
  milk uuid; sugar uuid; cup_d uuid; cup_t uuid; latte uuid; pu_latte uuid;
  g_size uuid; g_sugar uuid; g_serve uuid; s_s uuid; s_m uuid; sg_n uuid; sg_h uuid; sv_d uuid; sv_t uuid;
  ord uuid; oi uuid; setup jsonb; cashier uuid := gen_random_uuid();
  function_dummy int;
begin
  select id into gram from units where org_id = o1 and name = 'gram';
  select id into pcs from units where org_id = o1 and name = 'porsi';
  insert into products(org_id, kind, name, base_unit_id, is_sellable, track_stock) values (o1, 'ingredient', 'Susu V', gram, false, true) returning id into milk;
  insert into products(org_id, kind, name, base_unit_id, is_sellable, track_stock) values (o1, 'ingredient', 'Gula V', gram, false, true) returning id into sugar;
  insert into products(org_id, kind, name, base_unit_id, is_sellable, track_stock) values (o1, 'ingredient', 'Gelas Dine V', pcs, false, true) returning id into cup_d;
  insert into products(org_id, kind, name, base_unit_id, is_sellable, track_stock) values (o1, 'ingredient', 'Gelas Take V', pcs, false, true) returning id into cup_t;
  insert into product_units(org_id, product_id, unit_id, is_base, conversion) values (o1, milk, gram, true, 1), (o1, sugar, gram, true, 1), (o1, cup_d, pcs, true, 1), (o1, cup_t, pcs, true, 1);
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, source_key)
    values (o1, loc, milk, 'opening', 10000, 10, 'open:milkv'), (o1, loc, sugar, 'opening', 1000, 10, 'open:sugarv'),
           (o1, loc, cup_d, 'opening', 100, 500, 'open:cupdv'), (o1, loc, cup_t, 'opening', 100, 500, 'open:cuptv');
  insert into products(org_id, kind, name, base_unit_id) values (o1, 'goods', 'Latte V', pcs) returning id into latte;
  insert into product_units(org_id, product_id, unit_id, is_base, conversion, price) values (o1, latte, pcs, true, 1, 20000) returning id into pu_latte;
  insert into recipe_lines(org_id, product_id, ingredient_id, qty, unit_id) values (o1, latte, bean, 99, gram);  -- resep biasa; harus digantikan

  insert into extra_groups(org_id, name, select_mode, is_required) values (o1, 'Ukuran V', 'single', true) returning id into g_size;
  insert into extra_groups(org_id, name, select_mode, kind, material_ingredient_id, material_unit_id) values (o1, 'Gula V', 'single', 'material', sugar, gram) returning id into g_sugar;
  insert into extra_groups(org_id, name, select_mode, kind, is_required) values (o1, 'Penyajian V', 'single', 'cup', true) returning id into g_serve;
  insert into extra_options(org_id, group_id, name, sort) values (o1, g_size, 'Small', 1) returning id into s_s;
  insert into extra_options(org_id, group_id, name, sort) values (o1, g_size, 'Medium', 2) returning id into s_m;
  insert into extra_options(org_id, group_id, name, sort) values (o1, g_sugar, 'Normal', 1) returning id into sg_n;
  insert into extra_options(org_id, group_id, name, sort) values (o1, g_sugar, 'Half sugar', 2) returning id into sg_h;
  insert into extra_options(org_id, group_id, name, sort) values (o1, g_serve, 'Dine in', 1) returning id into sv_d;
  insert into extra_options(org_id, group_id, name, sort) values (o1, g_serve, 'Take away', 2) returning id into sv_t;

  setup := jsonb_build_object(
    'groups', jsonb_build_array(
      jsonb_build_object('group_id', g_size, 'is_parent', true, 'options', jsonb_build_array(jsonb_build_object('option_id', s_s, 'price_delta', 0), jsonb_build_object('option_id', s_m, 'price_delta', 3000))),
      jsonb_build_object('group_id', g_sugar, 'is_parent', false, 'options', jsonb_build_array(jsonb_build_object('option_id', sg_n, 'price_delta', 0), jsonb_build_object('option_id', sg_h, 'price_delta', 0))),
      jsonb_build_object('group_id', g_serve, 'is_parent', false, 'options', jsonb_build_array(jsonb_build_object('option_id', sv_d, 'price_delta', 0), jsonb_build_object('option_id', sv_t, 'price_delta', 0)))),
    'lines', jsonb_build_array(
      jsonb_build_object('combo_key', s_s::text, 'ingredient_id', bean, 'qty', 9, 'unit_id', gram),
      jsonb_build_object('combo_key', s_m::text, 'ingredient_id', bean, 'qty', 18, 'unit_id', gram),
      jsonb_build_object('combo_key', s_s::text, 'ingredient_id', milk, 'qty', 100, 'unit_id', gram),
      jsonb_build_object('combo_key', s_m::text, 'ingredient_id', milk, 'qty', 150, 'unit_id', gram),
      jsonb_build_object('option_id', sg_n, 'combo_key', s_s::text, 'ingredient_id', sugar, 'qty', 10, 'unit_id', gram),
      jsonb_build_object('option_id', sg_n, 'combo_key', s_m::text, 'ingredient_id', sugar, 'qty', 15, 'unit_id', gram),
      jsonb_build_object('option_id', sg_h, 'combo_key', s_s::text, 'ingredient_id', sugar, 'qty', 5, 'unit_id', gram),
      jsonb_build_object('option_id', sg_h, 'combo_key', s_m::text, 'ingredient_id', sugar, 'qty', 8, 'unit_id', gram),
      jsonb_build_object('option_id', sv_d, 'combo_key', s_s::text, 'ingredient_id', cup_d, 'qty', 1, 'unit_id', pcs),
      jsonb_build_object('option_id', sv_d, 'combo_key', s_m::text, 'ingredient_id', cup_d, 'qty', 1, 'unit_id', pcs),
      jsonb_build_object('option_id', sv_t, 'combo_key', s_s::text, 'ingredient_id', cup_t, 'qty', 1, 'unit_id', pcs),
      jsonb_build_object('option_id', sv_t, 'combo_key', s_m::text, 'ingredient_id', cup_t, 'qty', 1, 'unit_id', pcs),
      jsonb_build_object('combo_key', s_s::text, 'ingredient_id', cup_t, 'qty', 0, 'unit_id', pcs)));  -- qty 0 dilewati

  -- pengelola menyimpan
  perform set_config('request.jwt.claim.sub', ctx('u1')::text, true);
  set local role authenticated;
  perform pos.product_variants_save(latte, setup);
  reset role;
  perform pg_temp.okv((select count(*) from product_extra_groups where product_id = latte and is_parent) = 1, 'satu induk tersimpan');
  perform pg_temp.okv((select count(*) from product_extra_options where product_id = latte) = 6, 'enam isi diizinkan');
  perform pg_temp.okv((select count(*) from variant_stock_lines where product_id = latte) = 12, 'dua belas takaran (qty 0 dilewati)');
  perform pg_temp.okv((select price_delta from product_extra_options where product_id = latte and option_id = s_m) = 3000, 'tambahan harga Medium');
  -- simpan ulang = menggantikan, tidak menggandakan
  set local role authenticated; perform pos.product_variants_save(latte, setup); reset role;
  perform pg_temp.okv((select count(*) from variant_stock_lines where product_id = latte) = 12, 'simpan ulang tidak menggandakan');

  -- kasir tidak boleh menyimpan; dua induk lebih dari batas ditolak
  insert into auth.users(id, email) values (cashier, 'kasir-v@x');
  insert into org_members(org_id, user_id, role) values (o1, cashier, 'cashier');
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  set local role authenticated;
  perform pg_temp.okv(pg_temp.failsv(format('select pos.product_variants_save(%L, %L::jsonb)', latte, setup)), 'kasir ditolak menyimpan varian');
  reset role;
  perform set_config('request.jwt.claim.sub', ctx('u1')::text, true);
  set local role authenticated;
  perform pg_temp.okv(pg_temp.failsv(format('select pos.product_variants_save(%L, %L::jsonb)', latte, jsonb_build_object('groups', jsonb_build_array(
    jsonb_build_object('group_id', g_size, 'is_parent', true), jsonb_build_object('group_id', g_sugar, 'is_parent', true), jsonb_build_object('group_id', g_serve, 'is_parent', true)), 'lines', '[]'::jsonb))), 'tiga induk ditolak');
  reset role;

  -- order 1: 2 gelas Medium + Half sugar + Take away -> kopi 36, susu 300, gula 16, gelas take 2; gelas dine 0; resep biasa dilewati
  ord := gen_random_uuid(); oi := gen_random_uuid();
  insert into orders(id, org_id, outlet_id, device_id, cashier_id, number, order_type, status, subtotal, total, paid_total, opened_at, closed_at)
    values (ord, o1, out1, ctx('dev'), ctx('emp'), 'VAR-1', 'takeaway', 'paid', 46000, 46000, 46000, now(), now());
  insert into order_items(id, org_id, order_id, product_id, product_unit_id, name, qty, unit_price, line_total)
    values (oi, o1, ord, latte, pu_latte, 'Latte V', 2, 23000, 46000);
  insert into order_item_extras(id, org_id, order_item_id, option_id, name, price, qty)
    values (gen_random_uuid(), o1, oi, s_m, 'Medium', 3000, 2), (gen_random_uuid(), o1, oi, sg_h, 'Half sugar', 0, 2), (gen_random_uuid(), o1, oi, sv_t, 'Take away', 0, 2);
  insert into payments(id, org_id, outlet_id, order_id, method_id, amount, status, paid_at) values (gen_random_uuid(), o1, out1, ord, (select id from payment_methods where org_id = o1 and code = 'CASH'), (select total from orders where id = ord), 'succeeded', now());
  perform pos.finalize_order(ord);
  perform pg_temp.okv(-(select coalesce(sum(qty_delta), 0) from stock_movements where ref_id = ord and product_id = bean) = 36, 'kopi Medium 18 x 2 = 36 (bukan resep biasa 99)');
  perform pg_temp.okv(-(select coalesce(sum(qty_delta), 0) from stock_movements where ref_id = ord and product_id = milk) = 300, 'susu Medium 150 x 2');
  perform pg_temp.okv(-(select coalesce(sum(qty_delta), 0) from stock_movements where ref_id = ord and product_id = sugar) = 16, 'gula Half sugar Medium 8 x 2');
  perform pg_temp.okv(-(select coalesce(sum(qty_delta), 0) from stock_movements where ref_id = ord and product_id = cup_t) = 2, 'gelas take away 2');
  perform pg_temp.okv(not exists (select 1 from stock_movements where ref_id = ord and product_id = cup_d), 'gelas dine in tidak berkurang');

  -- order 2: Small tanpa gula dan tanpa penyajian dipilih -> hanya kopi 9 dan susu 100
  ord := gen_random_uuid(); oi := gen_random_uuid();
  insert into orders(id, org_id, outlet_id, device_id, cashier_id, number, order_type, status, subtotal, total, paid_total, opened_at, closed_at)
    values (ord, o1, out1, ctx('dev'), ctx('emp'), 'VAR-2', 'takeaway', 'paid', 20000, 20000, 20000, now(), now());
  insert into order_items(id, org_id, order_id, product_id, product_unit_id, name, qty, unit_price, line_total)
    values (oi, o1, ord, latte, pu_latte, 'Latte V', 1, 20000, 20000);
  insert into order_item_extras(id, org_id, order_item_id, option_id, name, price, qty) values (gen_random_uuid(), o1, oi, s_s, 'Small', 0, 1);
  insert into payments(id, org_id, outlet_id, order_id, method_id, amount, status, paid_at) values (gen_random_uuid(), o1, out1, ord, (select id from payment_methods where org_id = o1 and code = 'CASH'), (select total from orders where id = ord), 'succeeded', now());
  perform pos.finalize_order(ord);
  perform pg_temp.okv(-(select coalesce(sum(qty_delta), 0) from stock_movements where ref_id = ord and product_id = bean) = 9, 'kopi Small 9');
  perform pg_temp.okv(-(select coalesce(sum(qty_delta), 0) from stock_movements where ref_id = ord and product_id = milk) = 100, 'susu Small 100');
  perform pg_temp.okv(not exists (select 1 from stock_movements where ref_id = ord and product_id in (sugar, cup_t, cup_d)), 'tanpa gula/penyajian = tidak ada potongan');

  -- order 3: induk (ukuran) belum dipilih -> tidak ada potongan sama sekali (resep biasa juga dilewati)
  ord := gen_random_uuid(); oi := gen_random_uuid();
  insert into orders(id, org_id, outlet_id, device_id, cashier_id, number, order_type, status, subtotal, total, paid_total, opened_at, closed_at)
    values (ord, o1, out1, ctx('dev'), ctx('emp'), 'VAR-3', 'takeaway', 'paid', 20000, 20000, 20000, now(), now());
  insert into order_items(id, org_id, order_id, product_id, product_unit_id, name, qty, unit_price, line_total)
    values (oi, o1, ord, latte, pu_latte, 'Latte V', 1, 20000, 20000);
  insert into payments(id, org_id, outlet_id, order_id, method_id, amount, status, paid_at) values (gen_random_uuid(), o1, out1, ord, (select id from payment_methods where org_id = o1 and code = 'CASH'), (select total from orders where id = ord), 'succeeded', now());
  perform pos.finalize_order(ord);
  perform pg_temp.okv(not exists (select 1 from stock_movements where ref_id = ord and kind = 'sale'), 'induk belum dipilih: tidak ada potongan');

  -- produk tanpa resep varian tetap memakai resep biasa
  perform pg_temp.okv(not pos.has_variant_recipe(ctx('kopi')), 'Kopi Susu tanpa resep varian');
  perform pg_temp.okv(pos.has_variant_recipe(latte), 'Latte punya resep varian');

  delete from org_members where user_id = cashier;
end $$;
