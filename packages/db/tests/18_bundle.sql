-- Paket (bundle) ditulis klien dengan akun manajer: produk kind=bundle + bundle_items; komponen terpotong saat terjual.
do $$
declare mgr uuid := gen_random_uuid(); o1 uuid := ctx('o1'); b uuid := gen_random_uuid(); pcs uuid;
        n int; q numeric; cashier uuid := gen_random_uuid(); ok boolean;
begin
  insert into auth.users(id,email) values (mgr,'mgr-bundle@x'), (cashier,'cashier-bundle@x');
  insert into org_members(org_id,user_id,role) values (o1, mgr, 'manager'), (o1, cashier, 'cashier');
  select id into pcs from units where org_id = o1 and name = 'porsi';

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  insert into products(id,org_id,kind,name,base_unit_id,is_sellable,show_in_menu,track_stock) values (b, o1, 'bundle', 'Paket Hemat', pcs, true, true, false);
  insert into product_units(org_id,product_id,unit_id,is_base,conversion,price) values (o1, b, pcs, true, 1, 22000);
  insert into bundle_items(bundle_id,product_id,org_id,qty) values (b, ctx('kopi'), o1, 1), (b, ctx('air'), o1, 2);
  delete from bundle_items where bundle_id = b and product_id = ctx('air');      -- ganti isi: hapus lalu isi ulang
  insert into bundle_items(bundle_id,product_id,org_id,qty) values (b, ctx('air'), o1, 1);
  reset role;

  select count(*) into n from bundle_items where bundle_id = b;
  if n <> 2 then raise exception 'ASSERT GAGAL: isi paket %', n; end if;
  -- dua paket terjual -> 2 kopi dan 2 air mineral berkurang (kopi memakai resep: 18 gram biji kopi per cangkir)
  select qty_sum into q from (select sum(component_qty) qty_sum from pos.sale_components(b, 2) where component_id = ctx('air')) s;
  if q <> 2 then raise exception 'ASSERT GAGAL: komponen air % (harus 2)', q; end if;
  select qty_sum into q from (select sum(component_qty) qty_sum from pos.sale_components(b, 2) where component_id = ctx('bean')) s;
  if q <> 36 then raise exception 'ASSERT GAGAL: komponen biji kopi % (harus 36)', q; end if;

  -- kasir tidak boleh membuat/mengubah paket
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  set local role authenticated;
  begin insert into bundle_items(bundle_id,product_id,org_id,qty) values (b, ctx('kopi'), o1, 5); ok := false;
  exception when others then ok := true; end;
  reset role;
  if not ok then raise exception 'ASSERT GAGAL: kasir mengubah isi paket'; end if;
end $$;
