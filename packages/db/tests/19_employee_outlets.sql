-- Outlet karyawan (migrasi 0157): hanya pengelola yang boleh mengubah; minimal satu outlet untuk kasir; outlet org lain ditolak;
-- rekan tukar shift dibatasi pada outlet yang sama.
create or replace function pg_temp.ok57(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails57(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;
do $$
declare o1 uuid := ctx('o1'); out1 uuid := ctx('out1'); out2 uuid := gen_random_uuid();
  u_mgr uuid := gen_random_uuid(); u_cash uuid := gen_random_uuid(); u_b uuid := gen_random_uuid(); u_c uuid := gen_random_uuid();
  e_a uuid := gen_random_uuid(); e_b uuid := gen_random_uuid(); e_c uuid := gen_random_uuid(); e_mgr uuid := gen_random_uuid(); j jsonb;
begin
  insert into outlets(id, org_id, code, name) values (out2, o1, 'ZZ7', 'Cabang Dua OE');
  insert into auth.users(id, email) values (u_mgr, 'mgr-oe@x'), (u_cash, 'cash-oe@x'), (u_b, 'b-oe@x'), (u_c, 'c-oe@x');
  insert into org_members(org_id, user_id, role) values (o1, u_mgr, 'manager'), (o1, u_cash, 'cashier'), (o1, u_b, 'cashier'), (o1, u_c, 'cashier');
  insert into employees(id, org_id, name, role, user_id) values (e_a, o1, 'A OE', 'cashier', u_cash), (e_b, o1, 'B OE', 'cashier', u_b), (e_c, o1, 'C OE', 'cashier', u_c), (e_mgr, o1, 'M OE', 'manager', u_mgr);
  insert into employee_outlets(employee_id, outlet_id, org_id) values (e_a, out1, o1), (e_b, out1, o1), (e_c, out2, o1);

  perform set_config('request.jwt.claim.sub', u_cash::text, true); set local role authenticated;
  perform pg_temp.ok57(pg_temp.fails57(format('select pos.employee_outlets_set(%L, array[%L]::uuid[])', e_a, out2)), 'kasir tidak boleh mengubah outlet');
  perform pg_temp.ok57((select count(*) from pos.employee_outlets_list()) = 0, 'kasir tidak melihat peta outlet');
  j := pos.staff_requests();
  perform pg_temp.ok57(jsonb_path_exists(j, ('$.teammates[*] ? (@.id == "' || e_b || '")')::jsonpath), 'rekan satu outlet muncul');
  perform pg_temp.ok57(not jsonb_path_exists(j, ('$.teammates[*] ? (@.id == "' || e_c || '")')::jsonpath), 'rekan beda outlet tidak muncul');
  perform pg_temp.ok57(pg_temp.fails57(format('select pos.swap_request_create(%L, current_date + 3, current_date + 4)', e_c)), 'tukar shift beda outlet ditolak');
  reset role;

  perform set_config('request.jwt.claim.sub', u_mgr::text, true); set local role authenticated;
  perform pg_temp.ok57(pg_temp.fails57(format('select pos.employee_outlets_set(%L, array[]::uuid[])', e_a)), 'kasir wajib punya outlet');
  perform pg_temp.ok57(pg_temp.fails57(format('select pos.employee_outlets_set(%L, array[%L]::uuid[])', e_a, gen_random_uuid())), 'outlet tidak dikenal ditolak');
  perform pos.employee_outlets_set(e_a, array[out2]);
  perform pg_temp.ok57((select count(*) from pos.employee_outlets_list() where employee_id = e_a and outlet_id = out2) = 1, 'outlet pindah');
  perform pg_temp.ok57((select count(*) from pos.employee_outlets_list() where employee_id = e_a and outlet_id = out1) = 0, 'outlet lama dilepas');
  perform pos.employee_outlets_set(e_a, array[out1, out2]);
  perform pg_temp.ok57((select count(*) from pos.employee_outlets_list() where employee_id = e_a) = 2, 'boleh dua outlet');
  perform pos.employee_outlets_set(e_mgr, array[]::uuid[]);
  reset role;

  delete from employees where id in (e_a, e_b, e_c, e_mgr);
  delete from org_members where user_id in (u_mgr, u_cash, u_b, u_c);
  delete from outlets where id = out2;
end $$;
