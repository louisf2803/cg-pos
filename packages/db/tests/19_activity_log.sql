-- Log aktivitas (migrasi 0021): perubahan pengaturan tercatat dengan pelaku, tanpa rahasia dan tanpa kebisingan; hanya manajer ke atas yang bisa membaca.
create or replace function pg_temp.ok8(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); emp uuid := ctx('emp');
  mgr uuid := gen_random_uuid(); cashier uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  pid uuid; n0 int; n1 int; row_ record; d jsonb;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-log@x'), (cashier, 'cashier-log@x'), (stranger, 'stranger-log@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cashier, 'cashier'), (o2, stranger, 'owner');
  delete from activity_logs;

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  insert into products(org_id, kind, name, track_stock) values (o1, 'goods', 'Kopi uji log', false) returning id into pid;
  select * into row_ from activity_logs where entity = 'product' and entity_id = pid;
  perform pg_temp.ok8(row_.action = 'product.created' and row_.actor_user_id = mgr and row_.detail->>'name' = 'Kopi uji log', 'produk dibuat tercatat dengan pelaku');

  -- ubah nama dan harga default beli: tercatat nilai lama dan baru
  select count(*) into n0 from activity_logs where entity = 'product';
  update products set name = 'Kopi uji log 2', default_buy_price = 1234 where id = pid;
  select detail into d from activity_logs where entity = 'product' and entity_id = pid and action = 'product.updated';
  perform pg_temp.ok8(d->'changes'->'name' = '["Kopi uji log", "Kopi uji log 2"]'::jsonb, 'perubahan nama: ' || d::text);
  perform pg_temp.ok8(d->'changes' ? 'default_buy_price', 'perubahan harga beli tercatat');
  perform pg_temp.ok8(not (d->'changes' ? 'updated_at') and not (d->'changes' ? 'sync_seq'), 'kolom bising tidak ikut');

  -- ubah yang sama (tanpa perubahan nyata) tidak membuat baris
  select count(*) into n0 from activity_logs;
  update products set name = name where id = pid;
  update products set updated_at = now() where id = pid;
  select count(*) into n1 from activity_logs;
  perform pg_temp.ok8(n1 = n0, 'tanpa perubahan nyata tidak tercatat');

  -- arsip dan pulihkan
  update products set deleted_at = now() where id = pid;
  perform pg_temp.ok8(exists (select 1 from activity_logs where entity_id = pid and action = 'product.deleted'), 'arsip tercatat');
  update products set deleted_at = null where id = pid;
  perform pg_temp.ok8(exists (select 1 from activity_logs where entity_id = pid and action = 'product.restored'), 'pulih tercatat');

  -- harga satuan memakai nama produk
  update product_units set price = price + 1000 where product_id = ctx('kopi') and is_base;
  perform pg_temp.ok8(exists (select 1 from activity_logs where entity = 'product_unit' and action = 'product_unit.updated' and detail->>'name' is not null and detail->'changes' ? 'price'), 'ubah harga satuan tercatat dengan nama produk');

  -- karyawan: ganti PIN hanya kejadian, tanpa hash
  perform pos.set_employee_pin(emp, '482915');
  select * into row_ from activity_logs where action = 'employee.pin_changed' and entity_id = emp;
  perform pg_temp.ok8(row_.id is not null, 'ganti PIN tercatat');
  perform pg_temp.ok8(not exists (select 1 from activity_logs where detail::text ~* 'pin_hash|\$2[aby]\$|qr_code'), 'tidak ada hash PIN atau kode QR di log');
  perform set_config('request.jwt.claim.sub', ctx('u1')::text, true);
  update employees set name = 'Kasir Baru Nama' where id = emp;
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  perform pg_temp.ok8(exists (select 1 from activity_logs where action = 'employee.updated' and detail->'changes' ? 'name'), 'ganti nama karyawan tercatat');

  -- anggota organisasi: perubahan peran tercatat dengan email
  update org_members set role = 'manager' where org_id = o1 and user_id = cashier;
  select detail into d from activity_logs where action = 'member.updated';
  perform pg_temp.ok8(d->>'name' = 'cashier-log@x' and d->'changes'->'role' = '["cashier", "manager"]'::jsonb, 'peran anggota tercatat: ' || d::text);
  update org_members set role = 'cashier' where org_id = o1 and user_id = cashier;

  -- nilai panjang dipotong
  update products set description = repeat('x', 500) where id = pid;
  select detail into d from activity_logs where entity_id = pid and action = 'product.updated' and detail->'changes' ? 'description' order by created_at desc limit 1;
  perform pg_temp.ok8(length(d->'changes'->'description'->>1) = 200, 'nilai panjang dipotong 200');

  -- membaca: manajer boleh, kasir dan org lain tidak
  perform pg_temp.ok8((select count(*) from pos.activity_list()) > 5, 'manajer melihat log');
  perform pg_temp.ok8((select count(*) from pos.activity_list(null, null, 'product')) > 0 and (select count(*) from pos.activity_list(null, null, 'product')) = (select count(*) from pos.activity_list() where entity = 'product'), 'filter entitas');
  perform pg_temp.ok8((select actor_email from pos.activity_list(null, null, 'product') where action = 'product.created') = 'mgr-log@x', 'email pelaku tampil');
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  perform pg_temp.ok8((select count(*) from pos.activity_list()) = 0, 'kasir tidak melihat log');
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform pg_temp.ok8((select count(*) from pos.activity_list()) = 0, 'org lain tidak melihat log org ini');
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  perform pg_temp.ok8((select count(*) from pos.activity_list(now() + interval '2 days', null)) = 0, 'rentang kosong');
end $$;
