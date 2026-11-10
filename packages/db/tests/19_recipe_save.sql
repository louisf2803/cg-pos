-- Resep (migrasi 0022): simpan atomik, penjaga satuan/jenis, hanya manajer ke atas, log aktivitas satu baris.
create or replace function pg_temp.ok9(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails9(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); kopi uuid := ctx('kopi'); air uuid := ctx('air'); bean uuid := ctx('bean'); u1 uuid := ctx('u1');
  gram uuid; pcs uuid; kg uuid; milk uuid; svc uuid; bundle uuid;
  mgr uuid := gen_random_uuid(); cashier uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  n int; d jsonb; logs int;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-rcp@x'), (cashier, 'cashier-rcp@x'), (stranger, 'stranger-rcp@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cashier, 'cashier'), (o2, stranger, 'owner');
  select id into gram from units where org_id = o1 and name = 'gram';
  select id into pcs from units where org_id = o1 and name = 'porsi';
  insert into units(org_id, name) values (o1, 'kg-uji') returning id into kg;
  insert into products(org_id, kind, name, base_unit_id, is_sellable, track_stock) values (o1, 'ingredient', 'Susu uji', gram, false, true) returning id into milk;
  insert into products(org_id, kind, name, base_unit_id) values (o1, 'service', 'Jasa uji', pcs) returning id into svc;
  insert into products(org_id, kind, name, base_unit_id) values (o1, 'bundle', 'Paket uji', pcs) returning id into bundle;
  delete from activity_logs;

  -- penjaga langsung di tabel: satuan tanpa konversi ditolak, satuan dengan konversi diterima
  perform pg_temp.ok9(pg_temp.fails9(format('insert into recipe_lines(org_id, product_id, ingredient_id, qty, unit_id) values (%L, %L, %L, 5, %L)', o1, air, milk, kg)), 'satuan tanpa konversi ditolak');
  insert into product_units(org_id, product_id, unit_id, is_base, conversion) values (o1, milk, gram, true, 1), (o1, milk, kg, false, 1000);
  insert into recipe_lines(org_id, product_id, ingredient_id, qty, unit_id) values (o1, air, milk, 0.2, kg);
  perform pg_temp.ok9((select count(*) from recipe_lines where product_id = air) = 1, 'satuan dengan konversi diterima');
  delete from recipe_lines where product_id = air;
  perform pg_temp.ok9(pg_temp.fails9(format('insert into recipe_lines(org_id, product_id, ingredient_id, qty, unit_id) values (%L, %L, %L, 5, %L)', o1, svc, bean, gram)), 'jasa tak boleh punya resep');
  perform pg_temp.ok9(pg_temp.fails9(format('insert into recipe_lines(org_id, product_id, ingredient_id, qty, unit_id) values (%L, %L, %L, 5, %L)', o1, bundle, bean, gram)), 'paket tak boleh punya resep');
  perform pg_temp.ok9(pg_temp.fails9(format('insert into recipe_lines(org_id, product_id, ingredient_id, qty, unit_id) values (%L, %L, %L, 5, %L)', o1, kopi, svc, gram)), 'jasa tak boleh jadi bahan');
  perform pg_temp.ok9(pg_temp.fails9(format('insert into recipe_lines(org_id, product_id, ingredient_id, qty, unit_id) values (%L, %L, %L, 5, %L)', o1, bean, bean, gram)), 'bahan bukan dirinya sendiri');
  perform pg_temp.ok9(pg_temp.fails9(format('insert into recipe_lines(org_id, product_id, ingredient_id, qty, unit_id) values (%L, %L, %L, 5, %L)', o1, kopi, milk, pcs)), 'satuan porsi tak punya konversi untuk susu');

  -- hanya manajer ke atas
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  perform pg_temp.ok9(pg_temp.fails9(format('select pos.recipe_save(%L, ''[]'')', kopi)), 'kasir tidak boleh menyimpan resep');
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform pg_temp.ok9(pg_temp.fails9(format('select pos.recipe_save(%L, ''[]'')', kopi)), 'org lain tidak boleh menyimpan resep');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.ok9(pg_temp.fails9(format('select pos.recipe_save(%L, ''[]'')', kopi)), 'tanpa login ditolak');

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  perform pg_temp.ok9((select count(*) from recipe_lines where product_id = kopi) = 1, 'resep awal kopi: satu baris');
  -- ganti resep: bahan lama diganti dua bahan baru, satu transaksi
  n := pos.recipe_save(kopi, jsonb_build_array(
    jsonb_build_object('ingredient_id', bean, 'qty', 20, 'unit_id', gram),
    jsonb_build_object('ingredient_id', milk, 'qty', 0.15, 'unit_id', kg)));
  perform pg_temp.ok9(n = 2, 'dua baris tersimpan');
  perform pg_temp.ok9((select count(*) from recipe_lines where product_id = kopi) = 2, 'resep kopi kini dua baris');
  perform pg_temp.ok9((select qty from recipe_lines where product_id = kopi and ingredient_id = bean) = 20, 'jumlah bean 20');
  select detail into d from activity_logs where entity = 'recipe' and entity_id = kopi;
  perform pg_temp.ok9(d->>'name' = 'Kopi Susu' and d->'changes'->'lines'->>0 like 'Biji Kopi 18 gram%' and d->'changes'->'lines'->>1 like '%Biji Kopi 20 gram%', 'log ringkasan: ' || d::text);
  select count(*) into logs from activity_logs where entity = 'recipe';
  perform pg_temp.ok9(logs = 1, 'satu baris log per simpan, bukan per bahan: ' || logs);
  -- simpan yang sama: tidak menambah log
  perform pos.recipe_save(kopi, jsonb_build_array(
    jsonb_build_object('ingredient_id', bean, 'qty', 20, 'unit_id', gram),
    jsonb_build_object('ingredient_id', milk, 'qty', 0.15, 'unit_id', kg)));
  perform pg_temp.ok9((select count(*) from activity_logs where entity = 'recipe') = 1, 'tanpa perubahan tidak dicatat');

  -- penjualan memakai faktor konversi: 0.15 kg susu = 150 gram
  perform pg_temp.ok9((select sum(component_qty) from pos.sale_components(kopi, 2) where component_id = milk) = 300, 'faktor kg ke gram dipakai penjualan');

  -- galat: semua atau tidak sama sekali (resep lama utuh bila ada baris salah)
  perform pg_temp.ok9(pg_temp.fails9(format('select pos.recipe_save(%L, %L::jsonb)', kopi, jsonb_build_array(
    jsonb_build_object('ingredient_id', bean, 'qty', 5, 'unit_id', gram), jsonb_build_object('ingredient_id', milk, 'qty', 5, 'unit_id', pcs))::text)), 'satuan salah menggagalkan semuanya');
  perform pg_temp.ok9((select count(*) from recipe_lines where product_id = kopi) = 2 and (select qty from recipe_lines where product_id = kopi and ingredient_id = bean) = 20, 'resep lama utuh setelah gagal');
  perform pg_temp.ok9(pg_temp.fails9(format('select pos.recipe_save(%L, %L::jsonb)', kopi, jsonb_build_array(
    jsonb_build_object('ingredient_id', bean, 'qty', 5, 'unit_id', gram), jsonb_build_object('ingredient_id', bean, 'qty', 6, 'unit_id', gram))::text)), 'bahan kembar ditolak');
  perform pg_temp.ok9(pg_temp.fails9(format('select pos.recipe_save(%L, %L::jsonb)', kopi, jsonb_build_array(jsonb_build_object('ingredient_id', bean, 'qty', 0, 'unit_id', gram))::text)), 'jumlah 0 ditolak');
  perform pg_temp.ok9(pg_temp.fails9(format('select pos.recipe_save(%L, %L::jsonb)', kopi, jsonb_build_array(jsonb_build_object('ingredient_id', bean, 'qty', 1.00001, 'unit_id', gram))::text)), '5 desimal ditolak');
  perform pg_temp.ok9(pg_temp.fails9(format('select pos.recipe_save(%L, ''{"a":1}'')', kopi)), 'bukan larik ditolak');
  perform pg_temp.ok9(pg_temp.fails9(format('select pos.recipe_save(%L, %L::jsonb)', kopi, (select jsonb_agg(jsonb_build_object('ingredient_id', bean, 'qty', 1, 'unit_id', gram)) from generate_series(1, 61))::text)), 'lebih dari 60 baris ditolak');
  perform pg_temp.ok9(pg_temp.fails9(format('select pos.recipe_save(%L, ''[]'')', gen_random_uuid())), 'produk tak dikenal ditolak');

  -- resep dikosongkan
  perform pos.recipe_save(kopi, '[]'::jsonb);
  perform pg_temp.ok9((select count(*) from recipe_lines where product_id = kopi) = 0, 'resep dikosongkan');
  perform pg_temp.ok9((select count(*) from activity_logs where entity = 'recipe') = 2, 'pengosongan tercatat');

  -- fungsi tidak terbuka untuk anon
  perform pg_temp.ok9(not has_function_privilege('anon', 'pos.recipe_save(uuid, jsonb)', 'execute'), 'anon tidak boleh menjalankan recipe_save');
  perform pg_temp.ok9(has_function_privilege('authenticated', 'pos.recipe_save(uuid, jsonb)', 'execute'), 'authenticated boleh');

  -- pulihkan resep awal untuk tes sesudahnya
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform pos.recipe_save(kopi, jsonb_build_array(jsonb_build_object('ingredient_id', bean, 'qty', 18, 'unit_id', gram)));
  perform pg_temp.ok9((select qty from recipe_lines where product_id = kopi) = 18, 'resep awal dipulihkan');
end $$;
