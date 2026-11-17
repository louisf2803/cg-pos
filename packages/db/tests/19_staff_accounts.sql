-- Akun aplikasi karyawan (migrasi 0153): pengelola menautkan akun ke karyawan, staff_me mengenali karyawan, kasir tidak boleh menautkan,
-- satu akun hanya satu karyawan, akun perangkat ditolak, peran pemilik butuh keanggotaan pemilik.
create or replace function pg_temp.ok53(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails53(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); out1 uuid := ctx('out1'); emp_owner uuid := ctx('emp');
  mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); staff2 uuid := gen_random_uuid(); dev uuid := gen_random_uuid(); newown uuid := gen_random_uuid();
  e_kasir uuid := gen_random_uuid(); e_mgr uuid := gen_random_uuid(); me jsonb; n int;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-sa@x'), (cash, 'cash-sa@x'), (staff, 'Staff-SA@x'), (staff2, 'staff2-sa@x'), (dev, 'dev-sa@x'), (newown, 'own-sa@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cash, 'cashier'), (o1, dev, 'device');
  insert into employees(id, org_id, name, role) values (e_kasir, o1, 'Karyawan Uji', 'cashier'), (e_mgr, o1, 'Manajer Uji', 'manager');
  insert into employee_outlets(employee_id, outlet_id, org_id) values (e_kasir, out1, o1);

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok53(pg_temp.fails53(format('select pos.staff_account_link(%L, ''staff-sa@x'')', e_kasir)), 'kasir tidak boleh menautkan');
  perform pg_temp.ok53(pos.staff_me() is null, 'akun belum ditautkan: staff_me kosong');
  reset role;

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pg_temp.ok53(pos.staff_account_link(e_kasir, '  STAFF-sa@x ') = staff, 'tautan memakai email tanpa memandang huruf besar');
  perform pg_temp.ok53(pg_temp.fails53(format('select pos.staff_account_link(%L, ''tidak-ada@x'')', e_mgr)), 'email tidak dikenal ditolak');
  perform pg_temp.ok53(pg_temp.fails53(format('select pos.staff_account_link(%L, ''staff-sa@x'')', e_mgr)), 'satu akun hanya satu karyawan');
  perform pg_temp.ok53(pg_temp.fails53(format('select pos.staff_account_link(%L, ''dev-sa@x'')', e_mgr)), 'akun perangkat ditolak');
  perform pg_temp.ok53(pg_temp.fails53(format('select pos.staff_account_link(%L, ''own-sa@x'')', emp_owner)), 'karyawan pemilik butuh keanggotaan pemilik');
  perform pg_temp.ok53((select count(*) from pos.staff_account_list() where employee_id = e_kasir and email = 'Staff-SA@x') = 1, 'daftar tautan memuat email');
  perform pos.staff_account_link(e_mgr, 'staff2-sa@x');
  reset role;
  perform pg_temp.ok53((select role from org_members where org_id = o1 and user_id = staff) = 'cashier', 'akun menjadi anggota org (kasir)');
  perform pg_temp.ok53((select role from org_members where org_id = o1 and user_id = staff2) = 'manager', 'karyawan manajer menjadi anggota manajer');

  perform set_config('request.jwt.claim.sub', staff::text, true);
  set local role authenticated;
  me := pos.staff_me();
  perform pg_temp.ok53(me->>'employee_id' = e_kasir::text and me->>'role' = 'cashier' and jsonb_array_length(me->'outlets') = 1, 'staff_me: identitas dan outlet');
  perform pg_temp.ok53(pg_temp.fails53(format('select pos.staff_account_unlink(%L)', e_kasir)), 'karyawan tidak boleh melepas tautan');
  perform pg_temp.ok53((select count(*) from pos.staff_account_list()) = 0, 'karyawan tidak melihat daftar tautan');
  reset role;

  perform set_config('request.jwt.claim.sub', staff2::text, true);
  set local role authenticated;
  perform pg_temp.ok53(jsonb_array_length(pos.staff_me()->'outlets') >= 1, 'manajer tanpa batas outlet melihat semua outlet org');
  reset role;

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pos.staff_account_unlink(e_kasir);
  reset role;
  perform set_config('request.jwt.claim.sub', staff::text, true);
  set local role authenticated;
  perform pg_temp.ok53(pos.staff_me() is null, 'setelah dilepas: staff_me kosong');
  reset role;

  delete from employees where id in (e_kasir, e_mgr);
  delete from org_members where user_id in (staff, staff2);
end $$;
