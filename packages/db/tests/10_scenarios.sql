-- Skenario inti. Setiap pernyataan gagal -> galat -> skrip berhenti.
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

create table t_ctx(k text primary key, v text);
create or replace function ctx(k text) returns uuid language sql stable as $$ select v::uuid from t_ctx where t_ctx.k = $1 $$;

-- ---------- setup: dua org, perangkat, katalog ----------
do $$
declare u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); ud uuid := gen_random_uuid();
        o1 uuid; o2 uuid; out1 uuid; dev uuid; emp uuid; pcs uuid; gram uuid; bean uuid; kopi uuid; air uuid;
        fl uuid; tb uuid; pu_kopi uuid; pu_air uuid; pu_bean uuid;
begin
  insert into auth.users(id,email) values (u1,'a@x'),(u2,'b@x'),(ud,'dev@x');
  o1 := pos.create_org('Kopi A', u1, 'Outlet Satu', 'OUT1');
  o2 := pos.create_org('Toko B', u2, 'Outlet B', 'B1');
  select id into out1 from outlets where org_id = o1;
  insert into org_members(org_id,user_id,role) values (o1, ud, 'device');
  insert into devices(org_id,outlet_id,user_id,code,name) values (o1,out1,ud,'A','Tablet 1') returning id into dev;
  select id into emp from employees where org_id = o1 and role = 'owner';
  select id into pcs from units where org_id=o1 and name='porsi';
  select id into gram from units where org_id=o1 and name='gram';

  insert into products(org_id,kind,name,base_unit_id,is_sellable,track_stock) values (o1,'ingredient','Biji Kopi',gram,false,true) returning id into bean;
  insert into product_units(org_id,product_id,unit_id,is_base,conversion) values (o1,bean,gram,true,1) returning id into pu_bean;
  insert into products(org_id,kind,name,base_unit_id) values (o1,'goods','Kopi Susu',pcs) returning id into kopi;
  insert into product_units(org_id,product_id,unit_id,is_base,conversion,price) values (o1,kopi,pcs,true,1,20000) returning id into pu_kopi;
  insert into recipe_lines(org_id,product_id,ingredient_id,qty,unit_id) values (o1,kopi,bean,18,gram);
  insert into products(org_id,kind,name,base_unit_id) values (o1,'goods','Air Mineral',pcs) returning id into air;
  insert into product_units(org_id,product_id,unit_id,is_base,conversion,price) values (o1,air,pcs,true,1,5000) returning id into pu_air;

  insert into floors(org_id,outlet_id,name) values (o1,out1,'Lantai 1') returning id into fl;
  insert into tables(org_id,outlet_id,floor_id,name) values (o1,out1,fl,'T1') returning id into tb;

  -- stok awal
  insert into stock_movements(org_id,location_id,product_id,kind,qty_delta,unit_cost,source_key)
    values (o1, pos.outlet_location(out1), bean, 'opening', 1000, 200, 'open:bean'),
           (o1, pos.outlet_location(out1), air, 'opening', 10, 2000, 'open:air');

  insert into t_ctx values ('u1',u1),('u2',u2),('ud',ud),('o1',o1),('o2',o2),('out1',out1),('dev',dev),('emp',emp),
    ('kopi',kopi),('air',air),('bean',bean),('pu_kopi',pu_kopi),('pu_air',pu_air),('table',tb);
end $$;

-- ---------- 1. data bawaan ----------
do $$ begin
  perform pg_temp.ok((select count(*) from accounts where org_id = ctx('o1')) = 36, 'COA bawaan 36 akun');
  perform pg_temp.ok((select count(*) from payment_methods where org_id = ctx('o1')) = 6, '6 metode bayar');
  perform pg_temp.ok((select count(*) from locations where outlet_id = ctx('out1')) = 1, 'satu lokasi per outlet');
  perform pg_temp.ok((select count(*) from outlet_settings where outlet_id = ctx('out1')) = 1, 'pengaturan outlet otomatis');
end $$;

