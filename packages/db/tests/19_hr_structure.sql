-- Struktur SDM (migrasi 0038): hanya pemilik/manajer yang boleh membaca/menulis; nama unik per org; menghapus jabatan/unit/tipe
-- hanya melepas tautan karyawan; unit tidak boleh jadi induk dirinya; pengaturan radius dijaga bentuknya; org lain tidak melihat apa pun.
create or replace function pg_temp.ok38(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails38(sql text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return true;
end $$;

do $$
declare
  o1 uuid := ctx('o1'); out1 uuid := ctx('out1'); emp uuid := ctx('emp'); ud uuid := ctx('ud');
  mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  jl uuid := gen_random_uuid(); ou uuid := gen_random_uuid(); et uuid := gen_random_uuid(); o2 uuid;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-hr@x'), (cash, 'cash-hr@x'), (stranger, 'stranger-hr@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  insert into pos.job_levels(id, org_id, name, rank) values (jl, o1, 'Supervisor', 5);
  insert into pos.org_units(id, org_id, name) values (ou, o1, 'Dapur');
  insert into pos.org_units(org_id, name, parent_id) values (o1, 'Bar', ou);
  insert into pos.employee_types(id, org_id, name) values (et, o1, 'Paruh waktu');
  insert into pos.employee_hr(employee_id, org_id, job_level_id, org_unit_id, employee_type_id) values (emp, o1, jl, ou, et);
  insert into pos.attendance_settings(outlet_id, org_id, latitude, longitude, radius_m, mode) values (out1, o1, -6.2, 106.8, 100, 'block');
  insert into pos.employee_notifications(org_id, employee_id, title, body) values (o1, null, 'Rapat', 'Rapat Senin pukul 09.00'), (o1, emp, 'Jadwal', 'Shift berubah');
  perform pg_temp.ok38((select count(*) from pos.job_levels) = 1 and (select count(*) from pos.org_units) = 2 and (select count(*) from pos.employee_notifications) = 2, 'manajer membaca struktur SDM');
  -- bentuk data
  perform pg_temp.ok38(pg_temp.fails38(format('insert into pos.job_levels(org_id, name) values (%L, ''  supervisor '')', o1)), 'nama jabatan ganda ditolak (tanpa beda huruf/spasi)');
  perform pg_temp.ok38(pg_temp.fails38(format('insert into pos.job_levels(org_id, name) values (%L, '''')', o1)), 'nama kosong ditolak');
  perform pg_temp.ok38(pg_temp.fails38(format('update pos.org_units set parent_id = id where id = %L', ou)), 'unit tidak boleh jadi induk dirinya');
  perform pg_temp.ok38(pg_temp.fails38(format('update pos.attendance_settings set radius_m = 5 where outlet_id = %L', out1)), 'radius < 10 m ditolak');
  perform pg_temp.ok38(pg_temp.fails38(format('update pos.attendance_settings set latitude = 91 where outlet_id = %L', out1)), 'lintang di luar rentang ditolak');
  perform pg_temp.ok38(pg_temp.fails38(format('update pos.attendance_settings set latitude = null, longitude = null where outlet_id = %L', out1)), 'radius tanpa titik lokasi ditolak');
  perform pg_temp.ok38(pg_temp.fails38(format('update pos.attendance_settings set mode = ''lain'' where outlet_id = %L', out1)), 'mode tidak dikenal ditolak');
  perform pg_temp.ok38(pg_temp.fails38(format('insert into pos.employee_notifications(org_id, title, body) values (%L, ''x'', '''')', o1)), 'isi notifikasi kosong ditolak');
  -- menghapus hanya melepas tautan
  delete from pos.job_levels where id = jl;
  delete from pos.org_units where id = ou;
  delete from pos.employee_types where id = et;
  perform pg_temp.ok38((select job_level_id is null and org_unit_id is null and employee_type_id is null from pos.employee_hr where employee_id = emp), 'hapus jabatan/unit/tipe melepas tautan karyawan');
  perform pg_temp.ok38((select count(*) from pos.org_units where parent_id is null) = 1, 'anak unit tetap ada dan jadi tingkat atas');
  reset role;

  -- kasir dan perangkat: tidak melihat dan tidak menulis
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok38((select count(*) from pos.org_units) = 0 and (select count(*) from pos.employee_notifications) = 0 and (select count(*) from pos.attendance_settings) = 0, 'kasir tidak melihat struktur SDM');
  perform pg_temp.ok38(pg_temp.fails38(format('insert into pos.job_levels(org_id, name) values (%L, ''Peretas'')', o1)), 'kasir tidak boleh menulis jabatan');
  reset role;
  perform set_config('request.jwt.claim.sub', ud::text, true);
  set local role authenticated;
  perform pg_temp.ok38((select count(*) from pos.employee_notifications) = 0 and (select count(*) from pos.employee_hr) = 0, 'akun perangkat tidak melihat SDM');
  reset role;

  -- org lain
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok38((select count(*) from pos.org_units) = 0 and (select count(*) from pos.employee_notifications) = 0 and (select count(*) from pos.employee_hr) = 0, 'org lain tidak melihat SDM');
    perform pg_temp.ok38(pg_temp.fails38(format('insert into pos.employee_notifications(org_id, title, body) values (%L, ''x'', ''y'')', o1)), 'org lain tidak boleh menulis');
    reset role;
  end if;
end $$;
