-- Pengaturan rental PS (migrasi 0158): station hanya di lantai PS, pita tarif tidak bertumpuk, hanya pengelola yang menulis,
-- semua anggota membaca, paket jendela vs paket biasa, pengaturan outlet.
create or replace function pg_temp.ok58(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails58(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;
do $$
declare o1 uuid := ctx('o1'); out1 uuid := ctx('out1'); u_mgr uuid := gen_random_uuid(); u_cash uuid := gen_random_uuid();
  f_ps uuid := gen_random_uuid(); f_cafe uuid := gen_random_uuid(); t_ps uuid := gen_random_uuid(); t_cafe uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (u_mgr, 'mgr-ps@x'), (u_cash, 'cash-ps@x');
  insert into org_members(org_id, user_id, role) values (o1, u_mgr, 'manager'), (o1, u_cash, 'cashier');
  insert into floors(id, org_id, outlet_id, name, kind) values (f_ps, o1, out1, 'Lantai PS Uji', 'ps'), (f_cafe, o1, out1, 'Lantai Kafe Uji', 'cafe');
  insert into tables(id, org_id, outlet_id, floor_id, name) values (t_ps, o1, out1, f_ps, 'PS5-UJI'), (t_cafe, o1, out1, f_cafe, 'MEJA-UJI');
  perform pg_temp.ok58((select kind from floors where id = f_cafe) = 'cafe', 'lantai bawaan = kafe');

  perform set_config('request.jwt.claim.sub', u_cash::text, true); set local role authenticated;
  perform pg_temp.ok58(pg_temp.fails58(format('select pos.ps_station_save(%L, ''PS5'', 10000, false, array[''FIFA'']::text[], ''[]''::jsonb)', t_ps)), 'kasir tidak boleh menyimpan station');
  reset role;

  perform set_config('request.jwt.claim.sub', u_mgr::text, true); set local role authenticated;
  perform pg_temp.ok58(pg_temp.fails58(format('select pos.ps_station_save(%L, ''PS5'', 10000, false, array[]::text[], ''[]''::jsonb)', t_cafe)), 'meja kafe tidak bisa jadi station');
  perform pos.ps_station_save(t_ps, 'PS5', 10000, false, array['EA FC 25', 'Tekken 8'],
    '[{"start_min":600,"end_min":1020,"rate_per_hour":8000,"weekdays":null},{"start_min":1020,"end_min":1440,"rate_per_hour":12000,"weekdays":[5,6]}]'::jsonb);
  perform pg_temp.ok58((select count(*) from ps_rate_bands where table_id = t_ps) = 2, 'dua pita tersimpan');
  perform pg_temp.ok58(pg_temp.fails58(format('select pos.ps_station_save(%L, ''PS5'', 10000, false, array[]::text[], %L::jsonb)', t_ps,
    '[{"start_min":600,"end_min":900,"rate_per_hour":8000},{"start_min":800,"end_min":1000,"rate_per_hour":9000}]')), 'pita bertumpuk ditolak');
  perform pg_temp.ok58(pg_temp.fails58(format('select pos.ps_station_save(%L, ''PS5'', 10000, false, array[]::text[], %L::jsonb)', t_ps,
    '[{"start_min":900,"end_min":600,"rate_per_hour":8000}]')), 'pita terbalik ditolak');
  -- hari berbeda boleh jam sama
  perform pos.ps_station_save(t_ps, 'PS5', 10000, true, array['EA FC 25'],
    '[{"start_min":600,"end_min":900,"rate_per_hour":8000,"weekdays":[1,2,3]},{"start_min":600,"end_min":900,"rate_per_hour":9000,"weekdays":[6,0]}]'::jsonb);
  perform pg_temp.ok58((select is_maintenance from ps_stations where table_id = t_ps), 'perawatan tersimpan');
  perform pg_temp.ok58((select cardinality(games) from ps_stations where table_id = t_ps) = 1, 'game diganti');
  perform pg_temp.ok58((select count(*) from ps_rate_bands where table_id = t_ps) = 2, 'pita diganti, bukan ditambah');

  insert into ps_packages(org_id, outlet_id, name, duration_minutes, price) values (o1, out1, 'Paket 2 jam', 120, 20000);
  insert into ps_packages(org_id, outlet_id, name, price, window_start_min, window_end_min) values (o1, out1, 'Malam 18-21', 30000, 1080, 1260);
  perform pg_temp.ok58(pg_temp.fails58(format('insert into ps_packages(org_id, outlet_id, name, price) values (%L, %L, ''tanpa durasi'', 1000)', o1, out1)), 'paket biasa wajib durasi');
  perform pg_temp.ok58(pg_temp.fails58(format('insert into ps_packages(org_id, outlet_id, name, duration_minutes, price, window_start_min, window_end_min) values (%L, %L, ''campur'', 60, 1000, 1080, 1260)', o1, out1)), 'paket jendela tanpa durasi');
  perform pg_temp.ok58(pg_temp.fails58(format('insert into ps_packages(org_id, outlet_id, name, price, window_start_min, window_end_min) values (%L, %L, ''terbalik'', 1000, 1260, 1080)', o1, out1)), 'jendela terbalik ditolak');
  perform pos.ps_settings_save(out1, 10, 90, 'Halo, transfer ya');
  perform pg_temp.ok58(pg_temp.fails58(format('select pos.ps_settings_save(%L, 99, 90, null)', out1)), 'tenggang > 30 ditolak');
  reset role;
  perform pg_temp.ok58((select ps_grace_minutes from outlet_settings where outlet_id = out1) = 10 and (select ps_booking_expiry_minutes from outlet_settings where outlet_id = out1) = 90, 'tenggang dan batas hangus tersimpan');

  perform set_config('request.jwt.claim.sub', u_cash::text, true); set local role authenticated;
  perform pg_temp.ok58((select count(*) from pos.ps_stations where table_id = t_ps) = 1, 'kasir boleh membaca station');
  perform pg_temp.ok58((select count(*) from pos.ps_packages where outlet_id = out1) = 2, 'kasir boleh membaca paket');
  perform pg_temp.ok58(pg_temp.fails58(format('insert into pos.ps_packages(org_id, outlet_id, name, duration_minutes, price) values (%L, %L, ''curang'', 60, 1)', o1, out1)), 'kasir tidak boleh menulis paket');
  reset role;

  delete from tables where id in (t_ps, t_cafe);
  delete from floors where id in (f_ps, f_cafe);
  delete from ps_packages where org_id = o1;
  delete from org_members where user_id in (u_mgr, u_cash);
end $$;