-- ---------- 2. penjualan tunai lewat sync_push ----------
do $$
declare v jsonb; cash uuid; o1 uuid := ctx('o1'); sid uuid := gen_random_uuid(); oid uuid := gen_random_uuid(); pid uuid := gen_random_uuid();
begin
  select id into cash from payment_methods where org_id=o1 and code='CASH';
  perform set_config('request.jwt.claim.sub', ctx('ud')::text, true);
  v := pos.sync_push(ctx('dev'), jsonb_build_array(
    jsonb_build_object('op_id', gen_random_uuid(), 'type','shift.open', 'payload', jsonb_build_object(
       'id', sid, 'cashier_id', ctx('emp'), 'opened_at', now(), 'opening_cash', 100000)),
    jsonb_build_object('op_id', gen_random_uuid(), 'type','order.upsert', 'payload', jsonb_build_object(
       'id', oid, 'number', 'OUT1/A/261109/001', 'queue_no', 1, 'order_type','dine_in', 'shift_id', sid,
       'cashier_id', ctx('emp'), 'opened_at', now(), 'subtotal', 45000, 'discount_total', 0, 'service_charge', 0,
       'tax_total', 4500, 'rounding', 0, 'total', 49500,
       'items', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'product_id', ctx('kopi'), 'product_unit_id', ctx('pu_kopi'), 'name','Kopi Susu',
                             'qty', 2, 'unit_price', 20000, 'line_total', 40000),
          jsonb_build_object('id', gen_random_uuid(), 'product_id', ctx('air'), 'product_unit_id', ctx('pu_air'), 'name','Air Mineral',
                             'qty', 1, 'unit_price', 5000, 'line_total', 5000)))),
    jsonb_build_object('op_id', gen_random_uuid(), 'type','payment.add', 'payload', jsonb_build_object(
       'id', pid, 'order_id', oid, 'method_id', cash, 'amount', 49500, 'tendered', 50000, 'paid_at', now(), 'shift_id', sid))));
  perform pg_temp.ok((select bool_and(e->>'status' = 'applied') from jsonb_array_elements(v) e), 'semua op diterapkan: ' || v::text);
  insert into t_ctx values ('shift1', sid), ('order1', oid);
end $$;

do $$
declare o orders%rowtype; je uuid; dr numeric; cr numeric;
begin
  select * into o from orders where id = ctx('order1');
  perform pg_temp.ok(o.status = 'paid' and o.finalized_at is not null, 'order lunas dan terbukukan');
  select id into je from journal_entries where source_key = 'order:' || o.id || ':sale';
  select sum(debit), sum(credit) into dr, cr from journal_lines where entry_id = je;
  perform pg_temp.ok(dr = cr and dr = 49500 + 9200, 'jurnal seimbang: ' || dr || '/' || cr);
  perform pg_temp.ok((select sum(credit) from journal_lines where entry_id = je and account_id = pos.account_id(ctx('o1'),'sales_revenue')) = 45000, 'pendapatan 45000');
  perform pg_temp.ok((select sum(credit) from journal_lines where entry_id = je and account_id = pos.account_id(ctx('o1'),'tax_payable')) = 4500, 'pajak 4500');
  perform pg_temp.ok((select sum(debit) from journal_lines where entry_id = je and account_id = pos.account_id(ctx('o1'),'cogs')) = 9200, 'HPP 9200 (36 g x 200 + 1 x 2000)');
  perform pg_temp.ok((select qty from stock_balances where product_id = ctx('bean')) = 964, 'bahan berkurang 36 g');
  perform pg_temp.ok((select qty from stock_balances where product_id = ctx('air')) = 9, 'air berkurang 1');
  -- sync_push ulang dengan op yang sama aman (idempoten)
  perform pg_temp.ok((select count(*) from journal_entries where source_type = 'sale') = 1, 'satu jurnal penjualan');
end $$;

