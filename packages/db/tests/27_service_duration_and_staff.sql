-- Test 27: Service duration and staff (migrasi 0121)
create or replace function pg_temp.ok27(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1');
  u_owner uuid := ctx('u_owner');
  u_cashier uuid := ctx('u_cashier');
  v_prod uuid := gen_random_uuid();
  v_emp uuid := ctx('emp');
begin
  perform set_config('request.jwt.claim.sub', u_owner::text, true);

  -- 1. Tambah produk jasa dengan durasi dan staf
  insert into pos.products (id, org_id, kind, name, price, service_duration_min, service_staff_ids, is_sellable, show_in_menu, track_stock, is_active)
  values (v_prod, o1, 'service', 'Pijat Refleksi', 85000, 60, array[v_emp], true, true, false, true);

  perform pg_temp.ok27(
    exists (select 1 from pos.products where id = v_prod and service_duration_min = 60),
    'durasi jasa tersimpan'
  );

  -- 2. Tautkan staf ke tabel product_service_staff
  insert into pos.product_service_staff (org_id, product_id, employee_id)
  values (o1, v_prod, v_emp);

  perform pg_temp.ok27(
    exists (select 1 from pos.product_service_staff where product_id = v_prod and employee_id = v_emp),
    'relasi product_service_staff tersimpan'
  );

  -- 3. Kasir biasa tidak boleh menghapus relasi staf
  perform set_config('request.jwt.claim.sub', u_cashier::text, true);
  begin
    delete from pos.product_service_staff where product_id = v_prod;
    raise exception 'kasir seharusnya ditolak';
  exception when others then
    perform pg_temp.ok27(true, 'kasir tidak dapat menghapus relasi staf');
  end;

  -- 4. Bersihkan data uji
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  delete from pos.product_service_staff where product_id = v_prod;
  delete from pos.products where id = v_prod;
end $$;
