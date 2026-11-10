-- Loyalti (migrasi 0013): poin didapat saat lunas, tukar poin dijaga server, refund membalik poin, koreksi manual hanya manajer.
create or replace function pg_temp.ok2(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.sale(p_num text, p_cust uuid, p_total numeric, p_disc jsonb default '[]') returns jsonb language sql as $$
  select jsonb_build_object('id', gen_random_uuid(), 'number', p_num, 'order_type', 'takeaway', 'customer_id', p_cust, 'cashier_id', ctx('emp'),
    'shift_id', ctx('shift_loy'), 'opened_at', now(), 'client_created_at', now(), 'subtotal', p_total + coalesce((select sum((d->>'amount')::numeric) from jsonb_array_elements(p_disc) d), 0),
    'discount_total', coalesce((select sum((d->>'amount')::numeric) from jsonb_array_elements(p_disc) d), 0), 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', p_total,
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'product_id', ctx('kopi'), 'product_unit_id', ctx('pu_kopi'), 'name', 'Kopi', 'qty', 1,
       'unit_price', p_total + coalesce((select sum((d->>'amount')::numeric) from jsonb_array_elements(p_disc) d), 0), 'extras_total', 0, 'discount', 0, 'tax_amount', 0,
       'line_total', p_total + coalesce((select sum((d->>'amount')::numeric) from jsonb_array_elements(p_disc) d), 0), 'sort', 0)),
    'discounts', p_disc, 'tax_lines', '[]'::jsonb);
$$;
create or replace function pg_temp.pay(p_order uuid, p_amount numeric) returns jsonb language plpgsql as $$
declare cash uuid; v jsonb;
begin
  select id into cash from payment_methods where org_id = ctx('o1') and code = 'CASH';
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'payment.add', 'payload', jsonb_build_object(
    'id', gen_random_uuid(), 'order_id', p_order, 'method_id', cash, 'amount', p_amount, 'tendered', p_amount, 'paid_at', now(), 'shift_id', ctx('shift_loy')))));
  return v;
end $$;

do $$
declare
  o1 uuid := ctx('o1'); cust uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); cashier uuid := gen_random_uuid();
  pfx text; a jsonb; b jsonb; v jsonb; bal bigint; ok boolean; cash uuid; item uuid; rid uuid := gen_random_uuid();