-- ---------- 3. kirim ulang op yang sama tidak menggandakan apa pun ----------
do $$
declare v jsonb; op uuid := (select op_id from sync_ops where op_type = 'payment.add' limit 1); p jsonb;
begin
  select payload into p from sync_ops where op_id = op;
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', op, 'type', 'payment.add', 'payload', p)));
  perform pg_temp.ok(v->0->>'duplicate' = 'true', 'op duplikat dikenali: ' || v::text);
  perform pg_temp.ok((select count(*) from payments) = 1, 'masih satu pembayaran');
  perform pg_temp.ok((select paid_total from orders where id = ctx('order1')) = 49500, 'paid_total tetap');
  -- finalize dipanggil lagi (mis. oleh tugas berkala): tidak menggandakan jurnal atau stok
  perform pos.finalize_order(ctx('order1'));
  perform pg_temp.ok((select count(*) from journal_entries where source_type = 'sale') = 1, 'finalize ulang tidak menggandakan jurnal');
  perform pg_temp.ok((select count(*) from stock_movements where ref_type = 'order' and ref_id = ctx('order1')) = 2, 'finalize ulang tidak menggandakan stok');
  perform pg_temp.ok((select qty from stock_balances where product_id = ctx('bean')) = 964, 'saldo bahan tetap 964');
end $$;

-- ---------- 4. stok boleh negatif; rata-rata dimulai ulang dari masuk berikutnya ----------
do $$
declare v jsonb; cash uuid; oid uuid := gen_random_uuid(); sid uuid := ctx('shift1');
begin
  select id into cash from payment_methods where org_id=ctx('o1') and code='CASH';
  v := pos.sync_push(ctx('dev'), jsonb_build_array(
    jsonb_build_object('op_id', gen_random_uuid(), 'type','order.upsert', 'payload', jsonb_build_object(
       'id', oid, 'number', 'OUT1/A/261109/002', 'order_type','takeaway', 'shift_id', sid, 'cashier_id', ctx('emp'), 'opened_at', now(),
       'subtotal', 55000, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', 55000,
       'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'product_id', ctx('air'), 'product_unit_id', ctx('pu_air'),
          'name','Air Mineral', 'qty', 11, 'unit_price', 5000, 'line_total', 55000)))),
    jsonb_build_object('op_id', gen_random_uuid(), 'type','payment.add', 'payload', jsonb_build_object(
       'id', gen_random_uuid(), 'order_id', oid, 'method_id', cash, 'amount', 55000, 'tendered', 55000, 'paid_at', now(), 'shift_id', sid))));
  perform pg_temp.ok((select bool_and(e->>'status' = 'applied') from jsonb_array_elements(v) e), 'penjualan stok minus diterima: ' || v::text);
  perform pg_temp.ok((select qty from stock_balances where product_id = ctx('air')) = -2, 'stok air -2');
  insert into stock_movements(org_id,location_id,product_id,kind,qty_delta,unit_cost)
    values (ctx('o1'), pos.outlet_location(ctx('out1')), ctx('air'), 'purchase_receipt', 5, 3000);
  perform pg_temp.ok((select qty from stock_balances where product_id = ctx('air')) = 3, 'stok air 3');
  perform pg_temp.ok((select avg_cost from stock_balances where product_id = ctx('air')) = 3000, 'rata-rata mulai ulang di 3000');
  insert into stock_movements(org_id,location_id,product_id,kind,qty_delta,unit_cost)
    values (ctx('o1'), pos.outlet_location(ctx('out1')), ctx('air'), 'purchase_receipt', 3, 4000);
  perform pg_temp.ok((select avg_cost from stock_balances where product_id = ctx('air')) = 3500, 'rata-rata bergerak 3500');
end $$;

