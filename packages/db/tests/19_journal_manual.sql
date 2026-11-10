-- Jurnal manual (migrasi 0017): seimbang, hanya pemilik/admin, idempoten, saldo awal, pembalik, laporan tetap cocok.
create or replace function pg_temp.ok6(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails6(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); mgr uuid := gen_random_uuid();
  kas uuid; modal uuid; beban uuid; hdr uuid; j1 uuid := gen_random_uuid(); j2 uuid := gen_random_uuid(); r jsonb; rv jsonb; n1 text;
  d0 numeric; k0 numeric; tb_before numeric; tb_after numeric;
begin
  insert into auth.users(id, email) values (adm, 'adm-jrn@x'), (mgr, 'mgr-jrn@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, mgr, 'manager');
  kas := pos.account_id(o1, 'cash_main'); modal := pos.account_id(o1, 'opening_balance_equity'); beban := pos.account_id(o1, 'cash_out_expense');
  select id into hdr from accounts where org_id = o1 and kind = 'header' limit 1;
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into d0, k0 from journal_lines where org_id = o1;

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;

  -- saldo awal: kas Rp 1.000.000 lawan saldo awal ekuitas
  r := pos.journal_manual_post(j1, o1, current_date, 'Saldo awal kas', 'opening', jsonb_build_array(
    jsonb_build_object('account_id', kas, 'debit', 1000000, 'memo', 'Kas awal'), jsonb_build_object('account_id', modal, 'credit', 1000000)));
  n1 := r->>'number';
  perform pg_temp.ok6(n1 like 'OB-%' and (r->>'total')::numeric = 1000000, 'saldo awal dibuat: ' || r::text);
  perform pg_temp.ok6((select status from journal_entries where id = (r->>'id')::uuid) = 'posted' and (select source_type from journal_entries where id = (r->>'id')::uuid) = 'opening', 'terposting, jenis opening');
  r := pos.journal_manual_post(j1, o1, current_date, 'Saldo awal kas', 'opening', '[]'::jsonb);
  perform pg_temp.ok6((r->>'already')::boolean and (select count(*) from journal_entries where org_id = o1 and source_key = 'manual:' || j1) = 1, 'ulang dengan id sama idempoten');

  -- penolakan
  perform pg_temp.ok6(pg_temp.fails6(format('select pos.journal_manual_post(%L,%L,current_date,%L,%L,%L::jsonb)', gen_random_uuid(), o1, 'tidak seimbang', 'manual',
    jsonb_build_array(jsonb_build_object('account_id', kas, 'debit', 100), jsonb_build_object('account_id', beban, 'credit', 90)))), 'tidak seimbang ditolak');
  perform pg_temp.ok6(pg_temp.fails6(format('select pos.journal_manual_post(%L,%L,current_date,%L,%L,%L::jsonb)', gen_random_uuid(), o1, 'akun induk', 'manual',
    jsonb_build_array(jsonb_build_object('account_id', hdr, 'debit', 100), jsonb_build_object('account_id', beban, 'credit', 100)))), 'akun header ditolak');
  perform pg_temp.ok6(pg_temp.fails6(format('select pos.journal_manual_post(%L,%L,current_date,%L,%L,%L::jsonb)', gen_random_uuid(), o1, 'dua sisi', 'manual',
    jsonb_build_array(jsonb_build_object('account_id', kas, 'debit', 100, 'credit', 100), jsonb_build_object('account_id', beban, 'credit', 0)))), 'dua sisi dalam satu baris ditolak');
  perform pg_temp.ok6(pg_temp.fails6(format('select pos.journal_manual_post(%L,%L,current_date,%L,%L,%L::jsonb)', gen_random_uuid(), o1, 'satu baris', 'manual',
    jsonb_build_array(jsonb_build_object('account_id', kas, 'debit', 100)))), 'satu baris ditolak');
  perform pg_temp.ok6(pg_temp.fails6(format('select pos.journal_manual_post(%L,%L,current_date,%L,%L,%L::jsonb)', gen_random_uuid(), o1, '', 'manual',
    jsonb_build_array(jsonb_build_object('account_id', kas, 'debit', 100), jsonb_build_object('account_id', beban, 'credit', 100)))), 'tanpa keterangan ditolak');
  perform pg_temp.ok6(pg_temp.fails6(format('select pos.journal_manual_post(%L,%L,current_date,%L,%L,%L::jsonb)', gen_random_uuid(), o1, 'sen', 'manual',
    jsonb_build_array(jsonb_build_object('account_id', kas, 'debit', 100.005), jsonb_build_object('account_id', beban, 'credit', 100.005)))), 'lebih dari 2 desimal ditolak');

  -- jurnal manual biasa: beban kas keluar Rp 50.000
  r := pos.journal_manual_post(j2, o1, current_date, 'Beban listrik', 'manual', jsonb_build_array(
    jsonb_build_object('account_id', beban, 'debit', 50000), jsonb_build_object('account_id', kas, 'credit', 50000, 'memo', 'bayar tunai')));
  perform pg_temp.ok6((r->>'number') like 'JU-%', 'jurnal umum JU-: ' || r::text);

  -- hak akses: manajer tidak boleh
  reset role;
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pg_temp.ok6(pg_temp.fails6(format('select pos.journal_manual_post(%L,%L,current_date,%L,%L,%L::jsonb)', gen_random_uuid(), o1, 'curang', 'manual',
    jsonb_build_array(jsonb_build_object('account_id', kas, 'debit', 100), jsonb_build_object('account_id', beban, 'credit', 100)))), 'manajer tidak boleh membuat jurnal manual');
  perform pg_temp.ok6(pg_temp.fails6(format('select pos.journal_reverse(%L, null, null)', (select id from journal_entries where org_id = o1 and source_key = 'manual:' || j2))), 'manajer tidak boleh membalik');
  perform pg_temp.ok6(pg_temp.fails6(format('insert into journal_entries(org_id, number, entry_date, description) values (%L,%L,current_date,%L)', o1, 'X-1', 'langsung')), 'tulis langsung jurnal ditolak');
  reset role;

  -- pembalik: jurnal 2 dibalik; asli voided; saldo laporan kembali; tidak bisa dibalik dua kali; bukan jurnal manual ditolak
  select coalesce(sum(debit - credit), 0) into tb_before from journal_lines jl join journal_entries e on e.id = jl.entry_id where jl.account_id = beban and e.status in ('posted', 'voided');
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  rv := pos.journal_reverse((select id from journal_entries where org_id = o1 and source_key = 'manual:' || j2), current_date, 'salah catat');
  perform pg_temp.ok6((rv->>'number') like 'REV-%', 'pembalik REV-: ' || rv::text);
  perform pg_temp.ok6((select status from journal_entries where org_id = o1 and source_key = 'manual:' || j2) = 'voided', 'jurnal asli menjadi voided');
  perform pg_temp.ok6((select reverses_entry_id from journal_entries where id = (rv->>'id')::uuid) = (select id from journal_entries where org_id = o1 and source_key = 'manual:' || j2), 'pembalik menunjuk jurnal asli');
  rv := pos.journal_reverse((select id from journal_entries where org_id = o1 and source_key = 'manual:' || j2), current_date, null);
  perform pg_temp.ok6(coalesce((rv->>'already')::boolean, false), 'membalik dua kali tidak membuat pembalik baru');
  perform pg_temp.ok6(pg_temp.fails6(format('select pos.journal_reverse(%L, null, null)', (select id from journal_entries where org_id = o1 and source_type = 'sale' limit 1))), 'jurnal penjualan tidak bisa dibalik dari sini');
  perform pg_temp.ok6(pg_temp.fails6(format('select pos.journal_reverse(%L, null, null)', (rv->>'id'))), 'pembalik tidak bisa dibalik');
  reset role;
  select coalesce(sum(debit - credit), 0) into tb_after from journal_lines jl join journal_entries e on e.id = jl.entry_id where jl.account_id = beban and e.status in ('posted', 'voided');
  perform pg_temp.ok6(tb_after = tb_before - 50000, 'beban kembali setelah dibalik');
  -- neraca saldo seimbang untuk seluruh org
  perform pg_temp.ok6((select sum(debit) from pos.report_trial_balance(o1, current_date - 30, current_date + 1)) = (select sum(credit) from pos.report_trial_balance(o1, current_date - 30, current_date + 1)), 'neraca saldo seimbang');
  perform pg_temp.ok6((select sum(debit) - sum(credit) from journal_lines where org_id = o1) = d0 - k0, 'jumlah debit-kredit seluruh buku tetap seimbang');
end $$;
