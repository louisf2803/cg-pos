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
  dev uuid := gen_random_uuid();
  emp uuid := gen_random_uuid();
  bank uuid;
begin
  insert into auth.users(id, email) values (adm, 'adm-recon128@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin');

  select id into out1 from outlets where org_id = o1 limit 1;
  select id into pm from payment_methods where org_id = o1 and kind in ('gateway', 'noncash') limit 1;

  -- Siapkan shift dan baris rekonsiliasi uji (sebagai pemilik basis data; admin tidak menulis tabel ini langsung)
  insert into devices(id, org_id, outlet_id, code, name) values (dev, o1, out1, 'Z9', 'Perangkat Uji Rekon');
  insert into employees(id, org_id, name, role) values (emp, o1, 'Kasir Uji Rekon', 'cashier');
  insert into shifts(id, org_id, outlet_id, device_id, cashier_id, opened_at, status) values (sh1, o1, out1, dev, emp, now(), 'open');
  select id into bank from accounts where org_id = o1 and system_key = 'bank_main';
  v_num := pos.next_doc_number(o1, 'REC', 0);
  insert into reconciliations (
    id, org_id, outlet_id, shift_id, method_id, number, expected_amount, status
  ) values (
    r1, o1, out1, sh1, pm, 'REC-' || lpad(v_num::text, 6, '0'), 100000, 'unreconciled'
  );

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

  -- 3. Eksekusi rekonsiliasi dengan biaya gateway (actual 99300, fee 700 -> selisih 0)
  res := pos.save_noncash_reconciliation(r1, out1, sh1, pm::text, 99300, 700, null, 'Uji rekonsiliasi gateway');
  perform pg_temp.ok128((res->>'status') = 'reconciled', 'status terekonsiliasi');
  perform pg_temp.ok128((res->>'difference')::numeric = 0, 'selisih seimbang dengan fee gateway');
  perform pg_temp.ok128(res->>'journal_id' is not null, 'jurnal rekonsiliasi terbentuk');

  -- 4. Validasi: nilai negatif, sudah direkonsiliasi, baris tak dikenal
  perform pg_temp.ok128(pg_temp.fails128(format('select pos.save_noncash_reconciliation(%L, %L, null, %L, -500, 0)', r1, out1, pm::text)), 'nominal aktual negatif harus ditolak');
  perform pg_temp.ok128(pg_temp.fails128(format('select pos.save_noncash_reconciliation(%L, %L, null, %L, 1000, 0)', r1, out1, pm::text)), 'rekonsiliasi dua kali ditolak');
  perform pg_temp.ok128(pg_temp.fails128(format('select pos.save_noncash_reconciliation(%L, %L, null, %L, 1000, 0)', gen_random_uuid(), out1, pm::text)), 'baris tak dikenal ditolak');
  perform pg_temp.ok128((select count(*) from journal_entries where source_type = 'reconciliation' and source_id = r1) = 1, 'tepat satu jurnal');
  reset role;
  -- 5. Bersihkan data uji (jurnal terposting tidak bisa dihapus; sengaja dibiarkan)
  delete from reconciliations where id = r1;
  delete from shifts where id = sh1;
  delete from employees where id = emp;
  delete from devices where id = dev;
  update outlet_settings set auto_reconcile_noncash = false where outlet_id = out1;
  delete from org_members where org_id = o1 and user_id = adm;
  delete from auth.users where id = adm;
end $$;
