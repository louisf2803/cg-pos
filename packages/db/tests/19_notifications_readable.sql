-- Notifikasi karyawan (migrasi 0145): semua anggota org membaca, hanya pengelola menulis, org lain tertutup.
create or replace function pg_temp.ok_nt(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails_nt(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid;
  mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (mgr, 'mgr-nt@x'), (cash, 'cash-nt@x'), (stranger, 'stranger-nt@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  insert into pos.employee_notifications(org_id, title, body) values (o1, 'Uji-NT-0145', 'isi');
  reset role;

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok_nt((select count(*) from pos.employee_notifications where org_id = o1 and title = 'Uji-NT-0145') = 1, 'kasir membaca');
  perform pg_temp.ok_nt(pg_temp.fails_nt(format('insert into pos.employee_notifications(org_id, title, body) values (%L, ''x'', ''y'')', o1)), 'kasir tidak boleh menulis');
  reset role;

  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok_nt((select count(*) from pos.employee_notifications where org_id = o1) = 0, 'org lain tidak membaca');
    reset role;
  end if;
  delete from pos.employee_notifications where org_id = o1;
end $$;
