grant select on t_ctx to authenticated;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

-- ---------- kunci periode: transaksi terlambat masuk ke hari terbuka pertama ----------
do $$
declare cash uuid; oid uuid := gen_random_uuid(); v jsonb; d date;
begin
  select id into cash from payment_methods where org_id=ctx('o1') and code='CASH';
  update orgs set books_locked_through = current_date where id = ctx('o1');
  v := pos.sync_push(ctx('dev'), jsonb_build_array(
    jsonb_build_object('op_id', gen_random_uuid(), 'type','order.upsert', 'payload', jsonb_build_object(
       'id', oid, 'number', 'OUT1/A/261109/030', 'order_type','takeaway', 'cashier_id', ctx('emp'), 'opened_at', now(),
       'subtotal', 5000, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', 5000,
       'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'product_id', ctx('air'), 'product_unit_id', ctx('pu_air'),
          'name','Air', 'qty', 1, 'unit_price', 5000, 'line_total', 5000)))),
    jsonb_build_object('op_id', gen_random_uuid(), 'type','payment.add', 'payload', jsonb_build_object(
       'id', gen_random_uuid(), 'order_id', oid, 'method_id', cash, 'amount', 5000, 'paid_at', now()))));
  perform pg_temp.ok((select bool_and(e->>'status'='applied') from jsonb_array_elements(v) e), 'penjualan saat periode terkunci tetap diterima: ' || v::text);
  select entry_date into d from journal_entries where source_key = 'order:' || oid || ':sale';
  perform pg_temp.ok(d = current_date + 1, 'dibukukan di hari pertama yang terbuka: ' || d);
  -- jurnal manual di periode terkunci ditolak
  begin
    perform pos.post_journal(ctx('o1'), null, current_date, 'MAN', 'manual', 'manual', null, null,
      jsonb_build_array(jsonb_build_object('account_id', pos.account_id(ctx('o1'),'cash_main'), 'debit', 1),
                        jsonb_build_object('account_id', pos.account_id(ctx('o1'),'paid_in_capital'), 'credit', 1)));
    perform pg_temp.ok(false, 'jurnal di periode terkunci seharusnya ditolak');
  exception when others then
    if sqlerrm like 'ASSERT%' then raise; end if;
    perform pg_temp.ok(sqlerrm like '%locked%', 'pesan kunci periode: ' || sqlerrm);
  end;
  update orgs set books_locked_through = null where id = ctx('o1');
end $$;

-- ---------- RLS ----------

do $$
declare n bigint;
begin
  -- pemilik org B tidak melihat apa pun milik org A
  perform set_config('request.jwt.claim.sub', ctx('u2')::text, true);
  set local role authenticated;
  perform pg_temp.ok((select count(*) from orders) = 0, 'org B tidak melihat order org A');
  perform pg_temp.ok((select count(*) from products) = 0, 'org B tidak melihat produk org A');
  perform pg_temp.ok((select count(*) from orgs) = 1, 'org B hanya melihat org sendiri');
  perform pg_temp.ok((select count(*) from journal_lines) = 0, 'org B tidak melihat jurnal org A');
  reset role;
end $$;

do $$
declare ok boolean;
begin
  -- pemilik org A melihat datanya
  perform set_config('request.jwt.claim.sub', ctx('u1')::text, true);
  set local role authenticated;
  perform pg_temp.ok((select count(*) from orders) > 0, 'pemilik melihat order');
  -- tetapi tidak boleh menulis data transaksi langsung
  begin insert into payments(id,org_id,outlet_id,order_id,method_id,amount,status,paid_at)
        values (gen_random_uuid(), ctx('o1'), ctx('out1'), ctx('order1'), (select id from payment_methods limit 1), 1, 'succeeded', now()); ok := false;
  exception when insufficient_privilege then ok := true; end;
  perform pg_temp.ok(ok, 'insert payments langsung ditolak');
  begin update journal_entries set description = 'x'; ok := false; exception when insufficient_privilege then ok := true; end;
  perform pg_temp.ok(ok, 'update jurnal langsung ditolak');
  begin perform count(*) from gateway_tokens; ok := false; exception when insufficient_privilege then ok := true; end;
  perform pg_temp.ok(ok, 'gateway_tokens tertutup');
  begin perform count(*) from payment_provider_accounts; ok := false; exception when insufficient_privilege then ok := true; end;
  perform pg_temp.ok(ok, 'rahasia gateway tertutup');
  -- boleh mengelola katalog
  insert into categories(org_id,name) values (ctx('o1'),'Minuman');
  -- tidak boleh menyisipkan data ke org lain
  begin insert into categories(org_id,name) values (ctx('o2'),'Curang'); ok := false;
  exception when others then ok := true; end;
  perform pg_temp.ok(ok, 'tidak bisa menulis ke org lain');
  -- tidak boleh memanggil fungsi server
  begin perform pos.finalize_order(ctx('order1')); ok := false; exception when insufficient_privilege then ok := true; end;
  perform pg_temp.ok(ok, 'finalize_order tertutup untuk klien');
  begin perform pos.create_org('x', ctx('u1'), 'y', 'ZZ'); ok := false; exception when insufficient_privilege then ok := true; end;
  perform pg_temp.ok(ok, 'create_org tertutup untuk klien');
  -- laporan org-wide boleh untuk pemilik
  perform pg_temp.ok((select count(*) from pos.report_trial_balance(ctx('o1'), current_date - 5, current_date + 2)) > 0, 'laporan untuk pemilik');
  reset role;