-- ---------- 5. aturan keras ----------
do $$
declare e uuid; ok boolean;
begin
  -- jurnal tak seimbang ditolak
  insert into journal_entries(org_id,number,entry_date,description) values (ctx('o1'),'X-1',current_date,'tes') returning id into e;
  insert into journal_lines(org_id,entry_id,account_id,debit) values (ctx('o1'), e, pos.account_id(ctx('o1'),'cash_main'), 100);
  insert into journal_lines(org_id,entry_id,account_id,credit) values (ctx('o1'), e, pos.account_id(ctx('o1'),'sales_revenue'), 90);
  begin update journal_entries set status='posted' where id = e; ok := false;
  exception when others then ok := true; end;
  perform pg_temp.ok(ok, 'jurnal tak seimbang harus ditolak');
  -- jurnal terposting tak boleh diubah
  begin update journal_entries set description = 'ubah' where id = (select id from journal_entries where status='posted' limit 1); ok := false;
  exception when others then ok := true; end;
  perform pg_temp.ok(ok, 'jurnal terposting immutable');
  -- gerakan stok append-only
  begin delete from stock_movements; ok := false; exception when others then ok := true; end;
  perform pg_temp.ok(ok, 'gerakan stok tidak boleh dihapus');
  -- akun header tidak boleh dapat baris jurnal
  begin insert into journal_lines(org_id,entry_id,account_id,debit) values (ctx('o1'), e, (select id from accounts where org_id=ctx('o1') and kind='header' limit 1), 5); ok := false;
  exception when others then ok := true; end;
  perform pg_temp.ok(ok, 'akun header ditolak');
  -- order total tidak konsisten ditolak oleh CHECK
  begin insert into orders(id,org_id,outlet_id,device_id,cashier_id,number,order_type,subtotal,total,opened_at)
        values (gen_random_uuid(),ctx('o1'),ctx('out1'),ctx('dev'),ctx('emp'),'BAD','takeaway',100,50,now()); ok := false;
  exception when check_violation then ok := true; end;
  perform pg_temp.ok(ok, 'identitas total order dijaga CHECK');
end $$;

-- ---------- 6. nomor order unik, satu order terbuka per meja, void hanya yang belum bayar ----------
do $$
declare v jsonb; o1 uuid := ctx('o1'); a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
        function_dummy int;
