-- Absensi karyawan (migrasi 0035): clock in/out dengan PIN dari perangkat, waktu dari server, satu catatan terbuka per karyawan,
-- foto hanya di folder org sendiri, klien tidak boleh menulis tabel langsung, koreksi hanya pemilik/manajer, org lain tidak melihat.
create or replace function pg_temp.ok35(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails35(sql text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  -- galat sintaks / objek tidak ada / tipe salah berarti tesnya sendiri yang keliru, bukan penolakan yang sah
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return true;
end $$;

do $$
declare
  o1 uuid := ctx('o1'); dev uuid := ctx('dev'); emp uuid := ctx('emp'); ud uuid := ctx('ud'); out1 uuid := ctx('out1');
  adm uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  r jsonb; a_id uuid; v_in timestamptz; v_out timestamptz; photo_in text; photo_out text; manual_id uuid;
begin
  insert into auth.users(id, email) values (adm, 'adm-att@x'), (stranger, 'stranger-att@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  perform pos.set_employee_pin(emp, '123456');
  photo_in := o1::text || '/' || emp::text || '/masuk.jpg';
  photo_out := o1::text || '/' || emp::text || '/pulang.jpg';

  -- perangkat kasir (anggota org): clock in
  perform set_config('request.jwt.claim.sub', ud::text, true);
  set local role authenticated;
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.attendance_clock_in(%L, %L, %L)', dev, emp, '000000')), 'PIN salah ditolak');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.attendance_clock_in(%L, %L, %L, %L)', dev, emp, '123456', o2::text || '/x/a.jpg')), 'foto di folder org lain ditolak');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.attendance_clock_in(%L, %L, %L, %L)', dev, emp, '123456', o1::text || '/../x/a.jpg')), 'jalur foto dengan .. ditolak');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.attendance_clock_out(%L, %L, %L)', dev, emp, '123456')), 'clock out tanpa clock in ditolak');
  r := pos.attendance_clock_in(dev, emp, '123456', photo_in);
  a_id := (r->>'id')::uuid;
  perform pg_temp.ok35(exists (select 1 from jsonb_array_elements(pos.attendance_status(dev)) e where e->>'employee_id' = emp::text), 'status perangkat menampilkan karyawan yang sedang masuk');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.attendance_clock_in(%L, %L, %L)', dev, emp, '123456')), 'clock in ganda ditolak');
  perform pg_temp.ok35((select count(*) from pos.attendance) = 0, 'akun perangkat tidak membaca tabel langsung (hanya lewat fungsi)');

  -- klien tidak boleh menulis tabel langsung
  perform pg_temp.ok35(pg_temp.fails35(format('insert into pos.attendance(org_id, outlet_id, employee_id) values (%L, %L, %L)', o1, out1, emp)), 'insert langsung ditolak');
  perform pg_temp.ok35(pg_temp.fails35(format('update pos.attendance set clock_in_at = now() - interval ''5 hours'' where id = %L', a_id)), 'update langsung ditolak');
  perform pg_temp.ok35(pg_temp.fails35(format('delete from pos.attendance where id = %L', a_id)), 'delete langsung ditolak');

  r := pos.attendance_clock_out(dev, emp, '123456', photo_out);
  perform pg_temp.ok35(jsonb_array_length(pos.attendance_status(dev)) = 0, 'status kosong setelah clock out');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.attendance_clock_out(%L, %L, %L)', dev, emp, '123456')), 'clock out ganda ditolak');
  -- setelah clock out boleh clock in lagi (catatan terbuka baru), lalu ditutup lagi
  r := pos.attendance_clock_in(dev, emp, '123456');
  perform pos.attendance_clock_out(dev, emp, '123456');
  -- kasir bukan pengelola: tidak boleh mengoreksi
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.attendance_admin_save(null, %L, %L, %L, now() - interval ''3 hours'', now() - interval ''2 hours'', null)', o1, emp, out1)), 'kasir tidak boleh koreksi');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.attendance_admin_delete(%L)', a_id)), 'kasir tidak boleh menghapus');
  reset role;

  -- isi tabel (dibaca sebagai superuser): waktu dari server, foto, dan dua catatan
  select clock_in_at, clock_out_at into v_in, v_out from attendance where id = a_id;
  perform pg_temp.ok35(clock_in_photo_path = photo_in and clock_out_photo_path = photo_out and employee_id = emp and outlet_id = out1 and device_id = dev,
    'foto, karyawan, outlet, perangkat tersimpan') from attendance where id = a_id;
  perform pg_temp.ok35(v_out is not null and v_out >= v_in and abs(extract(epoch from (now() - v_in))) < 120, 'jam dari server dan clock out >= clock in');
  perform pg_temp.ok35((select count(*) from attendance where employee_id = emp) = 2, 'dua catatan setelah masuk kedua');

  -- admin: tambah, ubah, validasi, hapus
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  manual_id := pos.attendance_admin_save(null, o1, emp, out1, now() - interval '30 hours', now() - interval '22 hours', '  lupa absen  ');
  perform pg_temp.ok35((select note = 'lupa absen' and edited_by = adm and clock_out_at - clock_in_at = interval '8 hours' from attendance where id = manual_id), 'admin menambah catatan, note dipangkas, edited_by terisi');
  perform pos.attendance_admin_save(manual_id, o1, emp, out1, now() - interval '30 hours', now() - interval '21 hours', 'diperbaiki');
  perform pg_temp.ok35((select clock_out_at - clock_in_at = interval '9 hours' and note = 'diperbaiki' from attendance where id = manual_id), 'admin mengubah catatan');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.attendance_admin_save(null, %L, %L, %L, now() - interval ''2 hours'', now() - interval ''3 hours'', null)', o1, emp, out1)), 'clock out sebelum clock in ditolak');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.attendance_admin_save(null, %L, %L, %L, now() + interval ''2 hours'', null, null)', o1, emp, out1)), 'jam di masa depan ditolak');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.attendance_admin_save(null, %L, %L, %L, now() - interval ''1 hour'', null, null)', o1, gen_random_uuid(), out1)), 'karyawan tidak ada ditolak');
  -- satu catatan terbuka per karyawan juga berlaku untuk koreksi admin
  perform pos.attendance_admin_save(null, o1, emp, out1, now() - interval '1 hour', null, 'masih bekerja');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.attendance_admin_save(null, %L, %L, %L, now() - interval ''30 minutes'', null, null)', o1, emp, out1)), 'dua catatan terbuka ditolak');
  perform pos.attendance_admin_delete(manual_id);
  perform pg_temp.ok35((select count(*) from pos.attendance where id = manual_id) = 0, 'admin menghapus catatan');
  reset role;

  -- org lain tidak melihat apa pun
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok35((select count(*) from pos.attendance) = 0, 'org lain tidak melihat absensi');
    perform pg_temp.ok35(pg_temp.fails35(format('select pos.attendance_admin_save(null, %L, %L, %L, now() - interval ''3 hours'', null, null)', o1, emp, out1)), 'org lain tidak boleh koreksi');
    reset role;
  end if;
end $$;
