-- Harga kanal ojek online dan harga waktu (migrasi 0135): simpan/ubah/hapus, aturan waktu tidak boleh tumpang tindih, validasi, kasir dan org lain ditolak.
create or replace function pg_temp.ok35(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails35(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;
do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  prod uuid; t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid(); t3 uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (adm, 'adm-cp@x'), (cash, 'cash-cp@x'), (stranger, 'stranger-cp@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  select id into prod from products where org_id = o1 and deleted_at is null limit 1;

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  perform pos.channel_price_save(o1, prod, 'gofood', 25000);
  perform pos.channel_price_save(o1, prod, 'gofood', 27000);
  perform pg_temp.ok35((select count(*) from pos.channel_prices where org_id = o1 and product_id = prod) = 1 and (select price from pos.channel_prices where org_id = o1 and product_id = prod and channel = 'gofood') = 27000, 'simpan ulang mengubah harga, tidak menggandakan');
  perform pos.channel_price_save(o1, prod, 'grabfood', 28000);
  perform pg_temp.ok35((select count(*) from pos.channel_prices where org_id = o1 and product_id = prod) = 2, 'dua kanal');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.channel_price_save(%L, %L, ''tokopedia'', 1000)', o1, prod), 'invalid channel'), 'kanal tak dikenal ditolak');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.channel_price_save(%L, %L, ''gofood'', -1)', o1, prod), 'invalid price'), 'harga negatif ditolak');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.channel_price_save(%L, %L, ''gofood'', 1000)', o1, gen_random_uuid()), 'product not found'), 'produk tak dikenal ditolak');
  perform pos.channel_price_delete(o1, prod, 'grabfood');
  perform pg_temp.ok35((select count(*) from pos.channel_prices where org_id = o1 and product_id = prod) = 1, 'harga kanal dihapus');
  -- harga waktu: Senin-Jumat 15:00-17:00 harga 20000
  perform pos.time_price_save(t1, o1, prod, array[1,2,3,4,5]::smallint[], time '15:00', time '17:00', 20000, true);
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.time_price_save(%L, %L, %L, array[5,6]::smallint[], time ''16:00'', time ''18:00'', 18000, true)', t2, o1, prod), 'overlapping rule'), 'tumpang tindih ditolak');
  perform pos.time_price_save(t2, o1, prod, array[5,6]::smallint[], time '17:00', time '19:00', 18000, true);
  perform pos.time_price_save(t3, o1, prod, array[6,7]::smallint[], time '17:30', time '18:00', 15000, false);
  perform pg_temp.ok35((select count(*) from pos.time_prices where org_id = o1 and product_id = prod) = 3, 'yang nonaktif tidak dihitung tumpang tindih');
  perform pos.time_price_save(t1, o1, prod, array[1,2,3,4,5]::smallint[], time '15:00', time '16:30', 21000, true);
  perform pg_temp.ok35((select price from pos.time_prices where id = t1) = 21000 and (select end_time from pos.time_prices where id = t1) = time '16:30', 'aturan bisa diubah (id sama)');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.time_price_save(%L, %L, %L, array[8]::smallint[], time ''10:00'', time ''11:00'', 1000, true)', gen_random_uuid(), o1, prod), 'invalid days'), 'hari 8 ditolak');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.time_price_save(%L, %L, %L, array[1,1]::smallint[], time ''10:00'', time ''11:00'', 1000, true)', gen_random_uuid(), o1, prod), 'invalid days'), 'hari ganda ditolak');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.time_price_save(%L, %L, %L, array[1]::smallint[], time ''12:00'', time ''11:00'', 1000, true)', gen_random_uuid(), o1, prod), 'invalid time'), 'jam terbalik ditolak');
  perform pg_temp.ok35((pos.time_price_delete(t3)->>'deleted')::boolean, 'aturan dihapus');
  reset role;
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.channel_price_save(%L, %L, ''gofood'', 1000)', o1, prod), 'not allowed'), 'kasir tidak boleh');
  perform pg_temp.ok35(pg_temp.fails35(format('select pos.time_price_delete(%L)', t1), 'not allowed'), 'kasir tidak boleh menghapus aturan');
  reset role;
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok35(pg_temp.fails35(format('select pos.channel_price_save(%L, %L, ''gofood'', 1000)', o1, prod), 'not allowed'), 'org lain tidak boleh');
    reset role;
  end if;
  delete from pos.channel_prices where org_id = o1;
  delete from pos.time_prices where org_id = o1;
end $$;
