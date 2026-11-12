-- Radius absensi (migrasi 0039): mode 'block' menolak absen di luar radius dan tanpa lokasi; mode 'flag' menerima dan mencatat jarak;
-- tanpa pengaturan radius perilaku lama tetap; lokasi tidak masuk akal ditolak; jarak dihitung server.
create or replace function pg_temp.ok39(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails39(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;

do $$
declare
  o1 uuid := ctx('o1'); dev uuid := ctx('dev'); ud uuid := ctx('ud'); out1 uuid := ctx('out1');
  e uuid := gen_random_uuid(); r jsonb;
begin
  insert into employees(id, org_id, name, role) values (e, o1, 'Karyawan Radius', 'cashier');
  insert into employee_outlets(employee_id, outlet_id, org_id) values (e, out1, o1);
  perform pos.set_employee_pin(e, '654321');
  insert into pos.attendance_settings(outlet_id, org_id, latitude, longitude, radius_m, mode) values (out1, o1, -6.2, 106.8, 100, 'block');
  perform pg_temp.ok39(pos._distance_m(-6.2, 106.8, -6.2, 106.8) = 0, 'jarak titik sama = 0');
  perform pg_temp.ok39(pos._distance_m(-6.2, 106.8, -6.21, 106.8) between 1100 and 1120, 'satu per seratus derajat lintang sekitar 1,11 km');

  perform set_config('request.jwt.claim.sub', ud::text, true);
  set local role authenticated;
  perform pg_temp.ok39(pg_temp.fails39(format('select pos.attendance_clock_in(%L, %L, %L)', dev, e, '654321'), 'location required'), 'mode block: tanpa lokasi ditolak');
  perform pg_temp.ok39(pg_temp.fails39(format('select pos.attendance_clock_in(%L, %L, %L, null, -6.21, 106.8)', dev, e, '654321'), 'outside radius'), 'mode block: di luar radius ditolak');
  perform pg_temp.ok39(pg_temp.fails39(format('select pos.attendance_clock_in(%L, %L, %L, null, -6.2, null)', dev, e, '654321'), 'invalid location'), 'hanya lintang ditolak');
  perform pg_temp.ok39(pg_temp.fails39(format('select pos.attendance_clock_in(%L, %L, %L, null, 95, 106.8)', dev, e, '654321'), 'invalid location'), 'lintang > 90 ditolak');
  perform pg_temp.ok39((select count(*) from pos.attendance where employee_id = e) = 0, 'penolakan tidak meninggalkan catatan');
  r := pos.attendance_clock_in(dev, e, '654321', null, -6.2003, 106.8);
  perform pg_temp.ok39((r->>'distance_m')::int between 25 and 40, 'di dalam radius diterima, jarak ~33 m');
  reset role;
  perform pg_temp.ok39((select clock_in_distance_m between 25 and 40 and clock_in_lat = -6.2003 from pos.attendance where employee_id = e), 'lokasi dan jarak tercatat');

  -- mode flag: di luar radius tetap diterima, jarak tercatat
  update pos.attendance set clock_out_at = now() where employee_id = e and clock_out_at is null;
  update pos.attendance_settings set mode = 'flag' where outlet_id = out1;
  perform set_config('request.jwt.claim.sub', ud::text, true);
  set local role authenticated;
  r := pos.attendance_clock_in(dev, e, '654321', null, -6.21, 106.8);
  perform pg_temp.ok39((r->>'distance_m')::int > 1000, 'mode flag: di luar radius diterima dengan jarak tercatat');
  reset role;

  -- tanpa pengaturan radius: perilaku lama
  update pos.attendance set clock_out_at = now() where employee_id = e and clock_out_at is null;
  delete from pos.attendance_settings where outlet_id = out1;
  perform set_config('request.jwt.claim.sub', ud::text, true);
  set local role authenticated;
  r := pos.attendance_clock_in(dev, e, '654321');
  perform pg_temp.ok39(r->'distance_m' = 'null'::jsonb, 'tanpa radius: tanpa lokasi tetap diterima');
  reset role;
end $$;
