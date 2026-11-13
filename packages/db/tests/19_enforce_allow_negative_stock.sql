-- CG POS · 19_enforce_allow_negative_stock.sql
-- Pengujian penegakan pengaturan allow_negative_stock:
-- 1) pos.stock_post menolak adjust_out & waste jika stok jadi minus saat allow_negative_stock = false
-- 2) pos.sync_push (order.upsert) menolak order jika melebihi stok saat allow_negative_stock = false
-- 3) pos.stock_post & sync_push mengizinkan saat allow_negative_stock = true

create or replace function pg_temp.ok127(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

create or replace function pg_temp.fails127(sql text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then
    raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql;
  end if;
  return true;
end $$;

do $$
declare
  o1 uuid := ctx('o1');
  out1 uuid := ctx('out1');
  dev uuid := ctx('dev');
  loc uuid := pos.outlet_location(out1);
  kopi uuid := gen_random_uuid();
  pu_kopi uuid;
  pcs uuid;
  emp uuid := ctx('emp');
  ud uuid := ctx('ud');
  pfx text;
  v jsonb;
  pl_ok jsonb;
  pl_over jsonb;
  cur_qty numeric;
  r jsonb;
  v_role text;
begin
  -- barang jual yang stoknya dilacak langsung (produk resep tidak dicek di penyimpanan pesanan)
  select id into pcs from units where org_id = o1 and name = 'pcs';
  insert into products(id, org_id, kind, name, base_unit_id, track_stock) values (kopi, o1, 'goods', 'Roti Uji A127', pcs, true);
  insert into product_units(org_id, product_id, unit_id, is_base, conversion, price) values (o1, kopi, pcs, true, 1, 20000) returning id into pu_kopi;
  select o.code || '/' || d.code || '/' into pfx from devices d join outlets o on o.id = d.outlet_id where d.id = dev;
  -- Siapkan stok awal kopi minimal 5 sebagai pemilik basis data (pengguna uji tidak membaca saldo langsung)
  cur_qty := coalesce((select qty from stock_balances where location_id = loc and product_id = kopi), 0);
  if cur_qty < 5 then
    insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, ref_type, source_key) values (o1, loc, kopi, 'opening', 5 - cur_qty, 10000, 'test', 'a127-open-' || gen_random_uuid());
  end if;
  select qty into cur_qty from stock_balances where location_id = loc and product_id = kopi;
  -- pengguna perangkat menjadi admin selama tes supaya boleh memakai pos.stock_post (dikembalikan di akhir)
  select role into v_role from org_members where org_id = o1 and user_id = ud;
  update org_members set role = 'admin' where org_id = o1 and user_id = ud;
  perform set_config('request.jwt.claim.sub', ud::text, true);
  set local role authenticated;

  -----------------------------------------------------------------------------------------------
  -- Kasus 1: allow_negative_stock = false
  -----------------------------------------------------------------------------------------------
  update outlet_settings set allow_negative_stock = false where outlet_id = out1;

  -- 1a: pos.stock_post adjust_out melebihi stok harus ditolak
  perform pg_temp.ok127(
    pg_temp.fails127(format('select pos.stock_post(%L, %L, %L, %s, null, null, null)', loc, kopi, 'adjust_out', cur_qty + 1)),
    'pos.stock_post adjust_out melebihi stok ditolak saat allow_negative_stock = false'
  );

  -- 1b: pos.stock_post waste melebihi stok harus ditolak
  perform pg_temp.ok127(
    pg_temp.fails127(format('select pos.stock_post(%L, %L, %L, %s, null, null, null)', loc, kopi, 'waste', cur_qty + 1)),
    'pos.stock_post waste melebihi stok ditolak saat allow_negative_stock = false'
  );

  -- 1c: pos.stock_post adjust_in selalu diizinkan
  r := pos.stock_post(loc, kopi, 'adjust_in', 2, null, 'masuk aman', null);
  perform pg_temp.ok127((r->>'qty')::numeric = cur_qty + 2, 'adjust_in tetap sukses');
  cur_qty := cur_qty + 2;

  -- 1d: pos.sync_push (order.upsert)
  pl_ok := jsonb_strip_nulls(jsonb_build_object(
    'id', gen_random_uuid(), 'number', pfx || '261113/901', 'order_type', 'takeaway', 'cashier_id', emp,
    'opened_at', now(), 'client_created_at', now(),
    'subtotal', 20000, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', 20000,
    'items', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'product_id', kopi, 'product_unit_id', pu_kopi, 'name', 'Kopi',
      'qty', 1, 'unit_price', 20000, 'extras_total', 0, 'discount', 0, 'tax_amount', 0, 'line_total', 20000, 'sort', 0
    )),
    'discounts', '[]'::jsonb, 'tax_lines', '[]'::jsonb
  ));

  pl_over := jsonb_strip_nulls(jsonb_build_object(
    'id', gen_random_uuid(), 'number', pfx || '261113/902', 'order_type', 'takeaway', 'cashier_id', emp,
    'opened_at', now(), 'client_created_at', now(),
    'subtotal', (cur_qty + 10) * 20000, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', (cur_qty + 10) * 20000,
    'items', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'product_id', kopi, 'product_unit_id', pu_kopi, 'name', 'Kopi',
      'qty', cur_qty + 10, 'unit_price', 20000, 'extras_total', 0, 'discount', 0, 'tax_amount', 0, 'line_total', (cur_qty + 10) * 20000, 'sort', 0
    )),
    'discounts', '[]'::jsonb, 'tax_lines', '[]'::jsonb
  ));

  v := pos.sync_push(dev, jsonb_build_array(
    jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', pl_ok->>'id', 'payload', pl_ok),
    jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', pl_over->>'id', 'payload', pl_over)
  ));

  perform pg_temp.ok127(v->0->>'status' = 'applied', 'order dalam batas stok diterima');
  perform pg_temp.ok127(v->1->>'status' = 'rejected', 'order melebihi stok ditolak');
  perform pg_temp.ok127(coalesce(v->1->>'error', '') like '%insufficient_stock%', 'pesan galat insufficient_stock sesuai');

  -----------------------------------------------------------------------------------------------
  -- Kasus 2: allow_negative_stock = true (kembalikan ke default)
  -----------------------------------------------------------------------------------------------
  update outlet_settings set allow_negative_stock = true where outlet_id = out1;

  -- 2a: pos.stock_post mengizinkan stok minus
  r := pos.stock_post(loc, kopi, 'adjust_out', 1, null, 'keluar aman saat boleh minus', null);
  perform pg_temp.ok127(r->>'movement_id' is not null, 'adjust_out sukses saat boleh minus');

  -- 2b: pos.sync_push mengizinkan pesanan melebihi stok
  v := pos.sync_push(dev, jsonb_build_array(
    jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', pl_over->>'id', 'payload', pl_over)
  ));
  perform pg_temp.ok127(v->0->>'status' = 'applied', 'order melebihi stok diterima saat allow_negative_stock = true');

  reset role;
  update org_members set role = v_role where org_id = o1 and user_id = ud;
end $$;