begin
  v := pos.sync_push(ctx('dev'), jsonb_build_array(
    jsonb_build_object('op_id', gen_random_uuid(), 'type','order.upsert', 'payload', jsonb_build_object(
       'id', a, 'number', 'OUT1/A/261109/010', 'order_type','dine_in', 'table_id', ctx('table'), 'shift_id', ctx('shift1'), 'cashier_id', ctx('emp'),
       'opened_at', now(), 'subtotal', 0, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', 0, 'items', '[]'::jsonb)),
    jsonb_build_object('op_id', gen_random_uuid(), 'type','order.upsert', 'payload', jsonb_build_object(
       'id', b, 'number', 'OUT1/A/261109/011', 'order_type','dine_in', 'table_id', ctx('table'), 'shift_id', ctx('shift1'), 'cashier_id', ctx('emp'),
       'opened_at', now(), 'subtotal', 0, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', 0, 'items', '[]'::jsonb)),
    jsonb_build_object('op_id', gen_random_uuid(), 'type','order.upsert', 'payload', jsonb_build_object(
       'id', c, 'number', 'OUT1/A/261109/010', 'order_type','takeaway', 'shift_id', ctx('shift1'), 'cashier_id', ctx('emp'),
       'opened_at', now(), 'subtotal', 0, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', 0, 'items', '[]'::jsonb)),
    jsonb_build_object('op_id', gen_random_uuid(), 'type','order.upsert', 'payload', jsonb_build_object(
       'id', gen_random_uuid(), 'number', 'ZZZ/Q/261109/001', 'order_type','takeaway', 'cashier_id', ctx('emp'),
       'opened_at', now(), 'subtotal', 0, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', 0, 'items', '[]'::jsonb))));
  perform pg_temp.ok(v->0->>'status' = 'applied', 'order meja pertama diterima');
  perform pg_temp.ok(v->1->>'status' = 'rejected' and v->1->>'error' like '%orders_one_open_per_table%', 'meja kedua ditolak: ' || (v->1)::text);
  perform pg_temp.ok(v->2->>'status' = 'rejected' and v->2->>'error' like '%orders_outlet_id_number_key%', 'nomor ganda ditolak: ' || (v->2)::text);
  perform pg_temp.ok(v->3->>'status' = 'rejected' and v->3->>'error' like '%must start with%', 'awalan nomor palsu ditolak');
  -- void order belum bayar: boleh. void order lunas: ditolak.
  v := pos.sync_push(ctx('dev'), jsonb_build_array(
    jsonb_build_object('op_id', gen_random_uuid(), 'type','order.void', 'payload', jsonb_build_object(
       'order_id', a, 'authorized_by', ctx('emp'), 'auth_method','pin', 'reason','salah input', 'voided_at', now())),
    jsonb_build_object('op_id', gen_random_uuid(), 'type','order.void', 'payload', jsonb_build_object(
       'order_id', ctx('order1'), 'authorized_by', ctx('emp'), 'auth_method','pin', 'reason','coba', 'voided_at', now()))));
  perform pg_temp.ok(v->0->>'status' = 'applied', 'void belum bayar diterima');
  perform pg_temp.ok(v->1->>'status' = 'rejected', 'void order lunas ditolak');
  -- setelah void, meja bebas lagi
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type','order.upsert', 'payload', jsonb_build_object(
       'id', b, 'number', 'OUT1/A/261109/011', 'order_type','dine_in', 'table_id', ctx('table'), 'shift_id', ctx('shift1'), 'cashier_id', ctx('emp'),
       'opened_at', now(), 'subtotal', 0, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', 0, 'items', '[]'::jsonb))));
  perform pg_temp.ok(v->0->>'status' = 'applied', 'meja bebas setelah void');
  insert into t_ctx values ('open_order', b);
end $$;

-- ---------- 7. QRIS DOKU: alur server ----------
do $$
declare o1 uuid := ctx('o1'); qris uuid; oid uuid := gen_random_uuid(); payid uuid := gen_random_uuid(); acct uuid := gen_random_uuid();
        gt uuid := gen_random_uuid(); v jsonb; r text; ev1 uuid; ev2 uuid;
begin
  select id into qris from payment_methods where org_id=o1 and code='QRIS';
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type','order.upsert', 'payload', jsonb_build_object(
       'id', oid, 'number', 'OUT1/A/261109/020', 'order_type','takeaway', 'shift_id', ctx('shift1'), 'cashier_id', ctx('emp'), 'opened_at', now(),
       'subtotal', 20000, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', 20000,
       'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'product_id', ctx('kopi'), 'product_unit_id', ctx('pu_kopi'),
          'name','Kopi Susu', 'qty', 1, 'unit_price', 20000, 'line_total', 20000))))));
  perform pg_temp.ok(v->0->>'status' = 'applied', 'order QRIS dibuat');
  -- perangkat tidak boleh membuat pembayaran gateway lewat sync
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type','payment.add', 'payload', jsonb_build_object(
       'id', gen_random_uuid(), 'order_id', oid, 'method_id', qris, 'amount', 20000, 'paid_at', now(), 'shift_id', ctx('shift1')))));
  perform pg_temp.ok(v->0->>'status' = 'rejected', 'sync tidak boleh membuat pembayaran gateway');

  -- server: akun, pembayaran tertunda, transaksi gateway
  insert into payment_provider_accounts(id,org_id,environment,client_id,secret_key_ref,private_key_ref) values (acct,o1,'sandbox','CID','vault:s','vault:p');
  insert into payments(id,org_id,outlet_id,order_id,shift_id,method_id,amount,status) values (payid,o1,ctx('out1'),oid,ctx('shift1'),qris,20000,'pending');
  insert into gateway_transactions(id,org_id,outlet_id,account_id,payment_id,partner_reference_no,amount,expires_at,status)
    values (gt,o1,ctx('out1'),acct,payid,'PRN-0001',20000, now() + interval '5 minutes','pending');
  perform pg_temp.ok((select status from orders where id = oid) = 'open', 'pembayaran tertunda belum melunasi order');

  -- notifikasi ganda hanya diproses sekali
  ev1 := pos.record_gateway_event('doku','ext-1|PRN-0001|00','ext-1','PRN-0001','00','{}','{"x":1}',true);
  ev2 := pos.record_gateway_event('doku','ext-1|PRN-0001|00','ext-1','PRN-0001','00','{}','{"x":1}',true);
  perform pg_temp.ok(ev1 is not null and ev2 is null, 'notifikasi ganda dibuang');

  r := pos.gateway_mark_paid('PRN-0001','REF1','RRN1', 19999, now());
  perform pg_temp.ok(r = 'amount_mismatch', 'jumlah beda ditolak: ' || r);
  perform pg_temp.ok((select status from orders where id = oid) = 'open', 'order tetap terbuka setelah mismatch');
  r := pos.gateway_mark_paid('PRN-0001','REF1','RRN1', 20000, now(), 140);
  perform pg_temp.ok(r = 'paid', 'lunas: ' || r);
  perform pg_temp.ok((select status from orders where id = oid) = 'paid' and (select finalized_at from orders where id = oid) is not null, 'order lunas dan terbukukan via DOKU');
  perform pg_temp.ok(pos.gateway_mark_paid('PRN-0001','REF1','RRN1', 20000, now()) = 'already_paid', 'panggilan kedua idempoten');
  perform pg_temp.ok((select count(*) from journal_entries where source_key = 'order:' || oid || ':sale') = 1, 'satu jurnal');
  perform pg_temp.ok((select sum(debit) from journal_lines where account_id = pos.account_id(o1,'gateway_clearing')) = 20000, 'piutang gateway 20000');

  -- pembayaran terlambat: QR sudah kedaluwarsa dan order dilunasi tunai oleh kasir
  declare oid2 uuid := gen_random_uuid(); pay2 uuid := gen_random_uuid(); gt2 uuid := gen_random_uuid(); cash uuid;
  begin
    select id into cash from payment_methods where org_id=o1 and code='CASH';
    perform pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type','order.upsert', 'payload', jsonb_build_object(
       'id', oid2, 'number', 'OUT1/A/261109/021', 'order_type','takeaway', 'shift_id', ctx('shift1'), 'cashier_id', ctx('emp'), 'opened_at', now(),
       'subtotal', 20000, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', 20000,
       'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'product_id', ctx('kopi'), 'product_unit_id', ctx('pu_kopi'),
          'name','Kopi Susu', 'qty', 1, 'unit_price', 20000, 'line_total', 20000))))));
    insert into payments(id,org_id,outlet_id,order_id,shift_id,method_id,amount,status) values (pay2,o1,ctx('out1'),oid2,ctx('shift1'),qris,20000,'pending');
    insert into gateway_transactions(id,org_id,outlet_id,account_id,payment_id,partner_reference_no,amount,expires_at,status,last_checked_at)
      values (gt2,o1,ctx('out1'),acct,pay2,'PRN-0002',20000, now() - interval '1 minute','pending', now());
    perform pg_temp.ok(pos.gateway_expire_due() = 1, 'QR kedaluwarsa setelah dicek lewat waktu');
    perform pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type','payment.add', 'payload', jsonb_build_object(
       'id', gen_random_uuid(), 'order_id', oid2, 'method_id', cash, 'amount', 20000, 'tendered', 20000, 'paid_at', now(), 'shift_id', ctx('shift1')))));
    r := pos.gateway_mark_paid('PRN-0002','REF2','RRN2', 20000, now());
    perform pg_temp.ok(r = 'late_payment_needs_review', 'bayar terlambat ditandai untuk ditinjau: ' || r);
    perform pg_temp.ok((select paid_total from orders where id = oid2) = 20000, 'order tidak terbayar dua kali');
    perform pg_temp.ok(exists (select 1 from activity_logs where action = 'gateway.late_payment'), 'jejak pembayaran terlambat tercatat');
  end;
  insert into t_ctx values ('gt1', gt);
