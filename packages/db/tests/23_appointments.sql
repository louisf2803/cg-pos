-- Uji reservasi dan appointment dengan kalender (migrasi 0105):
-- 1. Pembuatan jadwal appointment baru
-- 2. Pencegahan bentrok jadwal untuk sumber daya yang sama pada tanggal/jam yang sama
-- 3. Jadwal yang berstatus 'cancelled' tidak memicu bentrok
-- 4. Pengubahan dan pembatalan jadwal
create or replace function pg_temp.okr(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1'); out1 uuid := ctx('out1');
  mgr uuid := gen_random_uuid();
  apt1 uuid; apt2 uuid;
  ok boolean;
  tbl1 uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (mgr, 'mgr-apt@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager');
  insert into member_outlets(org_id, user_id, outlet_id) values (o1, mgr, out1);

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;

  -- 1. Buat reservasi meja pertama: 14:00 - 16:00
  insert into pos.appointments(
    org_id, outlet_id, customer_name, customer_phone, kind, target_id, target_name,
    date, start_time, end_time, start_at, end_at, status, note
  ) values (
    o1, out1, 'Doni Pratama', '08123456789', 'table', tbl1, 'Meja 05',
    '2026-11-20', '14:00', '16:00', '2026-11-20T14:00:00+07:00'::timestamptz, '2026-11-20T16:00:00+07:00'::timestamptz,
    'confirmed', 'Ulang tahun'
  ) returning id into apt1;
  perform pg_temp.okr(apt1 is not null, 'reservasi pertama berhasil dibuat');

  -- 2. Reservasi kedua yang tumpang tindih (15:00 - 17:00) pada meja yang sama harus ditolak
  begin
    insert into pos.appointments(
      org_id, outlet_id, customer_name, customer_phone, kind, target_id, target_name,
      date, start_time, end_time, start_at, end_at, status
    ) values (
      o1, out1, 'Siti Nurhaliza', '08987654321', 'table', tbl1, 'Meja 05',
      '2026-11-20', '15:00', '17:00', '2026-11-20T15:00:00+07:00'::timestamptz, '2026-11-20T17:00:00+07:00'::timestamptz,
      'pending'
    );
    ok := false;
  exception when others then
    ok := true;
  end;
  perform pg_temp.okr(ok, 'reservasi bentrok berhasil ditolak server');

  -- 3. Reservasi pada jam yang bersentuhan pas (16:00 - 18:00) harus berhasil (tidak bentrok)
  insert into pos.appointments(
    org_id, outlet_id, customer_name, customer_phone, kind, target_id, target_name,
    date, start_time, end_time, start_at, end_at, status
  ) values (
    o1, out1, 'Bambang', '08111222333', 'table', tbl1, 'Meja 05',
    '2026-11-20', '16:00', '18:00', '2026-11-20T16:00:00+07:00'::timestamptz, '2026-11-20T18:00:00+07:00'::timestamptz,
    'confirmed'
  ) returning id into apt2;
  perform pg_temp.okr(apt2 is not null, 'reservasi bersambung (ujung waktu sama) diizinkan');

  -- 4. Batalkan reservasi pertama, lalu buat ulang di jam yang sama (14:00 - 16:00)
  update pos.appointments set status = 'cancelled' where id = apt1;
  insert into pos.appointments(
    org_id, outlet_id, customer_name, customer_phone, kind, target_id, target_name,
    date, start_time, end_time, start_at, end_at, status
  ) values (
    o1, out1, 'Rina', '08555666777', 'table', tbl1, 'Meja 05',
    '2026-11-20', '14:00', '16:00', '2026-11-20T14:00:00+07:00'::timestamptz, '2026-11-20T16:00:00+07:00'::timestamptz,
    'confirmed'
  );
  perform pg_temp.okr(true, 'jadwal yang dibatalkan tidak memicu bentrok');

  reset role;
end $$;

