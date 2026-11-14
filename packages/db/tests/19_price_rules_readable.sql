-- Aturan harga (migrasi 0140): anggota organisasi (termasuk kasir) boleh MEMBACA harga kanal dan harga waktu; org lain tidak; menulis tetap hanya pengelola.
create or replace function pg_temp.ok_prr(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1'); kopi uuid := ctx('kopi'); o2 uuid;
  adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); ok boolean;
begin
  insert into auth.users(id, email) values (adm, 'adm-prr@x'), (cash, 'cash-prr@x'), (stranger, 'stranger-prr@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  insert into channel_prices(org_id, product_id, channel, price) values (o1, kopi, 'gofood', 27000);
  insert into time_prices(org_id, product_id, days, start_time, end_time, price) values (o1, kopi, array[1,2,3]::smallint[], '15:00', '17:00', 15000);

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok_prr((select count(*) from pos.channel_prices where org_id = o1) = 1, 'kasir membaca harga kanal');
  perform pg_temp.ok_prr((select count(*) from pos.time_prices where org_id = o1) = 1, 'kasir membaca harga waktu');
  begin insert into pos.channel_prices(org_id, product_id, channel, price) values (o1, kopi, 'grabfood', 1); ok := false; exception when others then ok := true; end;
  perform pg_temp.ok_prr(ok, 'kasir tidak boleh menulis harga kanal');
  begin update pos.time_prices set price = 1 where org_id = o1; ok := (select price from pos.time_prices where org_id = o1 limit 1) = 15000; exception when others then ok := true; end;
  perform pg_temp.ok_prr(ok, 'kasir tidak boleh mengubah harga waktu');
  reset role;

  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok_prr((select count(*) from pos.channel_prices where org_id = o1) = 0, 'org lain tidak membaca harga kanal');
    perform pg_temp.ok_prr((select count(*) from pos.time_prices where org_id = o1) = 0, 'org lain tidak membaca harga waktu');
    reset role;
  end if;

  set local role anon;
  begin perform 1 from pos.channel_prices; ok := false; exception when insufficient_privilege then ok := true; end;
  reset role;
  perform pg_temp.ok_prr(ok, 'anon tertutup dari harga kanal');

  delete from channel_prices where org_id = o1 and product_id = kopi;
  delete from time_prices where org_id = o1 and product_id = kopi;
end $$;
