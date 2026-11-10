-- Satuan ganda (migrasi 0023): tambah/ubah/arsip satuan lain, penjaga konversi bila sudah dipakai, hanya manajer ke atas.
create or replace function pg_temp.ok10(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails10(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); bean uuid := ctx('bean'); kopi uuid := ctx('kopi'); u1 uuid := ctx('u1');
  mgr uuid := gen_random_uuid(); cashier uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  gram uuid; kg uuid; id1 uuid; id2 uuid; n int; svc uuid; mnu uuid; r record;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-pu@x'), (cashier, 'cashier-pu@x'), (stranger, 'stranger-pu@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cashier, 'cashier'), (o2, stranger, 'owner');
  select id into gram from units where org_id = o1 and name = 'gram';
  insert into products(org_id, kind, name, base_unit_id) values (o1, 'service', 'Jasa unit', (select id from units where org_id = o1 and name = 'porsi')) returning id into svc;

  perform set_config('request.jwt.claim.sub', cashier::text, true);
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, ''kg'', 1000)', bean)), 'kasir tidak boleh');
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, ''kg'', 1000)', bean)), 'org lain tidak boleh');
  perform pg_temp.ok10(pg_temp.fails10(format('select * from pos.product_unit_list(%L)', bean)), 'org lain tidak boleh membaca');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, ''kg'', 1000)', bean)), 'tanpa login ditolak');

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  -- tambah satuan baru (dibuat otomatis, tanpa membedakan huruf besar)
  id1 := pos.product_unit_save(bean, '  Kg-uji ', 1000, 90000, 2);
  perform pg_temp.ok10((select conversion = 1000 and buy_price = 90000 and min_purchase = 2 and not is_base from product_units where id = id1), 'satuan baru tersimpan');
  select id into kg from units where org_id = o1 and name = 'Kg-uji';
  perform pg_temp.ok10(kg is not null, 'satuan dibuat dengan nama dipangkas');
  id2 := pos.product_unit_save(bean, 'kg-UJI', 1000, 95000, 1);
  perform pg_temp.ok10(id2 = id1 and (select count(*) from units where org_id = o1 and lower(name) = 'kg-uji') = 1, 'nama sama tanpa membedakan huruf: baris dan satuan yang sama');
  perform pg_temp.ok10((select buy_price from product_units where id = id1) = 95000, 'harga beli diperbarui');

  -- satuan dasar: konversi tetap 1
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, ''gram'', 2)', bean)), 'konversi satuan dasar harus 1');
  perform pos.product_unit_save(bean, 'gram', 1, 1.5, 1);
  perform pg_temp.ok10((select buy_price from product_units where product_id = bean and is_base) = 1.5, 'harga beli satuan dasar boleh berubah');
  -- galat masukan
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, '''', 5)', bean)), 'nama kosong');
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, %L, 5)', bean, repeat('x', 31))), 'nama 31 huruf');
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, ''dus-uji'', 0)', bean)), 'konversi 0');
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, ''dus-uji'', 1000001)', bean)), 'konversi terlalu besar');
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, ''dus-uji'', 1.0000001)', bean)), 'konversi 7 desimal');
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, ''dus-uji'', 5, -1)', bean)), 'harga beli negatif');
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, ''dus-uji'', 5, 1, 0)', bean)), 'minimum beli 0');
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, ''dus-uji'', 5)', svc)), 'jasa tidak punya satuan');
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, ''dus-uji'', 5)', gen_random_uuid())), 'produk tak dikenal');

  -- daftar: dasar dulu, lalu menurut konversi; belum dipakai
  select count(*) into n from pos.product_unit_list(bean);
  perform pg_temp.ok10(n = 2, 'dua satuan: ' || n);
  perform pg_temp.ok10((select is_base from pos.product_unit_list(bean) limit 1), 'dasar paling atas');
  perform pg_temp.ok10(not (select in_use from pos.product_unit_list(bean) where unit_id = kg), 'kg belum dipakai');

  -- dipakai resep: konversi tidak boleh berubah, tidak boleh diarsipkan
  insert into products(org_id, kind, name, base_unit_id) values (o1, 'goods', 'Menu uji satuan', (select id from units where org_id = o1 and name = 'porsi')) returning id into mnu;
  insert into recipe_lines(org_id, product_id, ingredient_id, qty, unit_id) values (o1, mnu, bean, 0.02, kg);
  perform pg_temp.ok10((select in_use from pos.product_unit_list(bean) where unit_id = kg), 'kg dipakai resep');
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_save(%L, ''kg-uji'', 999)', bean)), 'konversi satuan terpakai ditolak');
  perform pos.product_unit_save(bean, 'kg-uji', 1000, 97000, 1);   -- konversi sama, harga boleh berubah
  perform pg_temp.ok10((select buy_price from product_units where id = id1) = 97000, 'harga satuan terpakai boleh berubah');
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_remove(%L, %L)', bean, kg)), 'satuan terpakai tidak boleh diarsipkan');
  delete from recipe_lines where product_id = mnu;
  perform pg_temp.ok10(pg_temp.fails10(format('select pos.product_unit_remove(%L, %L)', bean, gram)), 'satuan dasar tidak boleh diarsipkan');

  -- arsip lalu pulihkan dengan konversi baru (belum dipakai)
  perform pg_temp.ok10(pos.product_unit_remove(bean, kg), 'arsip berhasil');
  perform pg_temp.ok10(not pos.product_unit_remove(bean, kg), 'arsip kedua: tidak ada');
  perform pg_temp.ok10((select count(*) from pos.product_unit_list(bean)) = 1, 'kg hilang dari daftar');
  perform pg_temp.ok10(pos.product_unit_save(bean, 'kg-uji', 500, 1, 1) = id1, 'dipulihkan pada baris yang sama');
  perform pg_temp.ok10((select conversion = 500 and deleted_at is null from product_units where id = id1), 'konversi baru setelah dipulihkan');

  -- fungsi tidak terbuka untuk anon; log aktivitas mencatat perubahan
  perform pg_temp.ok10(not has_function_privilege('anon', 'pos.product_unit_save(uuid, text, numeric, numeric, numeric)', 'execute'), 'anon tidak boleh save');
  perform pg_temp.ok10(not has_function_privilege('anon', 'pos.product_unit_remove(uuid, uuid)', 'execute'), 'anon tidak boleh remove');
  perform pg_temp.ok10(not has_function_privilege('authenticated', 'pos.product_unit_in_use(uuid, uuid, uuid)', 'execute'), 'fungsi dalam tertutup');
  perform pg_temp.ok10((select count(*) from activity_logs where entity = 'product_unit' and entity_id = id1) >= 2, 'perubahan satuan tercatat di log');

  -- bersihkan satuan uji
  delete from product_units where id = id1; delete from units where id = kg;
end $$;