end $$;

-- ---------- 8. refund dengan restock ----------
do $$
declare cash uuid; v jsonb; item uuid; rid uuid := gen_random_uuid(); before_qty numeric; je uuid; dr numeric; cr numeric;
begin
  select id into cash from payment_methods where org_id=ctx('o1') and code='CASH';
  select id into item from order_items where order_id = ctx('order1') and product_id = ctx('kopi');
  select qty into before_qty from stock_balances where product_id = ctx('bean');
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type','refund.add', 'payload', jsonb_build_object(
     'id', rid, 'order_id', ctx('order1'), 'shift_id', ctx('shift1'), 'number','OUT1/A/RF/001', 'method_id', cash, 'total', 22000, 'restock', true,
     'authorized_by', ctx('emp'), 'auth_method', 'pin', 'reason', 'salah pesan',
     'items', jsonb_build_array(jsonb_build_object('order_item_id', item, 'qty', 1, 'amount', 20000))))));
  perform pg_temp.ok(v->0->>'status' = 'applied', 'refund diterima: ' || v::text);
  perform pg_temp.ok((select qty from stock_balances where product_id = ctx('bean')) = before_qty + 18, 'bahan kembali 18 g');
  select id into je from journal_entries where source_key = 'refund:' || rid;
  select sum(debit), sum(credit) into dr, cr from journal_lines where entry_id = je;
  perform pg_temp.ok(dr = cr, 'jurnal refund seimbang');
  -- refund melebihi yang dibayar ditolak
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type','refund.add', 'payload', jsonb_build_object(
     'id', gen_random_uuid(), 'order_id', ctx('order1'), 'number','OUT1/A/RF/002', 'method_id', cash, 'total', 40000,
     'authorized_by', ctx('emp'), 'auth_method', 'pin', 'reason', 'x', 'items', '[]'::jsonb))));
  perform pg_temp.ok(v->0->>'status' = 'rejected', 'refund melebihi pembayaran ditolak');
