-- Akun perantara metode bayar (migrasi 0134): hanya pemilik/admin, hanya metode tunai/non-tunai/gateway, akun harus kas/bank atau piutang,
-- metode tunai wajib akun kas/bank, org lain ditolak. Akun asli dikembalikan di akhir.
create or replace function pg_temp.ok34(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails34(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;
do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  qris uuid; cash uuid; comp uuid; qris_old uuid; cash_old uuid; bank uuid; recv uuid; revenue uuid;
begin
  insert into auth.users(id, email) values (adm, 'adm-pm@x'), (mgr, 'mgr-pm@x'), (stranger, 'stranger-pm@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, mgr, 'manager');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  select id, account_id into qris, qris_old from payment_methods where org_id = o1 and code = 'QRIS';
  select id, account_id into cash, cash_old from payment_methods where org_id = o1 and code = 'CASH';
  select id into comp from payment_methods where org_id = o1 and kind = 'complimentary' limit 1;
  select id into bank from accounts where org_id = o1 and system_key = 'bank_main';
  select id into recv from accounts where org_id = o1 and system_key = 'accounts_receivable';
  select id into revenue from accounts where org_id = o1 and system_key = 'sales_revenue';

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  perform pos.payment_method_set_account(qris, recv);
  perform pg_temp.ok34((select account_id from pos.payment_methods where id = qris) = recv, 'akun QRIS berubah');
  perform pos.payment_method_set_account(cash, bank);
  perform pg_temp.ok34((select account_id from pos.payment_methods where id = cash) = bank, 'metode tunai boleh ke akun bank');
  perform pg_temp.ok34(pg_temp.fails34(format('select pos.payment_method_set_account(%L, %L)', cash, recv), 'cash method needs a cash account'), 'tunai tidak boleh ke piutang');
  perform pg_temp.ok34(pg_temp.fails34(format('select pos.payment_method_set_account(%L, %L)', qris, revenue), 'account category not allowed'), 'akun pendapatan ditolak');
  perform pg_temp.ok34(pg_temp.fails34(format('select pos.payment_method_set_account(%L, %L)', qris, gen_random_uuid()), 'account not found or not postable'), 'akun tak dikenal ditolak');
  if comp is not null then perform pg_temp.ok34(pg_temp.fails34(format('select pos.payment_method_set_account(%L, %L)', comp, bank), 'method kind not configurable'), 'komplimen tidak bisa diatur'); end if;
  perform pg_temp.ok34(pg_temp.fails34(format('select pos.payment_method_set_account(%L, %L)', gen_random_uuid(), bank), 'method not found'), 'metode tak dikenal');
  reset role;
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pg_temp.ok34(pg_temp.fails34(format('select pos.payment_method_set_account(%L, %L)', qris, bank), 'not allowed'), 'manajer tidak boleh');
  reset role;
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok34(pg_temp.fails34(format('select pos.payment_method_set_account(%L, %L)', qris, bank), 'not allowed'), 'org lain ditolak');
    reset role;
  end if;
  update pos.payment_methods set account_id = qris_old where id = qris;
  update pos.payment_methods set account_id = cash_old where id = cash;
end $$;