end $$;

do $$
declare ok boolean; v jsonb;
begin
  -- akun perangkat: tidak bisa baca tabel apa pun, tetapi bisa sinkron
  perform set_config('request.jwt.claim.sub', ctx('ud')::text, true);
  set local role authenticated;
  perform pg_temp.ok((select count(*) from orders) = 0, 'akun perangkat tidak membaca tabel');
  perform pg_temp.ok((select count(*) from products) = 0, 'akun perangkat tidak membaca produk langsung');
  v := pos.sync_pull(ctx('dev'), 0, 100);
  perform pg_temp.ok(v ? 'next_cursor', 'akun perangkat bisa sync_pull');
  reset role;
  -- pemilik org B tidak boleh memakai perangkat org A
  perform set_config('request.jwt.claim.sub', ctx('u2')::text, true);
  set local role authenticated;
  begin perform pos.sync_pull(ctx('dev'), 0, 100); ok := false; exception when others then ok := sqlerrm like '%not your device%'; end;
  perform pg_temp.ok(ok, 'perangkat org lain ditolak');
  begin perform * from pos.report_trial_balance(ctx('o1'), current_date, current_date); ok := false;
  exception when others then ok := true; end;
  perform pg_temp.ok(ok, 'laporan org lain ditolak');
  reset role;
end $$;

-- ---------- kasir dengan satu outlet ----------
do $$
declare uc uuid := gen_random_uuid(); out2 uuid; n bigint;
begin
  insert into auth.users(id,email) values (uc,'kasir@x');
  insert into outlets(org_id,code,name) values (ctx('o1'),'OUT2','Outlet Dua') returning id into out2;
  insert into org_members(org_id,user_id,role) values (ctx('o1'), uc, 'manager');
  insert into member_outlets(org_id,user_id,outlet_id) values (ctx('o1'), uc, out2);
  perform set_config('request.jwt.claim.sub', uc::text, true);
  set local role authenticated;
  perform pg_temp.ok((select count(*) from outlets) = 1, 'manajer hanya melihat outlet tugasnya');
  perform pg_temp.ok((select count(*) from orders) = 0, 'manajer outlet 2 tidak melihat order outlet 1');
  begin perform * from pos.report_trial_balance(ctx('o1'), current_date, current_date); raise exception 'seharusnya ditolak';
  exception when others then perform pg_temp.ok(sqlerrm like '%org-wide%', 'laporan seluruh org butuh admin: ' || sqlerrm); end;
  reset role;
end $$;

-- ---------- hapus org berantai (permintaan hapus data) ----------
do $$
declare o3 uuid; u3 uuid := gen_random_uuid();
begin
  insert into auth.users(id,email) values (u3,'c@x');
  o3 := pos.create_org('Sementara', u3, 'O', 'TMP');
  perform pos.delete_org(o3);
  perform pg_temp.ok(not exists (select 1 from accounts where org_id = o3), 'akun ikut terhapus');
end $$;

-- hapus org yang penuh data (penjualan, jurnal, stok, gateway) harus bersih
do $$
declare n bigint;
begin
  perform pos.delete_org(ctx('o1'));
  select (select count(*) from orders where org_id = ctx('o1')) + (select count(*) from journal_lines where org_id = ctx('o1'))
       + (select count(*) from stock_movements where org_id = ctx('o1')) + (select count(*) from gateway_transactions where org_id = ctx('o1'))
       + (select count(*) from products where org_id = ctx('o1')) into n;
  perform pg_temp.ok(n = 0, 'sisa baris setelah hapus org: ' || n);
  perform pg_temp.ok((select count(*) from orders) = 0 and (select count(*) from accounts where org_id = ctx('o2')) = 36, 'org lain tidak terganggu');
end $$;