end $$;

-- ---------- 9. tutup kasir, selisih, rekonsiliasi gateway lewat settlement ----------
do $$
declare v jsonb; sid uuid := ctx('shift1'); expected numeric; sett uuid := gen_random_uuid(); bank uuid; je uuid; acct uuid;
begin
  -- batalkan order terbuka agar tidak mengganggu
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type','cash.move', 'payload', jsonb_build_object(
     'id', gen_random_uuid(), 'shift_id', sid, 'kind', 'out', 'amount', 15000, 'reason', 'beli es batu', 'occurred_at', now()))));
  perform pg_temp.ok(v->0->>'status' = 'applied', 'kas keluar diterima: ' || v::text);
  -- tunai: 100000 (modal) + 49500 + 55000 + 20000 - 15000 (keluar) - 22000 (refund) = 187500
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type','shift.close', 'payload', jsonb_build_object(
     'id', sid, 'closed_by', ctx('emp'), 'counted', 186500, 'closed_at', now()))));
  perform pg_temp.ok(v->0->>'status' = 'applied', 'tutup kasir diterima: ' || v::text);
  select expected_cash into expected from shifts where id = sid;
  perform pg_temp.ok(expected = 187500, 'kas seharusnya 187500, dapat ' || expected);
  perform pg_temp.ok((select cash_variance from shifts where id = sid) = -1000, 'selisih -1000');
  perform pg_temp.ok((select sum(debit) from journal_lines where account_id = pos.account_id(ctx('o1'),'cash_over_short')) = 1000, 'selisih kas dibukukan');
  -- baris rekonsiliasi gateway
  perform pg_temp.ok((select count(*) from reconciliations where shift_id = sid) = 1, 'satu baris rekonsiliasi (QRIS)');

  -- settlement DOKU: 20000 bruto, biaya 140
  select id into bank from accounts where org_id=ctx('o1') and system_key='bank_main';
  select account_id into acct from gateway_transactions where id = ctx('gt1');
  insert into gateway_settlements(id,org_id,account_id,reference,settlement_date,gross_amount,fee_total,net_amount,bank_account_id)
    values (sett, ctx('o1'), acct, 'STL-1', current_date, 20000, 140, 19860, bank);
  insert into gateway_settlement_lines(settlement_id,gateway_transaction_id,org_id,amount,fee) values (sett, ctx('gt1'), ctx('o1'), 20000, 140);
  je := pos.apply_settlement(sett);
  perform pg_temp.ok(je is not null, 'settlement dibukukan');
  perform pg_temp.ok((select status from reconciliations where shift_id = sid) = 'reconciled', 'rekonsiliasi gateway tertutup');
  perform pg_temp.ok((select sum(debit - credit) from journal_lines where account_id = pos.account_id(ctx('o1'),'gateway_clearing')) = 0, 'piutang gateway nol setelah settlement');
  perform pg_temp.ok(pos.apply_settlement(sett) = je, 'settlement idempoten');
