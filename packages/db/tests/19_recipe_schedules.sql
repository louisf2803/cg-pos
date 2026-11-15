-- Jadwal perubahan resep (migrasi 0142): hanya pengelola, waktu masa depan, isi diperiksa, penerapan saat waktunya tiba, kegagalan satu jadwal tidak merusak resep lama.
create or replace function pg_temp.ok_rs(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails_rs(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); bean uuid := ctx('bean'); u1 uuid := ctx('u1');
  gram uuid; prod uuid := gen_random_uuid(); milk uuid;
  mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  s1 uuid; s2 uuid; s3 uuid; n int; st text; q numeric;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-rs@x'), (cash, 'cash-rs@x'), (stranger, 'stranger-rs@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cash, 'cashier'), (o2, stranger, 'owner');
  select id into gram from units where org_id = o1 and name = 'gram';
  insert into products(id, org_id, kind, name, base_unit_id, track_stock) values (prod, o1, 'goods', 'Menu Uji Jadwal', gram, true);
  insert into products(org_id, kind, name, base_unit_id, is_sellable, track_stock) values (o1, 'ingredient', 'Susu Uji Jadwal', gram, false, true) returning id into milk;
  insert into recipe_lines(org_id, product_id, ingredient_id, qty, unit_id) values (o1, prod, bean, 10, gram);

  -- izin: kasir dan org lain ditolak, tanpa login ditolak
  perform set_config('request.jwt.claim.sub', cash::text, true);
  perform pg_temp.ok_rs(pg_temp.fails_rs(format('select pos.recipe_schedule_save(%L, now() + interval ''1 hour'', ''[]'')', prod)), 'kasir tidak boleh menjadwalkan');
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform pg_temp.ok_rs(pg_temp.fails_rs(format('select pos.recipe_schedule_save(%L, now() + interval ''1 hour'', ''[]'')', prod)), 'org lain tidak boleh menjadwalkan');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.ok_rs(pg_temp.fails_rs(format('select pos.recipe_schedule_save(%L, now() + interval ''1 hour'', ''[]'')', prod)), 'tanpa login ditolak');

  -- pengelola: validasi isi dan waktu
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  perform pg_temp.ok_rs(pg_temp.fails_rs(format('select pos.recipe_schedule_save(%L, now() - interval ''1 minute'', ''[]'')', prod)), 'waktu lampau ditolak');
  perform pg_temp.ok_rs(pg_temp.fails_rs(format('select pos.recipe_schedule_save(%L, now() + interval ''1 hour'', ''[{"ingredient_id":"%s","qty":0,"unit_id":"%s"}]'')', prod, milk, gram)), 'jumlah 0 ditolak');
  perform pg_temp.ok_rs(pg_temp.fails_rs(format('select pos.recipe_schedule_save(%L, now() + interval ''1 hour'', ''[{"ingredient_id":"%s","qty":1,"unit_id":"%s"},{"ingredient_id":"%s","qty":2,"unit_id":"%s"}]'')', prod, milk, gram, milk, gram)), 'bahan kembar ditolak');
  perform pg_temp.ok_rs(pg_temp.fails_rs(format('select pos.recipe_schedule_save(%L, now() + interval ''1 hour'', ''[{"ingredient_id":"%s","qty":1.23456,"unit_id":"%s"}]'')', prod, milk, gram)), 'lebih dari 4 desimal ditolak');

  -- jadwal sah: pending, resep lama belum berubah
  s1 := pos.recipe_schedule_save(prod, now() + interval '1 hour', format('[{"ingredient_id":"%s","qty":25,"unit_id":"%s"}]', milk, gram)::jsonb, 'Resep baru musim hujan');
  perform pg_temp.ok_rs((select status from recipe_schedules where id = s1) = 'pending', 'jadwal berstatus pending');
  reset role;
  perform pg_temp.ok_rs(pos.recipe_apply_due() = 0, 'belum waktunya: tidak ada yang diterapkan');
  perform pg_temp.ok_rs((select ingredient_id from recipe_lines where product_id = prod) = bean, 'resep lama utuh sebelum waktunya');

  -- waktunya tiba: diterapkan, resep diganti seluruhnya
  update recipe_schedules set effective_at = now() - interval '1 minute' where id = s1;
  perform pg_temp.ok_rs(pos.recipe_apply_due() = 1, 'satu jadwal diterapkan');
  select count(*), max(ingredient_id::text) into n, st from recipe_lines where product_id = prod;
  perform pg_temp.ok_rs(n = 1 and st = milk::text, 'resep diganti dengan yang baru');
  select rl.qty into q from recipe_lines rl where rl.product_id = prod;
  perform pg_temp.ok_rs(q = 25, 'jumlah baru tersimpan');
  perform pg_temp.ok_rs((select status from recipe_schedules where id = s1) = 'applied' and (select applied_at from recipe_schedules where id = s1) is not null, 'status applied');
  perform pg_temp.ok_rs(pos.recipe_apply_due() = 0, 'tidak diterapkan dua kali');

  -- satu jadwal gagal (bahan tak dikenal) tidak merusak resep dan tidak menghentikan jadwal lain
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  s2 := pos.recipe_schedule_save(prod, now() + interval '1 hour', format('[{"ingredient_id":"%s","qty":5,"unit_id":"%s"}]', gen_random_uuid(), gram)::jsonb);
  s3 := pos.recipe_schedule_save(prod, now() + interval '2 hours', format('[{"ingredient_id":"%s","qty":7,"unit_id":"%s"}]', bean, gram)::jsonb);
  reset role;
  update recipe_schedules set effective_at = now() - interval '2 minutes' where id = s2;
  update recipe_schedules set effective_at = now() - interval '1 minute' where id = s3;
  perform pg_temp.ok_rs(pos.recipe_apply_due() = 1, 'yang sah tetap diterapkan walau satu gagal');
  perform pg_temp.ok_rs((select status from recipe_schedules where id = s2) = 'failed' and (select error from recipe_schedules where id = s2) is not null, 'jadwal gagal ditandai beserta alasannya');
  perform pg_temp.ok_rs((select ingredient_id from recipe_lines where product_id = prod) = bean and (select qty from recipe_lines where product_id = prod) = 7, 'resep mengikuti jadwal yang berhasil');

  -- batal: hanya yang pending, hanya pengelola
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  s1 := pos.recipe_schedule_save(prod, now() + interval '3 hours', '[]'::jsonb);
  perform set_config('request.jwt.claim.sub', cash::text, true);
  perform pg_temp.ok_rs(pg_temp.fails_rs(format('select pos.recipe_schedule_cancel(%L)', s1)), 'kasir tidak boleh membatalkan');
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  perform pg_temp.ok_rs(pos.recipe_schedule_cancel(s1) = true, 'pengelola membatalkan');
  perform pg_temp.ok_rs(pos.recipe_schedule_cancel(s1) = false, 'batal kedua tidak berefek');
  reset role;
  update recipe_schedules set effective_at = now() - interval '1 minute' where id = s1;
  perform pg_temp.ok_rs(pos.recipe_apply_due() = 0, 'yang dibatalkan tidak diterapkan');

  -- daftar hanya terbaca pengelola
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', cash::text, true);
  perform pg_temp.ok_rs((select count(*) from pos.recipe_schedules where org_id = o1) = 0, 'kasir tidak membaca jadwal');
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  perform pg_temp.ok_rs((select count(*) from pos.recipe_schedules where org_id = o1) >= 3, 'pengelola membaca jadwal');
  reset role;

  delete from recipe_schedules where product_id = prod;
  delete from recipe_lines where product_id = prod;
end $$;