begin
  select o.code || '/' || d.code || '/' into pfx from devices d join outlets o on o.id = d.outlet_id where d.id = ctx('dev');
  select id into cash from payment_methods where org_id = o1 and code = 'CASH';
  insert into customers(id, org_id, name, phone) values (cust, o1, 'Bu Ani', '0812000111');
  perform set_config('request.jwt.claim.sub', ctx('ud')::text, true);
  declare sid uuid := gen_random_uuid(); begin
    v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'shift.open', 'payload', jsonb_build_object(
      'id', sid, 'cashier_id', ctx('emp'), 'opened_at', now(), 'opening_cash', 0))));
    perform pg_temp.ok2(v->0->>'status' = 'applied', 'shift baru: ' || v::text);
    insert into t_ctx values ('shift_loy', sid);
  end;

  -- loyalti mati: tidak ada poin; diskon poin ditolak
  a := pg_temp.sale(pfx || '261110/801', cust, 50000);
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'payload', a)));
  perform pg_temp.ok2(v->0->>'status' = 'applied', 'pesanan diterima: ' || v::text);
  v := pg_temp.pay((a->>'id')::uuid, 50000);
  perform pg_temp.ok2((select count(*) from loyalty_ledger where customer_id = cust) = 0, 'loyalti mati: tidak ada poin');
  b := pg_temp.sale(pfx || '261110/802', cust, 40000, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'source', 'points', 'points_used', 100, 'amount', 10000)));
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'payload', b)));
  perform pg_temp.ok2(v->0->>'status' = 'rejected' and v->0->>'error' like '%loyalty is not active%', 'diskon poin ditolak saat loyalti mati: ' || v::text);

  -- aturan: tiap Rp 10.000 dapat 1 poin, 1 poin = Rp 100
  insert into loyalty_rules(org_id, earn_amount, earn_points, redeem_value_per_point, is_active) values (o1, 10000, 1, 100, true);
  a := pg_temp.sale(pfx || '261110/803', cust, 55000);
  perform pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'payload', a)));
  perform pg_temp.pay((a->>'id')::uuid, 25000);
  perform pg_temp.ok2((select count(*) from loyalty_ledger where customer_id = cust) = 0, 'belum lunas: belum ada poin');
  perform pg_temp.pay((a->>'id')::uuid, 30000);
  select points_balance into bal from customers where id = cust;
  perform pg_temp.ok2(bal = 5, 'Rp 55.000 = 5 poin, saldo ' || bal);
  perform pg_temp.ok2((select count(*) from loyalty_ledger where order_id = (a->>'id')::uuid and kind = 'earn') = 1, 'satu baris earn');

  -- tukar poin: saldo kurang ditolak; nilai tidak sesuai aturan ditolak; tanpa pelanggan ditolak
  b := pg_temp.sale(pfx || '261110/804', cust, 49500, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'source', 'points', 'points_used', 6, 'amount', 600)));
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'payload', b)));
  perform pg_temp.ok2(v->0->>'status' = 'rejected' and v->0->>'error' like '%not enough points%', 'saldo kurang ditolak: ' || v::text);
  b := pg_temp.sale(pfx || '261110/805', cust, 49500, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'source', 'points', 'points_used', 5, 'amount', 999)));
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'payload', b)));
  perform pg_temp.ok2(v->0->>'status' = 'rejected' and v->0->>'error' like '%does not match rule%', 'nilai tidak sesuai aturan ditolak: ' || v::text);
  b := pg_temp.sale(pfx || '261110/806', null, 49500, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'source', 'points', 'points_used', 5, 'amount', 500)));
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'payload', b)));
  perform pg_temp.ok2(v->0->>'status' = 'rejected' and v->0->>'error' like '%needs a customer%', 'tanpa pelanggan ditolak: ' || v::text);

  -- tukar 5 poin = Rp 500; saldo baru dikurangi saat lunas; poin didapat dihitung dari total yang dibayar (49.500 -> 4)
  b := pg_temp.sale(pfx || '261110/807', cust, 49500, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'source', 'points', 'points_used', 5, 'amount', 500)));
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'payload', b)));
  perform pg_temp.ok2(v->0->>'status' = 'applied', 'diskon poin sah diterima: ' || v::text);
  perform pg_temp.ok2((select points_balance from customers where id = cust) = 5, 'poin belum berkurang sebelum lunas');
  perform pg_temp.pay((b->>'id')::uuid, 49500);
  select points_balance into bal from customers where id = cust;
  perform pg_temp.ok2(bal = 4, 'saldo setelah tukar 5 dan dapat 4: ' || bal);
  perform pg_temp.ok2((select points_delta from loyalty_ledger where order_id = (b->>'id')::uuid and kind = 'redeem') = -5, 'baris redeem -5');

  -- refund sebagian (49.500 dari 49.500 = semua): poin didapat 4 dibalik, poin tukar 5 kembali -> +1 bersih
  select id into item from order_items where order_id = (b->>'id')::uuid limit 1;
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'refund.add', 'payload', jsonb_build_object(
     'id', rid, 'order_id', (b->>'id')::uuid, 'shift_id', ctx('shift_loy'), 'number', 'OUT1/A/RF/801', 'method_id', cash, 'total', 49500, 'restock', false,
     'authorized_by', ctx('emp'), 'auth_method', 'pin', 'reason', 'uji', 'items', jsonb_build_array(jsonb_build_object('order_item_id', item, 'qty', 1, 'amount', 50000))))));
  perform pg_temp.ok2(v->0->>'status' = 'applied', 'refund diterima: ' || v::text);
  select points_balance into bal from customers where id = cust;
  perform pg_temp.ok2(bal = 5, 'refund penuh mengembalikan saldo ke 5: ' || bal);
  perform pg_temp.ok2((select points_delta from loyalty_ledger where refund_id = rid) = 1, 'satu baris refund_reverse +1');
  -- saldo selalu sama dengan jumlah buku poin
  perform pg_temp.ok2((select points_balance from customers where id = cust) = (select sum(points_delta) from loyalty_ledger where customer_id = cust), 'saldo = jumlah buku poin');

  -- koreksi manual: manajer boleh, kasir tidak, saldo tidak boleh negatif
  insert into auth.users(id, email) values (mgr, 'mgr-loy@x'), (cashier, 'cashier-loy@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cashier, 'cashier');
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pos.loyalty_adjust(cust, 20, 'bonus ulang tahun');
  begin perform pos.loyalty_adjust(cust, -999, 'terlalu besar'); ok := false; exception when others then ok := true; end;
  reset role;
  perform pg_temp.ok2(ok, 'saldo negatif ditolak');
  perform pg_temp.ok2((select points_balance from customers where id = cust) = 25, 'saldo setelah koreksi +20');
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  set local role authenticated;
  begin perform pos.loyalty_adjust(cust, 5, 'curang'); ok := false; exception when others then ok := true; end;
  begin insert into loyalty_ledger(org_id, customer_id, points_delta, kind) values (o1, cust, 100, 'adjust'); ok := false; exception when others then null; end;
  reset role;
  perform pg_temp.ok2(ok, 'kasir tidak boleh mengoreksi atau menulis buku poin');
  perform pg_temp.ok2((select points_balance from customers where id = cust) = 25, 'saldo tidak berubah oleh kasir');
end $$;
