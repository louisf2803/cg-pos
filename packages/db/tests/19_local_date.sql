-- Migrasi 0044: fungsi aset tetap dan tagihan rutin memakai tanggal Asia/Jakarta (bukan current_date UTC).
create or replace function pg_temp.ok44(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  acct_cash uuid; acct_exp uuid; jkt date := (now() at time zone 'Asia/Jakarta')::date; r jsonb; n int;
begin
  insert into auth.users(id, email) values (adm, 'adm-ld@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin');
  select id into acct_cash from accounts where org_id = o1 and category = 'cash_bank' and kind = 'detail' limit 1;
  select id into acct_exp from accounts where org_id = o1 and category = 'expense' and kind = 'detail' limit 1;
  -- struktur: ketiga fungsi tidak lagi memakai current_date
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'pos' and p.proname in ('fixed_asset_depreciate', 'fixed_asset_dispose', 'recurring_bill_pay') and pg_get_functiondef(p.oid) like '%current_date%';
  perform pg_temp.ok44(n = 0, 'fungsi tidak memakai current_date');
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'pos' and p.proname in ('fixed_asset_depreciate', 'fixed_asset_dispose', 'recurring_bill_pay') and pg_get_functiondef(p.oid) like '%Asia/Jakarta%';
  perform pg_temp.ok44(n = 3, 'ketiga fungsi memakai Asia/Jakarta');
  -- perilaku: tanggal hari ini lokal diterima
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  perform pos.fixed_asset_acquire(a, o1, 'Rak', jkt - 5, 1000000, 0, 10, null, null);
  r := pos.fixed_asset_dispose(a, jkt, 0, null, acct_exp);
  perform pg_temp.ok44((r->>'gain_loss')::numeric = -1000000, 'pelepasan bertanggal hari ini lokal diterima');
  insert into pos.recurring_bills(id, org_id, name, amount, frequency, next_due, expense_account_id) values (b, o1, 'Sewa LD', 100000, 'monthly', jkt - 40, acct_exp);
  r := pos.recurring_bill_pay(b, acct_cash, jkt);
  perform pg_temp.ok44(r->>'journal_id' is not null, 'bayar tagihan bertanggal hari ini lokal diterima');
  reset role;
end $$;
