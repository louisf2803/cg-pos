-- Informasi bisnis, rekening bank, grup, dan logo outlet (migrasi 0123): kolom tersimpan, tabel grup dibatasi pengelola, anon tertutup.
create or replace function pg_temp.ok_obg(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1'); out1 uuid := ctx('out1');
  adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); g uuid; ok boolean;
begin
  insert into auth.users(id, email) values (adm, 'adm-obg@x'), (cash, 'cash-obg@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, cash, 'cashier');

  -- kolom baru tersimpan pada outlet
  update outlets set email = 'toko@contoh.id', tax_id_number = '01.234.567.8-901.000', business_type = 'Kedai kopi', outlet_group = 'Kota',
    logo_url = 'https://contoh.id/logo.png', bank_name = 'BCA', bank_account_number = '1234567890', bank_account_name = 'PT Contoh' where id = out1;
  perform pg_temp.ok_obg((select bank_name || bank_account_number || outlet_group from outlets where id = out1) = 'BCA1234567890Kota', 'kolom bank dan grup tersimpan');
  update outlets set email = null, tax_id_number = null, business_type = null, outlet_group = null, logo_url = null,
    bank_name = null, bank_account_number = null, bank_account_name = null where id = out1;

  -- grup outlet: pengelola boleh, kasir tidak, anon tidak
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  insert into pos.outlet_groups(org_id, name) values (o1, 'Cabang Kota') returning id into g;
  perform pg_temp.ok_obg((select count(*) from pos.outlet_groups where org_id = o1) = 1, 'pengelola membuat grup');
  reset role;

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok_obg((select count(*) from pos.outlet_groups where org_id = o1) = 0, 'kasir tidak melihat grup');
  begin insert into pos.outlet_groups(org_id, name) values (o1, 'Curang'); ok := false; exception when others then ok := true; end;
  perform pg_temp.ok_obg(ok, 'kasir tidak boleh membuat grup');
  reset role;

  set local role anon;
  begin perform 1 from pos.outlet_groups; ok := false; exception when insufficient_privilege then ok := true; end;
  reset role;
  perform pg_temp.ok_obg(ok, 'anon tertutup dari grup outlet');

  delete from pos.outlet_groups where id = g;
end $$;
