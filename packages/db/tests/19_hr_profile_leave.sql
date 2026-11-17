-- Cuti bersama dan profil kepegawaian (migrasi 0149): hanya pengelola, kasir dan org lain tertutup, tanggal unik per org, anon tertutup.
create or replace function pg_temp.ok49(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails49(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid; mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); ok boolean;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-hp@x'), (cash, 'cash-hp@x'), (stranger, 'stranger-hp@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  insert into pos.collective_leaves(org_id, leave_date, description) values (o1, date '2026-12-24', 'Cuti bersama Natal');
  perform pg_temp.ok49(pg_temp.fails49(format('insert into pos.collective_leaves(org_id, leave_date, description) values (%L, date ''2026-12-24'', ''ganda'')', o1)), 'tanggal unik per org');
  insert into pos.employee_profiles(employee_id, org_id, nik, bank_name, bank_account_number, bank_account_holder, employment_type)
  values (ctx('emp'), o1, '7371012345670001', 'BCA', '1234567890', 'Pemilik Usaha', 'full_time');
  perform pg_temp.ok49(pg_temp.fails49(format('insert into pos.employee_profiles(employee_id, org_id, employment_type) values (%L, %L, ''bukan'')', ctx('emp'), o1)), 'tipe pekerjaan dibatasi');
  reset role;

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok49((select count(*) from pos.employee_profiles) = 0 and (select count(*) from pos.collective_leaves) = 0, 'kasir tidak membaca data pribadi dan cuti bersama');
  perform pg_temp.ok49(pg_temp.fails49(format('insert into pos.collective_leaves(org_id, leave_date, description) values (%L, date ''2026-12-25'', ''x'')', o1)), 'kasir tidak boleh menulis');
  reset role;

  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok49((select count(*) from pos.employee_profiles where org_id = o1) = 0, 'org lain tidak membaca profil');
    reset role;
  end if;
  set local role anon;
  begin perform 1 from pos.employee_profiles; ok := false; exception when insufficient_privilege then ok := true; end;
  reset role;
  perform pg_temp.ok49(ok, 'anon tertutup');
  delete from pos.employee_profiles where org_id = o1;
  delete from pos.collective_leaves where org_id = o1;
end $$;
