-- Laporan transaksi gateway (migrasi 0133): hanya pengelola, rentang divalidasi, tanpa transaksi mengembalikan larik kosong, org lain ditolak.
create or replace function pg_temp.ok33(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails33(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;
do $$
declare o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid; r jsonb;
begin
  insert into auth.users(id, email) values (adm, 'adm-gr@x'), (cash, 'cash-gr@x'), (stranger, 'stranger-gr@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  r := pos.gateway_transactions_report(o1, now() - interval '30 days', now());
  perform pg_temp.ok33(jsonb_typeof(r) = 'array', 'mengembalikan larik');
  perform pg_temp.ok33(pg_temp.fails33(format('select pos.gateway_transactions_report(%L, now(), now() - interval ''1 day'')', o1), 'invalid range'), 'rentang terbalik ditolak');
  reset role;
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok33(pg_temp.fails33(format('select pos.gateway_transactions_report(%L, now() - interval ''1 day'', now())', o1), 'not allowed'), 'kasir tidak boleh');
  reset role;
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok33(pg_temp.fails33(format('select pos.gateway_transactions_report(%L, now() - interval ''1 day'', now())', o1), 'not allowed'), 'org lain ditolak');
    reset role;
  end if;
end $$;
