-- Sesi dan booking PS di server (migrasi 0159): rev mencegah kiriman lama menimpa, satu sesi berjalan per station, booking tidak bertumpuk,
-- booking tidak menimpa sesi berjalan, karyawan kasir (aplikasi HP) tidak boleh membuat booking, booking belum lunas hangus, akses antar org.
create or replace function pg_temp.ok59(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails59(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;
do $$
declare o1 uuid := ctx('o1'); out1 uuid := ctx('out1'); f_ps uuid := gen_random_uuid(); t_ps uuid := gen_random_uuid(); t_ps2 uuid := gen_random_uuid();
  u_pos uuid := gen_random_uuid(); u_mgr uuid := gen_random_uuid(); u_emp uuid := gen_random_uuid(); u_out uuid := gen_random_uuid();
  e_emp uuid := gen_random_uuid(); e_mgr uuid := gen_random_uuid();
  s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid(); b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); b3 uuid := gen_random_uuid(); b4 uuid := gen_random_uuid(); b5 uuid := gen_random_uuid();
  t0 timestamptz := date_trunc('minute', now()); r jsonb; j jsonb;
begin
  insert into auth.users(id, email) values (u_pos, 'pos-ss@x'), (u_mgr, 'mgr-ss@x'), (u_emp, 'emp-ss@x'), (u_out, 'out-ss@x');
  insert into org_members(org_id, user_id, role) values (o1, u_pos, 'cashier'), (o1, u_mgr, 'manager'), (o1, u_emp, 'cashier');
  insert into employees(id, org_id, name, role, user_id) values (e_emp, o1, 'Kasir HP SS', 'cashier', u_emp), (e_mgr, o1, 'Manajer SS', 'manager', u_mgr);
  insert into floors(id, org_id, outlet_id, name, kind) values (f_ps, o1, out1, 'Lantai PS SS', 'ps');
  insert into tables(id, org_id, outlet_id, floor_id, name) values (t_ps, o1, out1, f_ps, 'PS5-SS'), (t_ps2, o1, out1, f_ps, 'PS4-SS');
  insert into ps_stations(table_id, org_id, outlet_id, console_label, rate_per_hour) values (t_ps, o1, out1, 'PS5', 10000), (t_ps2, o1, out1, 'PS4', 7000);

  -- kasir POS (anggota tanpa karyawan tertaut): sesi
  perform set_config('request.jwt.claim.sub', u_pos::text, true); set local role authenticated;
  r := pos.ps_session_upsert(out1, jsonb_build_object('id', s1, 'table_id', t_ps, 'customer_name', 'Raka', 'pressed_at', t0, 'billable_start', t0 + interval '5 minutes', 'ends_at', t0 + interval '65 minutes', 'total', 10000, 'rev', 1));
  perform pg_temp.ok59((r->>'accepted')::boolean, 'sesi baru diterima');
  r := pos.ps_session_upsert(out1, jsonb_build_object('id', s1, 'table_id', t_ps, 'pressed_at', t0, 'billable_start', t0 + interval '5 minutes', 'ends_at', t0 + interval '6 minutes', 'total', 1, 'rev', 1));
  perform pg_temp.ok59(not (r->>'accepted')::boolean, 'rev sama ditolak (tidak menimpa)');
  r := pos.ps_session_upsert(out1, jsonb_build_object('id', s1, 'table_id', t_ps, 'customer_name', 'Raka', 'pressed_at', t0, 'billable_start', t0 + interval '5 minutes', 'ends_at', t0 + interval '95 minutes', 'total', 15000, 'rev', 2));
  perform pg_temp.ok59((r->>'accepted')::boolean, 'rev lebih tinggi menimpa (tambah waktu)');
  perform pg_temp.ok59(pg_temp.fails59(format('select pos.ps_session_upsert(%L, %L::jsonb)', out1, jsonb_build_object('id', s2, 'table_id', t_ps, 'pressed_at', t0, 'billable_start', t0, 'ends_at', t0 + interval '30 minutes', 'rev', 1)::text)), 'dua sesi berjalan di satu station ditolak');
  perform pg_temp.ok59(pg_temp.fails59(format('select pos.ps_session_upsert(%L, %L::jsonb)', out1, jsonb_build_object('id', gen_random_uuid(), 'table_id', gen_random_uuid(), 'pressed_at', t0, 'billable_start', t0, 'ends_at', t0 + interval '30 minutes')::text)), 'station tidak dikenal ditolak');
  r := pos.ps_booking_upsert(out1, jsonb_build_object('id', b4, 'table_id', t_ps2, 'name', 'Dari POS', 'phone', '0812', 'start_at', t0 + interval '10 hours', 'duration_minutes', 60, 'price', 7000, 'expires_at', t0 + interval '2 hours', 'rev', 1));
  perform pg_temp.ok59((r->>'accepted')::boolean, 'kasir POS boleh membuat booking');
  reset role;

  -- booking oleh manajer
  perform set_config('request.jwt.claim.sub', u_mgr::text, true); set local role authenticated;
  r := pos.ps_booking_upsert(out1, jsonb_build_object('id', b1, 'table_id', t_ps, 'name', 'Budi', 'phone', '0812', 'start_at', t0 + interval '5 hours', 'duration_minutes', 120, 'label', '2 jam', 'price', 20000, 'expires_at', t0 + interval '3 hours', 'rev', 1));
  perform pg_temp.ok59((r->>'accepted')::boolean, 'manajer membuat booking');
  perform pg_temp.ok59(pg_temp.fails59(format('select pos.ps_booking_upsert(%L, %L::jsonb)', out1, jsonb_build_object('id', b2, 'table_id', t_ps, 'name', 'Bentrok', 'start_at', t0 + interval '6 hours', 'duration_minutes', 60, 'expires_at', t0 + interval '1 hour', 'rev', 1)::text)), 'booking bertumpuk ditolak');
  r := pos.ps_booking_upsert(out1, jsonb_build_object('id', b3, 'table_id', t_ps, 'name', 'Setelahnya', 'start_at', t0 + interval '7 hours', 'duration_minutes', 60, 'expires_at', t0 + interval '2 hours', 'rev', 1));
  perform pg_temp.ok59((r->>'accepted')::boolean, 'booking tepat setelah booking lain boleh');
  perform pg_temp.ok59(pg_temp.fails59(format('select pos.ps_booking_upsert(%L, %L::jsonb)', out1, jsonb_build_object('id', b5, 'table_id', t_ps, 'name', 'Timpa sesi', 'start_at', t0 + interval '30 minutes', 'duration_minutes', 30, 'expires_at', t0 + interval '1 hour', 'rev', 1)::text)), 'booking menimpa sesi berjalan ditolak');
  r := pos.ps_booking_upsert(out1, jsonb_build_object('id', b3, 'table_id', t_ps, 'name', 'Setelahnya', 'start_at', t0 + interval '7 hours', 'duration_minutes', 60, 'paid', true, 'expires_at', t0 + interval '2 hours', 'rev', 2));
  perform pg_temp.ok59((r->>'accepted')::boolean, 'tandai lunas (rev naik)');
  r := pos.ps_booking_upsert(out1, jsonb_build_object('id', b1, 'table_id', t_ps, 'name', 'Budi', 'start_at', t0 + interval '5 hours', 'duration_minutes', 120, 'status', 'cancelled', 'expires_at', t0 + interval '3 hours', 'rev', 2));
  perform pg_temp.ok59((r->>'accepted')::boolean, 'batalkan booking');
  reset role;

  -- karyawan berperan kasir lewat aplikasi HP: tidak boleh membuat booking, tetapi boleh membaca
  perform set_config('request.jwt.claim.sub', u_emp::text, true); set local role authenticated;
  perform pg_temp.ok59(pg_temp.fails59(format('select pos.ps_booking_upsert(%L, %L::jsonb)', out1, jsonb_build_object('id', gen_random_uuid(), 'table_id', t_ps2, 'name', 'Curang', 'start_at', t0 + interval '20 hours', 'duration_minutes', 60, 'expires_at', t0 + interval '2 hours', 'rev', 1)::text)), 'karyawan kasir tidak boleh membuat booking');
  j := pos.ps_board(out1, t0 - interval '1 day', t0 + interval '2 days');
  perform pg_temp.ok59(jsonb_array_length(j->'sessions') >= 1 and jsonb_array_length(j->'bookings') >= 2, 'karyawan membaca papan jadwal');
  perform pg_temp.ok59(not exists (select 1 from jsonb_array_elements(j->'bookings') x where x->>'status' = 'cancelled'), 'booking batal tidak ikut papan');
  reset role;

  -- hangus otomatis: booking belum lunas yang lewat batas
  insert into ps_bookings(id, org_id, outlet_id, table_id, name, start_at, duration_minutes, expires_at) values (gen_random_uuid(), o1, out1, t_ps2, 'Telat Bayar', t0 + interval '30 hours', 60, t0 - interval '1 minute');
  perform set_config('request.jwt.claim.sub', u_mgr::text, true); set local role authenticated;
  j := pos.ps_board(out1, t0, t0 + interval '3 days');
  perform pg_temp.ok59(not exists (select 1 from jsonb_array_elements(j->'bookings') x where x->>'name' = 'Telat Bayar'), 'booking belum lunas lewat batas dihanguskan');
  reset role;
  perform pg_temp.ok59((select status from ps_bookings where name = 'Telat Bayar') = 'expired', 'status expired');

  -- sesi selesai lalu sesi baru: booking yang sudah dekat jadi started
  perform set_config('request.jwt.claim.sub', u_pos::text, true); set local role authenticated;
  perform pos.ps_session_upsert(out1, jsonb_build_object('id', s1, 'table_id', t_ps, 'pressed_at', t0, 'billable_start', t0, 'ends_at', t0 + interval '95 minutes', 'status', 'finished', 'finished_at', t0 + interval '60 minutes', 'rev', 3));
  reset role;
  perform pg_temp.ok59((select status from ps_sessions where id = s1) = 'finished', 'sesi selesai');
  perform set_config('request.jwt.claim.sub', u_pos::text, true); set local role authenticated;
  perform pos.ps_booking_upsert(out1, jsonb_build_object('id', b5, 'table_id', t_ps, 'name', 'Segera', 'start_at', t0 + interval '10 minutes', 'duration_minutes', 60, 'expires_at', t0 + interval '2 hours', 'rev', 1));
  perform pos.ps_session_upsert(out1, jsonb_build_object('id', s2, 'table_id', t_ps, 'pressed_at', t0 + interval '8 minutes', 'billable_start', t0 + interval '13 minutes', 'ends_at', t0 + interval '73 minutes', 'rev', 1));
  reset role;
  perform pg_temp.ok59((select status from ps_bookings where id = b5) = 'started', 'booking dekat jadi started saat sesi dimulai');

  -- org lain tidak membaca
  perform set_config('request.jwt.claim.sub', u_out::text, true); set local role authenticated;
  perform pg_temp.ok59(pg_temp.fails59(format('select pos.ps_board(%L, now() - interval ''1 day'', now() + interval ''1 day'')', out1)), 'bukan anggota tidak membaca');
  perform pg_temp.ok59(pg_temp.fails59(format('select pos.ps_session_upsert(%L, %L::jsonb)', out1, jsonb_build_object('id', gen_random_uuid(), 'table_id', t_ps, 'pressed_at', t0, 'billable_start', t0, 'ends_at', t0 + interval '10 minutes')::text)), 'bukan anggota tidak menulis');
  reset role;

  delete from ps_sessions where org_id = o1; delete from ps_bookings where org_id = o1;
  delete from ps_stations where table_id in (t_ps, t_ps2);
  delete from tables where id in (t_ps, t_ps2); delete from floors where id = f_ps;
  delete from employees where id in (e_emp, e_mgr); delete from org_members where user_id in (u_pos, u_mgr, u_emp);
end $$;
