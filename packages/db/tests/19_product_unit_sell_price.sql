-- Satuan ganda untuk penjualan (migrasi 0139): harga jual satuan lain, satuan harus milik produk, batas stok memakai isi satuan.
create or replace function pg_temp.ok_pus(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails_pus(sql text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return true;
end $$;
create or replace function pg_temp.order_pus(pfx text, seq text, emp uuid, prod uuid, pu uuid, nm text, qty numeric, price numeric) returns jsonb language sql as $$
  select jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', q.i, 'payload', jsonb_build_object(
    'id', q.i, 'number', pfx || '261114/' || seq, 'order_type', 'takeaway', 'cashier_id', emp, 'opened_at', now(), 'client_created_at', now(),
    'subtotal', qty * price, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', qty * price,
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'product_id', prod, 'product_unit_id', pu, 'name', nm, 'qty', qty, 'unit_price', price,
      'extras_total', 0, 'discount', 0, 'tax_amount', 0, 'line_total', qty * price, 'sort', 0)),
    'discounts', '[]'::jsonb, 'tax_lines', '[]'::jsonb)) from (select gen_random_uuid() as i) q
$$;

do $$
declare
  o1 uuid := ctx('o1'); out1 uuid := ctx('out1'); dev uuid := ctx('dev'); emp uuid := ctx('emp'); ud uuid := ctx('ud');
  loc uuid := pos.outlet_location(out1);
  prod uuid := gen_random_uuid(); other uuid := gen_random_uuid(); pcs uuid; dus uuid; pu_dus uuid; pu_other uuid;
  cash uuid := gen_random_uuid(); pfx text; v jsonb; v_role text; price numeric;
begin
  select id into pcs from units where org_id = o1 and name = 'pcs';
  insert into products(id, org_id, kind, name, base_unit_id, track_stock) values (prod, o1, 'goods', 'Air Uji Satuan', pcs, true), (other, o1, 'goods', 'Lain Uji Satuan', pcs, true);
  insert into product_units(org_id, product_id, unit_id, is_base, conversion, price) values (o1, prod, pcs, true, 1, 5000);
  insert into product_units(org_id, product_id, unit_id, is_base, conversion, price) values (o1, other, pcs, true, 1, 7000) returning id into pu_other;
  insert into units(org_id, name) values (o1, 'dus uji') returning id into dus;
  insert into product_units(org_id, product_id, unit_id, is_base, conversion, price) values (o1, prod, dus, false, 12, 0) returning id into pu_dus;
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, ref_type, source_key) values (o1, loc, prod, 'opening', 20, 4000, 'test', 'pus-open-' || gen_random_uuid());
  insert into auth.users(id, email) values (cash, 'cash-pus@x');
  insert into org_members(org_id, user_id, role) values (o1, cash, 'cashier');
  select o.code || '/' || d.code || '/' into pfx from devices d join outlets o on o.id = d.outlet_id where d.id = dev;
  select role into v_role from org_members where org_id = o1 and user_id = ud;
  update org_members set role = 'admin' where org_id = o1 and user_id = ud;

  -- pengelola mengatur harga satuan lain
  perform set_config('request.jwt.claim.sub', ud::text, true);
  set local role authenticated;
  perform pos.product_unit_set_price(prod, dus, 55000);
  perform pg_temp.ok_pus(pg_temp.fails_pus(format('select pos.product_unit_set_price(%L, %L, 1000)', prod, pcs)), 'harga satuan dasar tidak diatur lewat fungsi ini');
  perform pg_temp.ok_pus(pg_temp.fails_pus(format('select pos.product_unit_set_price(%L, %L, -5)', prod, dus)), 'harga minus ditolak');
  perform pg_temp.ok_pus(pg_temp.fails_pus(format('select pos.product_unit_set_price(%L, %L, 10.5)', prod, dus)), 'harga pecahan ditolak');
  reset role;
  select pu.price into price from product_units pu where pu.id = pu_dus;
  perform pg_temp.ok_pus(price = 55000, 'harga satuan lain tersimpan');

  -- kasir tidak boleh
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok_pus(pg_temp.fails_pus(format('select pos.product_unit_set_price(%L, %L, 1)', prod, dus)), 'kasir tidak boleh mengatur harga satuan');
  reset role;

  -- penjualan satuan lain lewat sinkron: stok 20 pcs, 1 dus = 12 pcs
  perform set_config('request.jwt.claim.sub', ud::text, true);
  set local role authenticated;
  update outlet_settings set allow_negative_stock = false where outlet_id = out1;
  v := pos.sync_push(dev, jsonb_build_array(
    pg_temp.order_pus(pfx, '951', emp, prod, pu_dus, 'Air (dus uji)', 1, 55000),
    pg_temp.order_pus(pfx, '952', emp, prod, pu_dus, 'Air (dus uji)', 2, 55000),
    pg_temp.order_pus(pfx, '953', emp, prod, pu_other, 'Air', 1, 5000)
  ));
  perform pg_temp.ok_pus(v->0->>'status' = 'applied', '1 dus (12 pcs) dari stok 20 diterima: ' || coalesce(v->0->>'error', ''));
  perform pg_temp.ok_pus(v->1->>'status' = 'rejected' and coalesce(v->1->>'error', '') like '%insufficient_stock%', '2 dus (24 pcs) melebihi stok 20 ditolak: ' || coalesce(v->1->>'error', ''));
  perform pg_temp.ok_pus(v->2->>'status' = 'rejected' and coalesce(v->2->>'error', '') like '%unit_not_of_product%', 'satuan milik produk lain ditolak: ' || coalesce(v->2->>'error', ''));
  update outlet_settings set allow_negative_stock = true where outlet_id = out1;
  reset role;
  update org_members set role = v_role where org_id = o1 and user_id = ud;
end $$;