end $$;

-- ---------- 10. laporan ----------
do $$
declare assets numeric; liab numeric; eq numeric; np numeric; tb_d numeric; tb_c numeric;
begin
  select sum(amount) filter (where section='asset'), sum(amount) filter (where section='liability'), sum(amount) filter (where section='equity')
    into assets, liab, eq from pos.report_balance_sheet(ctx('o1'), current_date + 1);
  perform pg_temp.ok(assets = coalesce(liab,0) + coalesce(eq,0), format('neraca seimbang: aset %s = liabilitas %s + ekuitas %s', assets, liab, eq));
  select amount into np from pos.report_income_statement(ctx('o1'), current_date - 30, current_date + 1) where section = 'net_profit';
  perform pg_temp.ok(np is not null, 'laba bersih terhitung: ' || np);
  select sum(debit), sum(credit) into tb_d, tb_c from pos.report_trial_balance(ctx('o1'), current_date - 30, current_date + 1);
  perform pg_temp.ok(tb_d = tb_c, 'neraca saldo seimbang');
  perform pg_temp.ok((select count(*) from pos.report_sales_daily(ctx('o1'), current_date - 1, current_date + 1)) >= 1, 'laporan penjualan harian');
end $$;

-- ---------- 11. PIN ----------
do $$
declare ok boolean; i int;
begin
  perform pos.set_employee_pin(ctx('emp'), '123456');
  perform pg_temp.ok(pos.verify_employee_pin(ctx('emp'), '123456'), 'PIN benar');
  for i in 1..5 loop perform pos.verify_employee_pin(ctx('emp'), '000000'); end loop;
  perform pg_temp.ok(not pos.verify_employee_pin(ctx('emp'), '123456'), 'akun terkunci setelah 5 salah');
  update employees set pin_locked_until = null, pin_failed_count = 0 where id = ctx('emp');
  perform pg_temp.ok(pos.verify_employee_pin(ctx('emp'), '123456'), 'PIN benar setelah kunci dibuka');
  begin perform pos.set_employee_pin(ctx('emp'), '12'); ok := false; exception when others then ok := true; end;
  perform pg_temp.ok(ok, 'PIN harus 6 digit');
end $$;

-- ---------- 12. sinkronisasi tarik ----------
update products set name = name where org_id = ctx('o1');   -- menaikkan sync_seq
select pg_sleep(6);   -- jendela penahan 5 detik harus lewat
do $$
declare r jsonb; r2 jsonb;
begin
  r := pos.sync_pull(ctx('dev'), 0, 500);
  perform pg_temp.ok(jsonb_array_length(r->'data'->'products') = 3, 'tarik: 3 produk');
  perform pg_temp.ok((r->>'next_cursor')::bigint > 0, 'kursor maju');
  r2 := pos.sync_pull(ctx('dev'), (r->>'next_cursor')::bigint, 500);
  perform pg_temp.ok(r2->'data'->'products' is null, 'tarik berikutnya kosong');
  perform pg_temp.ok(jsonb_array_length(r->'data'->'_open_orders') = 1, 'order terbuka ikut ditarik');
  perform pg_temp.ok(not (r->'data'->'employees'->0 ? 'qr_code'), 'qr_code tidak dikirim');
end $$;

-- ---------- 13. kunci periode ----------
do $$
declare cash uuid; oid uuid := gen_random_uuid(); v jsonb; d date;
begin
  select id into cash from payment_methods where org_id=ctx('o1') and code='CASH';
  update shifts set status = status where id = ctx('shift1');
  -- shift lama sudah tutup; buka shift baru
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type','shift.open', 'payload', jsonb_build_object(
      'id', ctx('shift1'), 'cashier_id', ctx('emp'), 'opened_at', now()))));
  perform pg_temp.ok(v->0->>'status' = 'rejected', 'shift sama tidak bisa dibuka dua kali');
end $$;
