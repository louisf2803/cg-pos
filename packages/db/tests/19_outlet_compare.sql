-- Perbandingan antar outlet (migrasi 0131): hanya pengelola, rentang divalidasi, setiap outlet aktif tampil (juga yang tanpa penjualan), org lain ditolak.
create or replace function pg_temp.ok31(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails31(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;

do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  r jsonb; n_outlets int;
begin
  insert into auth.users(id, email) values (adm, 'adm-oc@x'), (cash, 'cash-oc@x'), (stranger, 'stranger-oc@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  select count(*) into n_outlets from outlets where org_id = o1 and is_active;

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  r := pos.outlet_sales_compare(o1, now() - interval '30 days', now());
  perform pg_temp.ok31(jsonb_typeof(r) = 'array' and jsonb_array_length(r) = n_outlets, 'setiap outlet aktif tampil');
  perform pg_temp.ok31((select bool_and((e->>'sales')::numeric >= 0 and (e->>'orders')::int >= 0 and jsonb_typeof(e->'top') = 'array') from jsonb_array_elements(r) e), 'bentuk baris benar');
  perform pg_temp.ok31(pg_temp.fails31(format('select pos.outlet_sales_compare(%L, now(), now() - interval ''1 day'')', o1), 'invalid range'), 'rentang terbalik ditolak');
  perform pg_temp.ok31(pg_temp.fails31(format('select pos.outlet_sales_compare(%L, now() - interval ''2000 days'', now())', o1), 'range too long'), 'rentang terlalu panjang ditolak');
  reset role;
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok31(pg_temp.fails31(format('select pos.outlet_sales_compare(%L, now() - interval ''1 day'', now())', o1), 'not allowed'), 'kasir tidak boleh');
  reset role;
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok31(pg_temp.fails31(format('select pos.outlet_sales_compare(%L, now() - interval ''1 day'', now())', o1), 'not allowed'), 'org lain ditolak');
    reset role;
  end if;
end $$;
