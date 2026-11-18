-- Tipe pelanggan PS (migrasi 0160): grup Normal wajib dan terkunci, grup lain bebas dan bisa disembunyikan dari POS, harga PS per grup.
create or replace function pg_temp.ok60(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails60(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;
do $$
declare o1 uuid := ctx('o1'); out1 uuid := ctx('out1'); u_mgr uuid := gen_random_uuid(); u_cash uuid := gen_random_uuid();
  f_ps uuid := gen_random_uuid(); t_ps uuid := gen_random_uuid(); pk uuid := gen_random_uuid(); g_ojek uuid := gen_random_uuid(); g_norm uuid; new_org uuid := gen_random_uuid();
begin
  select id into g_norm from customer_groups where org_id = o1 and is_default;
  perform pg_temp.ok60(g_norm is not null, 'grup Normal ada untuk org yang sudah ada');
  perform pg_temp.ok60((select name from customer_groups where id = g_norm) = 'Normal' and (select show_in_pos from customer_groups where id = g_norm), 'Normal bernama Normal dan tayang');
  insert into orgs(id, name) values (new_org, 'Org Baru PG');
  perform pg_temp.ok60(exists (select 1 from customer_groups where org_id = new_org and is_default and name = 'Normal'), 'org baru otomatis punya Normal');
  delete from orgs where id = new_org;

  insert into auth.users(id, email) values (u_mgr, 'mgr-pg@x'), (u_cash, 'cash-pg@x');
  insert into org_members(org_id, user_id, role) values (o1, u_mgr, 'manager'), (o1, u_cash, 'cashier');
  insert into floors(id, org_id, outlet_id, name, kind) values (f_ps, o1, out1, 'Lantai PS PG', 'ps');
  insert into tables(id, org_id, outlet_id, floor_id, name) values (t_ps, o1, out1, f_ps, 'PS5-PG');
  insert into ps_stations(table_id, org_id, outlet_id, console_label, rate_per_hour) values (t_ps, o1, out1, 'PS5', 10000);
  insert into ps_packages(id, org_id, outlet_id, name, duration_minutes, price) values (pk, o1, out1, 'Paket PG', 180, 25000);
  insert into customer_groups(id, org_id, name) values (g_ojek, o1, 'Ojek Online PG');

  perform pg_temp.ok60(pg_temp.fails60(format('delete from customer_groups where id = %L', g_norm)), 'Normal tidak bisa dihapus');
  perform pg_temp.ok60(pg_temp.fails60(format('update customer_groups set name = ''Biasa'' where id = %L', g_norm)), 'Normal tidak bisa diganti nama');
  perform pg_temp.ok60(pg_temp.fails60(format('update customer_groups set show_in_pos = false where id = %L', g_norm)), 'Normal tidak bisa disembunyikan');
  perform pg_temp.ok60(pg_temp.fails60(format('update customer_groups set is_default = false where id = %L', g_norm)), 'status Normal tidak bisa dicopot');
  update customer_groups set description = 'ubah deskripsi boleh' where id = g_norm;
  perform pg_temp.ok60(pg_temp.fails60(format('update customer_groups set is_default = true where id = %L', g_ojek)), 'dua grup default ditolak');

  perform set_config('request.jwt.claim.sub', u_cash::text, true); set local role authenticated;
  perform pg_temp.ok60(pg_temp.fails60(format('select pos.customer_group_pos_visibility(%L, %L, false)', o1, g_ojek)), 'kasir tidak boleh mengatur tayang');
  perform pg_temp.ok60(pg_temp.fails60(format('select pos.ps_group_prices_save(%L, ''[]''::jsonb, ''[]''::jsonb)', g_ojek)), 'kasir tidak boleh mengatur harga PS grup');
  perform pg_temp.ok60((select count(*) from pos.customer_groups where org_id = o1) >= 2, 'kasir membaca daftar grup');
  reset role;

  perform set_config('request.jwt.claim.sub', u_mgr::text, true); set local role authenticated;
  perform pos.customer_group_pos_visibility(o1, g_ojek, false);
  reset role;
  perform pg_temp.ok60(not (select show_in_pos from customer_groups where id = g_ojek), 'grup disembunyikan dari POS');
  perform set_config('request.jwt.claim.sub', u_mgr::text, true); set local role authenticated;
  perform pg_temp.ok60(pg_temp.fails60(format('select pos.customer_group_pos_visibility(%L, %L, false)', o1, g_norm)), 'Normal tidak bisa disembunyikan lewat fungsi');
  perform pos.customer_group_pos_visibility(o1, g_ojek, true);
  perform pos.ps_group_prices_save(g_ojek, jsonb_build_array(jsonb_build_object('table_id', t_ps, 'rate_per_hour', 8000)), jsonb_build_array(jsonb_build_object('package_id', pk, 'price', 20000)));
  perform pg_temp.ok60((select rate_per_hour from pos.ps_group_rates where group_id = g_ojek and table_id = t_ps) = 8000, 'tarif grup tersimpan');
  perform pg_temp.ok60((select price from pos.ps_group_package_prices where group_id = g_ojek and package_id = pk) = 20000, 'harga paket grup tersimpan');
  perform pg_temp.ok60(pg_temp.fails60(format('select pos.ps_group_prices_save(%L, ''[]''::jsonb, ''[]''::jsonb)', g_norm)), 'Normal tidak punya penggantian harga');
  perform pg_temp.ok60(pg_temp.fails60(format('select pos.ps_group_prices_save(%L, %L::jsonb, ''[]''::jsonb)', g_ojek, jsonb_build_array(jsonb_build_object('table_id', gen_random_uuid(), 'rate_per_hour', 1))::text)), 'station tidak dikenal ditolak');
  perform pg_temp.ok60((select count(*) from pos.ps_group_rates where group_id = g_ojek) = 1, 'penolakan tidak mengubah harga lama (transaksi)');
  perform pos.ps_group_prices_save(g_ojek, jsonb_build_array(jsonb_build_object('table_id', t_ps, 'rate_per_hour', null)), '[]'::jsonb);
  perform pg_temp.ok60((select count(*) from pos.ps_group_rates where group_id = g_ojek) = 0 and (select count(*) from pos.ps_group_package_prices where group_id = g_ojek) = 0, 'kosongkan = ikut harga Normal');
  reset role;

  delete from customer_groups where id = g_ojek;
  delete from ps_packages where id = pk; delete from ps_stations where table_id = t_ps;
  delete from tables where id = t_ps; delete from floors where id = f_ps;
  delete from org_members where user_id in (u_mgr, u_cash);
end $$;
