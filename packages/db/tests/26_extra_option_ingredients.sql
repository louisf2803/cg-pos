-- Test 26: Extra Option Ingredients (migrasi 0120)
create or replace function pg_temp.ok26(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1');
  u_owner uuid := ctx('u_owner');
  u_cashier uuid := ctx('u_cashier');
  v_grp uuid := gen_random_uuid();
  v_opt uuid := gen_random_uuid();
  v_ing uuid := ctx('kopi');
  v_unit uuid := ctx('pu_kopi');
begin
  perform set_config('request.jwt.claim.sub', u_owner::text, true);

  -- 1. Buat grup ekstra dan opsi
  insert into pos.extra_groups (id, org_id, name, is_required, select_mode)
  values (v_grp, o1, 'Topping Uji', false, 'single');

  insert into pos.extra_options (id, org_id, group_id, name, price, sort)
  values (v_opt, o1, v_grp, 'Biji Kopi Tambahan', 5000, 1);

  -- 2. Tautkan opsi ke bahan baku
  insert into pos.extra_option_ingredients (option_id, ingredient_id, org_id, qty, unit_id)
  values (v_opt, v_ing, o1, 15, v_unit);

  perform pg_temp.ok26(
    exists (select 1 from pos.extra_option_ingredients where option_id = v_opt and ingredient_id = v_ing),
    'tautan opsi ekstra ke bahan baku tersimpan'
  );

  -- 3. Kasir tidak boleh menghapus tautan bahan baku
  perform set_config('request.jwt.claim.sub', u_cashier::text, true);
  begin
    delete from pos.extra_option_ingredients where option_id = v_opt;
    raise exception 'kasir seharusnya ditolak';
  exception when others then
    perform pg_temp.ok26(true, 'kasir tidak dapat menghapus tautan');
  end;

  -- 4. Owner menghapus tautan
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  delete from pos.extra_option_ingredients where option_id = v_opt;
  perform pg_temp.ok26(
    not exists (select 1 from pos.extra_option_ingredients where option_id = v_opt),
    'tautan bahan baku terhapus'
  );

  delete from pos.extra_options where id = v_opt;
  delete from pos.extra_groups where id = v_grp;
end $$;

