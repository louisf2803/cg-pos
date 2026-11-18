-- staff_account_check (0156): hanya pengelola; mengembalikan user_id tertaut atau null.
create or replace function pg_temp.ok56(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails56(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;
do $$
declare o1 uuid := ctx('o1'); u_mgr uuid := gen_random_uuid(); u_cash uuid := gen_random_uuid(); u_lnk uuid := gen_random_uuid();
  e_t uuid := gen_random_uuid(); e_l uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (u_mgr, 'mgr-sc@x'), (u_cash, 'cash-sc@x'), (u_lnk, 'lnk-sc@x');
  insert into org_members(org_id, user_id, role) values (o1, u_mgr, 'manager'), (o1, u_cash, 'cashier');
  insert into employees(id, org_id, name, role) values (e_t, o1, 'Target SC', 'cashier');
  insert into employees(id, org_id, name, role, user_id) values (e_l, o1, 'Tertaut SC', 'cashier', u_lnk);
  perform set_config('request.jwt.claim.sub', u_cash::text, true); set local role authenticated;
  perform pg_temp.ok56(pg_temp.fails56(format('select pos.staff_account_check(%L)', e_t)), 'kasir tidak boleh');
  reset role;
  perform set_config('request.jwt.claim.sub', u_mgr::text, true); set local role authenticated;
  perform pg_temp.ok56(pos.staff_account_check(e_t) is null, 'belum tertaut: null');
  perform pg_temp.ok56(pos.staff_account_check(e_l) = u_lnk, 'tertaut: user_id');
  perform pg_temp.ok56(pg_temp.fails56(format('select pos.staff_account_check(%L)', gen_random_uuid())), 'karyawan tidak ada');
  reset role;
  delete from employees where id in (e_t, e_l);
  delete from org_members where user_id in (u_mgr, u_cash);
end $$;
