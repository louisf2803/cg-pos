-- Tes rekonsiliasi non-tunai & pengaturan outlet (migrasi 0128)
create or replace function pg_temp.ok128(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails128(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1');
  adm uuid := gen_random_uuid();
  out1 uuid;
  pm uuid;
  sh1 uuid := gen_random_uuid();
  r1 uuid := gen_random_uuid();
  res jsonb;
  v_num bigint;
begin
  insert into auth.users(id, email) values (adm, 'adm-recon128@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin');

  select id into out1 from outlets where org_id = o1 limit 1;
  select id into pm from payment_methods where org_id = o1 and kind in ('gateway', 'noncash') limit 1;

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;

  -- 1. Pengaturan outlet auto_reconcile_noncash
  perform pg_temp.ok128(
    (select auto_reconcile_noncash from outlet_settings where outlet_id = out1) is not null,
    'kolom auto_reconcile_noncash ada'
  );

  update outlet_settings set auto_reconcile_noncash = true where outlet_id = out1;
  perform pg_temp.ok128(
    (select auto_reconcile_noncash from outlet_settings where outlet_id = out1) = true,
    'pengaturan auto_reconcile_noncash dapat diaktifkan'
  );

  -- 2. Buat baris rekonsiliasi uji
  v_num := pos.next_doc_number(o1, 'REC', 0);
  insert into reconciliations (
    id, org_id, outlet_id, shift_id, method_id, number, expected_amount, status
  ) values (
    r1, o1, out1, null, pm, 'REC-' || lpad(v_num::text, 6, '0'), 100000, 'unreconciled'
  );

  -- 3. Eksekusi rekonsiliasi dengan biaya gateway (actual 99300, fee 700 -> selisih 0)
  res := pos.save_noncash_reconciliation(r1, out1, null, pm::text, 99300, 700, null, 'Uji rekonsiliasi gateway');
  perform pg_temp.ok128((res->>'status') = 'reconciled', 'status terekonsiliasi');
  perform pg_temp.ok128((res->>'difference')::numeric = 0, 'selisih seimbang dengan fee gateway');
  perform pg_temp.ok128(res->>'journal_id' is not null, 'jurnal rekonsiliasi terbentuk');

  -- 4. Validasi penolakan nilai negatif
  perform pg_temp.ok128(
    pg_temp.fails128(format('select pos.save_noncash_reconciliation(%L, %L, null, %L, -500, 0)', r1, out1, pm::text)),
    'nominal aktual negatif harus ditolak'
  );

  -- 5. Bersihkan data uji
  delete from journal_entries where source_key = 'recon:' || r1;
  delete from reconciliations where id = r1;
  update outlet_settings set auto_reconcile_noncash = false where outlet_id = out1;
  delete from org_members where org_id = o1 and user_id = adm;
  delete from auth.users where id = adm;
end $$;
