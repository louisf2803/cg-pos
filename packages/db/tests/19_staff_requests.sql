-- Pengajuan di aplikasi karyawan (migrasi 0154): cuti H-2 + batas 2 orang per hari + persetujuan pemilik, kasbon satu aktif + bukti transfer,
-- tukar shift (rekan lalu manajer; manajer cukup rekan), jadwal dengan pengecualian, dan batas akses.
create or replace function pg_temp.ok54(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails54(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1');
  u_own uuid := gen_random_uuid(); u_mgr uuid := gen_random_uuid(); u_a uuid := gen_random_uuid(); u_b uuid := gen_random_uuid();
  u_c uuid := gen_random_uuid(); u_d uuid := gen_random_uuid(); u_e uuid := gen_random_uuid();
  e_own uuid := gen_random_uuid(); e_mgr uuid := gen_random_uuid(); e_a uuid := gen_random_uuid(); e_b uuid := gen_random_uuid();
  e_c uuid := gen_random_uuid(); e_d uuid := gen_random_uuid(); e_e uuid := gen_random_uuid();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  d1 date := v_today + 10; d2 date := v_today + 11; d3 date := v_today + 20; d4 date := v_today + 21;
  l_c uuid; l_d uuid; adv uuid; adv_b uuid; sw uuid; sw_m uuid; j jsonb;
begin
  insert into auth.users(id, email) values (u_own, 'own-sr@x'), (u_mgr, 'mgr-sr@x'), (u_a, 'a-sr@x'), (u_b, 'b-sr@x'), (u_c, 'c-sr@x'), (u_d, 'd-sr@x'), (u_e, 'e-sr@x');
  insert into org_members(org_id, user_id, role) values (o1, u_own, 'admin'), (o1, u_mgr, 'manager'), (o1, u_a, 'cashier'), (o1, u_b, 'cashier'), (o1, u_c, 'cashier'), (o1, u_d, 'cashier'), (o1, u_e, 'cashier');
  insert into employees(id, org_id, name, role, user_id) values
    (e_own, o1, 'Pemilik SR', 'owner', u_own), (e_mgr, o1, 'Manajer SR', 'manager', u_mgr), (e_a, o1, 'A SR', 'cashier', u_a), (e_b, o1, 'B SR', 'cashier', u_b),
    (e_c, o1, 'C SR', 'cashier', u_c), (e_d, o1, 'D SR', 'cashier', u_d), (e_e, o1, 'E SR', 'cashier', u_e);
  insert into employee_schedules(employee_id, org_id, weekday, start_time) select x, o1, w, '08:00' from unnest(array[e_c, e_d]) x, generate_series(0, 6) w;
  insert into employee_schedules(employee_id, org_id, weekday, start_time) values
    (e_a, o1, extract(dow from d1)::int, '08:00'), (e_b, o1, extract(dow from d2)::int, '10:00'),
    (e_mgr, o1, extract(dow from d3)::int, '09:00'), (e_e, o1, extract(dow from d4)::int, '11:00');

  -- ===== cuti =====
  perform set_config('request.jwt.claim.sub', u_c::text, true); set local role authenticated;
  perform pg_temp.ok54(pg_temp.fails54(format('select pos.leave_request_create(''leave'', %L, %L, ''liburan'')', v_today + 1, v_today + 1)), 'cuti H-1 ditolak (harus H-2)');
  l_c := pos.leave_request_create('leave', v_today + 5, v_today + 6, 'acara keluarga');
  perform pg_temp.ok54(pg_temp.fails54(format('select pos.leave_request_create(''leave'', %L, %L, ''tumpang'')', v_today + 6, v_today + 7)), 'pengajuan tumpang tindih ditolak');
  perform pg_temp.ok54(pg_temp.fails54(format('select pos.leave_request_decide(%L, true)', l_c)), 'karyawan tidak boleh menyetujui');
  reset role;
  perform set_config('request.jwt.claim.sub', u_d::text, true); set local role authenticated;
  l_d := pos.leave_request_create('leave', v_today + 5, v_today + 6, 'keperluan');
  reset role;
  perform set_config('request.jwt.claim.sub', u_a::text, true); set local role authenticated;
  perform pg_temp.ok54(pg_temp.fails54(format('select pos.leave_request_create(''leave'', %L, %L, ''ikut'')', v_today + 5, v_today + 5)), 'orang ketiga di hari yang sama ditolak (maks 2)');
  perform pos.leave_request_create('sick', v_today, v_today, 'demam');
  perform pg_temp.ok54(pg_temp.fails54(format('select pos.leave_request_create(''sick'', %L, %L, ''tanggal jauh'')', v_today + 5, v_today + 5)), 'sakit tidak untuk tanggal jauh');
  reset role;

  perform set_config('request.jwt.claim.sub', u_mgr::text, true); set local role authenticated;
  perform pg_temp.ok54(pg_temp.fails54(format('select pos.leave_request_decide(%L, true)', l_c)), 'manajer tidak boleh menyetujui cuti (pemilik saja)');
  reset role;
  perform set_config('request.jwt.claim.sub', u_own::text, true); set local role authenticated;
  perform pos.leave_request_decide(l_c, true, 'oke');
  perform pg_temp.ok54(pg_temp.fails54(format('select pos.leave_request_decide(%L, false)', l_c)), 'keputusan tidak bisa diulang');
  perform pos.leave_request_decide(l_d, false, 'bentrok');
  j := pos.staff_requests();
  perform pg_temp.ok54(jsonb_array_length(j->'leave') = 3, 'pemilik melihat semua pengajuan cuti org');
  reset role;
  perform pg_temp.ok54((select count(*) from employee_incidents where employee_id = e_c and kind = 'EXCUSED' and incident_date between v_today + 5 and v_today + 6) = 2, 'persetujuan membuat catatan EXCUSED per hari terjadwal');
  perform pg_temp.ok54((select count(*) from employee_notifications where employee_id = e_d and title = 'Izin ditolak') = 1, 'karyawan diberi tahu keputusan');

  -- ===== kasbon =====
  perform set_config('request.jwt.claim.sub', u_a::text, true); set local role authenticated;
  adv := pos.advance_request_create(250000, 'biaya mendadak');
  perform pg_temp.ok54(pg_temp.fails54('select pos.advance_request_create(100000, ''lagi'')'), 'satu pengajuan menunggu saja');
  perform pg_temp.ok54(pg_temp.fails54('select pos.advance_request_create(0, ''nol'')'), 'nominal harus positif');
  reset role;
  perform set_config('request.jwt.claim.sub', u_mgr::text, true); set local role authenticated;
  perform pg_temp.ok54(pg_temp.fails54(format('select pos.advance_request_decide(%L, true, null, %L)', adv, o1::text || '/' || e_a::text || '/x.jpg')), 'manajer tidak boleh menyetujui kasbon');
  perform pg_temp.ok54((select count(*) from pos.advance_requests) = 1, 'manajer boleh baca tabel (pengelola)');
  perform pg_temp.ok54(jsonb_array_length(pos.staff_requests()->'advances') = 0, 'daftar aplikasi: manajer tidak melihat kasbon orang lain');
  reset role;
  perform set_config('request.jwt.claim.sub', u_own::text, true); set local role authenticated;
  perform pg_temp.ok54(pg_temp.fails54(format('select pos.advance_request_decide(%L, true)', adv)), 'setuju tanpa bukti transfer ditolak');
  perform pg_temp.ok54(pg_temp.fails54(format('select pos.advance_request_decide(%L, true, null, %L)', adv, gen_random_uuid()::text || '/x/x.jpg')), 'bukti di folder org lain ditolak');
  perform pos.advance_request_decide(adv, true, null, o1::text || '/' || e_a::text || '/' || adv::text || '.jpg');
  reset role;
  perform pg_temp.ok54((select amount from cash_advances where employee_id = e_a and kind = 'BORROW') = 250000, 'persetujuan mencatat kasbon BORROW');
  perform set_config('request.jwt.claim.sub', u_a::text, true); set local role authenticated;
  perform pg_temp.ok54(pg_temp.fails54('select pos.advance_request_create(100000, ''lagi'')'), 'kasbon aktif (saldo > 0) menolak pengajuan baru');
  reset role;
  perform set_config('request.jwt.claim.sub', u_b::text, true); set local role authenticated;
  adv_b := pos.advance_request_create(50000, 'uji');
  perform pos.advance_request_cancel(adv_b);
  reset role;
  perform pg_temp.ok54((select status from advance_requests where id = adv_b) = 'cancelled', 'pengaju boleh membatalkan');

  -- ===== tukar shift =====
  perform set_config('request.jwt.claim.sub', u_a::text, true); set local role authenticated;
  perform pg_temp.ok54(pg_temp.fails54(format('select pos.swap_request_create(%L, %L, %L)', e_b, d2, d1)), 'tanggal sendiri yang tidak terjadwal ditolak');
  sw := pos.swap_request_create(e_b, d1, d2, 'ada acara');
  reset role;
  perform set_config('request.jwt.claim.sub', u_c::text, true); set local role authenticated;
  perform pg_temp.ok54(pg_temp.fails54(format('select pos.swap_partner_decide(%L, true)', sw)), 'hanya rekan yang boleh menyetujui');
  reset role;
  perform set_config('request.jwt.claim.sub', u_b::text, true); set local role authenticated;
  perform pos.swap_partner_decide(sw, true);
  reset role;
  perform pg_temp.ok54((select status from shift_swap_requests where id = sw) = 'pending_manager', 'setelah rekan setuju menunggu manajer');
  perform set_config('request.jwt.claim.sub', u_a::text, true); set local role authenticated;
  perform pg_temp.ok54(pg_temp.fails54(format('select pos.swap_manager_decide(%L, true)', sw)), 'karyawan tidak boleh memutuskan sebagai manajer');
  reset role;
  perform set_config('request.jwt.claim.sub', u_mgr::text, true); set local role authenticated;
  perform pos.swap_manager_decide(sw, true);
  reset role;
  perform pg_temp.ok54((select start_time is null from schedule_overrides where employee_id = e_a and work_date = d1), 'pengaju libur di harinya');
  perform pg_temp.ok54((select start_time = '10:00' from schedule_overrides where employee_id = e_a and work_date = d2), 'pengaju mengambil jam rekan');
  perform pg_temp.ok54((select start_time = '08:00' from schedule_overrides where employee_id = e_b and work_date = d1), 'rekan mengambil jam pengaju');
  perform set_config('request.jwt.claim.sub', u_a::text, true); set local role authenticated;
  perform pg_temp.ok54((select swapped and start_time = '10:00' from pos.staff_schedule(d2, d2)), 'jadwal sendiri memuat pengecualian');
  perform pg_temp.ok54((select start_time is null and swapped from pos.staff_schedule(d1, d1)), 'jadwal hari yang diserahkan libur');
  perform pg_temp.ok54((select count(*) from pos.staff_payslips()) = 0, 'slip gaji: belum ada yang dibayar');
  reset role;

  -- manajer: cukup rekan
  perform set_config('request.jwt.claim.sub', u_mgr::text, true); set local role authenticated;
  sw_m := pos.swap_request_create(e_e, d3, d4);
  reset role;
  perform set_config('request.jwt.claim.sub', u_e::text, true); set local role authenticated;
  perform pos.swap_partner_decide(sw_m, true);
  reset role;
  perform pg_temp.ok54((select status from shift_swap_requests where id = sw_m) = 'approved', 'tukar shift manajer langsung disetujui setelah rekan setuju');
  perform pg_temp.ok54((select start_time = '11:00' from schedule_overrides where employee_id = e_mgr and work_date = d4), 'jadwal manajer berubah');

  -- akses langsung tabel
  perform set_config('request.jwt.claim.sub', u_b::text, true); set local role authenticated;
  perform pg_temp.ok54((select count(*) from pos.leave_requests) = 0 and (select count(*) from pos.advance_requests) = 0, 'karyawan tidak membaca tabel pengajuan langsung');
  perform pg_temp.ok54(pg_temp.fails54(format('insert into pos.leave_requests(org_id, employee_id, kind, start_date, end_date, reason) values (%L, %L, ''leave'', current_date, current_date, ''x'')', o1, e_b)), 'tidak bisa menulis langsung');
  reset role;

  delete from employees where id in (e_own, e_mgr, e_a, e_b, e_c, e_d, e_e);
  delete from org_members where user_id in (u_own, u_mgr, u_a, u_b, u_c, u_d, u_e);
end $$;
