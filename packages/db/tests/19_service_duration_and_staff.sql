-- Durasi dan staf pelaksana produk jasa (migrasi 0121): kolom tersimpan, relasi staf dibatasi pengelola, kasir dan anon ditolak.
create or replace function pg_temp.ok_sds(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1');
  adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid();
  pr uuid := gen_random_uuid(); emp uuid; ok boolean;
begin
  insert into auth.users(id, email) values (adm, 'adm-sds@x'), (cash, 'cash-sds@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, cash, 'cashier');
  insert into employees(org_id, user_id, name, role) values (o1, cash, 'Terapis Uji', 'cashier') returning id into emp;

  insert into products(id, org_id, kind, name, track_stock, service_duration_min, service_staff_ids)
  values (pr, o1, 'service', 'Pijat Refleksi', false, 60, array[emp]);
  perform pg_temp.ok_sds((select service_duration_min from products where id = pr) = 60, 'durasi jasa tersimpan');
  perform pg_temp.ok_sds((select service_staff_ids from products where id = pr) = array[emp], 'daftar staf tersimpan');
  begin update products set service_duration_min = -5 where id = pr; ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ok_sds(ok, 'durasi negatif ditolak');

  -- pengelola mengatur relasi staf
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  insert into pos.product_service_staff(org_id, product_id, employee_id) values (o1, pr, emp);
  perform pg_temp.ok_sds((select count(*) from pos.product_service_staff where product_id = pr) = 1, 'pengelola menautkan staf');
  reset role;

  -- kasir tidak melihat dan tidak boleh mengubah
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok_sds((select count(*) from pos.product_service_staff where product_id = pr) = 0, 'kasir tidak melihat relasi staf');
  delete from pos.product_service_staff where product_id = pr;
  reset role;
  perform pg_temp.ok_sds((select count(*) from pos.product_service_staff where product_id = pr) = 1, 'penghapusan oleh kasir tidak berefek');

  set local role anon;
  begin perform 1 from pos.product_service_staff; ok := false; exception when insufficient_privilege then ok := true; end;
  reset role;
  perform pg_temp.ok_sds(ok, 'anon tertutup dari relasi staf');

  delete from product_service_staff where product_id = pr;
  delete from products where id = pr;
  delete from employees where id = emp;
end $$;
