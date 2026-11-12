-- Tagihan rutin dan persetujuan (migrasi 0041): bayar membuat jurnal seimbang, memajukan jatuh tempo, idempoten per jatuh tempo;
-- persetujuan: pengaju tidak boleh menyetujui sendiri kecuali pemilik, keputusan final, kasir dan org lain tidak melihat/menulis.
create or replace function pg_temp.ok41(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails41(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return want is null or sqlerrm = want;
end $$;
create or replace function pg_temp.bal41(je uuid) returns boolean language sql as $$
  select coalesce(sum(debit), 0) = coalesce(sum(credit), 0) and count(*) >= 2 from pos.journal_lines where entry_id = je
$$;

do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); mgr2 uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  acct_cash uuid; acct_exp uuid; b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); r jsonb; req uuid := gen_random_uuid(); req2 uuid := gen_random_uuid(); req3 uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (adm, 'adm-rb@x'), (mgr, 'mgr-rb@x'), (mgr2, 'mgr2-rb@x'), (cash, 'cash-rb@x'), (stranger, 'stranger-rb@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, mgr, 'manager'), (o1, mgr2, 'manager'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  select id into acct_cash from accounts where org_id = o1 and category = 'cash_bank' and kind = 'detail' limit 1;
  select id into acct_exp from accounts where org_id = o1 and category = 'expense' and kind = 'detail' limit 1;

  -- ===== tagihan rutin =====
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  insert into pos.recurring_bills(id, org_id, name, amount, frequency, next_due, expense_account_id) values (b1, o1, 'Sewa Ruko', 5000000, 'monthly', date '2026-01-31', acct_exp);
  insert into pos.recurring_bills(id, org_id, name, amount, frequency, next_due, expense_account_id) values (b2, o1, 'Langganan Musik', 150000, 'weekly', date '2026-02-01', acct_exp);
  perform pg_temp.ok41((select count(*) from pos.recurring_bills) = 2, 'manajer membaca dan menulis tagihan rutin');
  perform pg_temp.ok41(pg_temp.fails41(format('insert into pos.recurring_bills(org_id, name, amount, frequency, next_due, expense_account_id) values (%L, ''X'', 0, ''monthly'', current_date, %L)', o1, acct_exp), null), 'jumlah 0 ditolak');
  perform pg_temp.ok41(pg_temp.fails41(format('insert into pos.recurring_bills(org_id, name, amount, frequency, next_due, expense_account_id) values (%L, ''X'', 10, ''harian'', current_date, %L)', o1, acct_exp), null), 'frekuensi tidak dikenal ditolak');
  perform pg_temp.ok41(pg_temp.fails41(format('select pos.recurring_bill_pay(%L, %L, current_date)', b1, acct_cash), 'not allowed'), 'manajer (bukan admin) tidak boleh membayar');
  reset role;

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  r := pos.recurring_bill_pay(b1, acct_cash, date '2026-02-02');
  perform pg_temp.ok41((r->>'paid_due')::date = date '2026-01-31' and (r->>'next_due')::date = date '2026-02-28', 'bulanan: 31 Jan maju ke 28 Feb');
  perform pg_temp.ok41(pg_temp.bal41((r->>'journal_id')::uuid), 'jurnal tagihan seimbang');
  perform pg_temp.ok41((select count(*) from pos.recurring_bill_runs where bill_id = b1) = 1, 'riwayat tercatat sekali');
  r := pos.recurring_bill_pay(b2, acct_cash, date '2026-02-03');
  perform pg_temp.ok41((r->>'next_due')::date = date '2026-02-08', 'mingguan: +7 hari');
  perform pg_temp.ok41(pg_temp.fails41(format('select pos.recurring_bill_pay(%L, %L, current_date + 1)', b1, acct_cash), 'invalid date'), 'tanggal bayar di masa depan ditolak');
  perform pg_temp.ok41(pg_temp.fails41(format('select pos.recurring_bill_pay(%L, null, current_date)', b1), 'account not found or not postable'), 'tanpa akun bayar ditolak');
  update pos.recurring_bills set is_active = false where id = b2;
  perform pg_temp.ok41(pg_temp.fails41(format('select pos.recurring_bill_pay(%L, %L, current_date)', b2, acct_cash), 'bill inactive'), 'tagihan nonaktif tidak bisa dibayar');
  perform pg_temp.ok41((select count(*) from pos.journal_entries where source_type = 'recurring_bill' and source_id = b1) = 1, 'tidak ada jurnal ganda');
  reset role;

  -- ===== persetujuan =====
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pos.approval_request(req, o1, 'purchase', 'Beli mesin', 12000000, 'purchase_order', null, 'untuk bar');
  perform pg_temp.ok41((pos.approval_request(req, o1, 'purchase', 'Beli mesin', 12000000, null, null, null)->>'already')::boolean, 'ajuan idempoten menurut id');
  perform pg_temp.ok41(pg_temp.fails41(format('select pos.approval_request(%L, %L, ''lain'', ''X'', 1, null, null, null)', gen_random_uuid(), o1), null), 'tipe tidak dikenal ditolak');
  perform pg_temp.ok41(pg_temp.fails41(format('select pos.approval_decide(%L, true, null)', req), 'cannot decide own request'), 'pengaju tidak boleh menyetujui sendiri');
  reset role;
  perform set_config('request.jwt.claim.sub', mgr2::text, true);
  set local role authenticated;
  r := pos.approval_decide(req, true, 'oke');
  perform pg_temp.ok41(r->>'status' = 'approved' and (select decided_by from pos.approval_requests where id = req) = mgr2, 'manajer lain menyetujui');
  perform pg_temp.ok41(pg_temp.fails41(format('select pos.approval_decide(%L, false, null)', req), 'request already decided'), 'keputusan final');
  perform pg_temp.ok41(pg_temp.fails41(format('update pos.approval_requests set status = ''approved'' where id = %L', req2), null), 'klien tidak boleh menulis tabel langsung');
  reset role;
  -- admin (bukan pemilik) juga tidak boleh menyetujui ajuannya sendiri; pembatalan oleh pengaju
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  perform pos.approval_request(req2, o1, 'finance', 'Transfer', 500000, null, null, null);
  perform pg_temp.ok41(pg_temp.fails41(format('select pos.approval_decide(%L, true, null)', req2), 'cannot decide own request'), 'admin tidak boleh menyetujui ajuan sendiri');
  perform pg_temp.ok41(pos.approval_cancel(req2)->>'status' = 'cancelled', 'pengaju membatalkan ajuannya');
  perform pg_temp.ok41(pg_temp.fails41(format('select pos.approval_cancel(%L)', req2), 'request already decided'), 'tidak bisa dibatalkan dua kali');
  reset role;
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pos.approval_request(req3, o1, 'finance', 'Biaya', 1000, null, null, null);
  reset role;
  perform set_config('request.jwt.claim.sub', mgr2::text, true);
  set local role authenticated;
  perform pg_temp.ok41(pg_temp.fails41(format('select pos.approval_cancel(%L)', req3), 'not allowed'), 'manajer lain tidak boleh membatalkan ajuan orang lain');
  reset role;

  -- kasir dan org lain
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok41((select count(*) from pos.recurring_bills) = 0 and (select count(*) from pos.approval_requests) = 0, 'kasir tidak melihat tagihan dan persetujuan');
  perform pg_temp.ok41(pg_temp.fails41(format('select pos.approval_request(%L, %L, ''purchase'', ''X'', 1, null, null, null)', gen_random_uuid(), o1), 'not allowed'), 'kasir tidak boleh mengajukan');
  reset role;
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok41((select count(*) from pos.recurring_bills) = 0 and (select count(*) from pos.approval_requests) = 0 and (select count(*) from pos.recurring_bill_runs) = 0, 'org lain tidak melihat apa pun');
    perform pg_temp.ok41(pg_temp.fails41(format('select pos.approval_decide(%L, true, null)', req3), 'not allowed'), 'org lain tidak boleh memutuskan');
    perform pg_temp.ok41(pg_temp.fails41(format('select pos.recurring_bill_pay(%L, %L, current_date)', b1, acct_cash), 'not allowed'), 'org lain tidak boleh membayar tagihan');
    reset role;
  end if;
end $$;
