-- Jenis jurnal 'transfer' (migrasi 0032): nomor PS-, sourceType 'transfer', bisa dibalik seperti manual/opening,
-- jenis lama (manual/opening) tetap berjalan seperti semula.
create or replace function pg_temp.ok7(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails7(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid();
  kas uuid; bank uuid; j1 uuid := gen_random_uuid(); r jsonb; rv jsonb;
begin
  insert into auth.users(id, email) values (adm, 'adm-trf@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin');
  kas := pos.account_id(o1, 'cash_main'); bank := pos.account_id(o1, 'bank_main');

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;

  -- pindah saldo kas -> bank Rp 200.000, jenis 'transfer'
  r := pos.journal_manual_post(j1, o1, current_date, 'Pindah saldo ke bank', 'transfer', jsonb_build_array(
    jsonb_build_object('account_id', bank, 'debit', 200000), jsonb_build_object('account_id', kas, 'credit', 200000)));
  perform pg_temp.ok7((r->>'number') like 'PS-%' and (r->>'total')::numeric = 200000, 'transfer dibuat dengan nomor PS-: ' || r::text);
  perform pg_temp.ok7((select source_type from journal_entries where id = (r->>'id')::uuid) = 'transfer', 'source_type tersimpan sebagai transfer');

  -- ulang dengan id sama -> idempoten, bukan jurnal baru
  r := pos.journal_manual_post(j1, o1, current_date, 'Pindah saldo ke bank', 'transfer', '[]'::jsonb);
  perform pg_temp.ok7((r->>'already')::boolean and (select count(*) from journal_entries where org_id = o1 and source_key = 'manual:' || j1) = 1, 'ulang dengan id sama idempoten');

  -- bisa dibalik seperti jurnal manual/opening
  rv := pos.journal_reverse((select id from journal_entries where org_id = o1 and source_key = 'manual:' || j1), current_date, 'salah pindah');
  perform pg_temp.ok7((rv->>'number') like 'REV-%', 'transfer bisa dibalik: ' || rv::text);
  perform pg_temp.ok7((select status from journal_entries where org_id = o1 and source_key = 'manual:' || j1) = 'voided', 'jurnal transfer asli menjadi voided setelah dibalik');

  -- kind tak dikenal tetap ditolak (bukan daftar putih terbuka)
  perform pg_temp.ok7(pg_temp.fails7(format('select pos.journal_manual_post(%L,%L,current_date,%L,%L,%L::jsonb)', gen_random_uuid(), o1, 'jenis aneh', 'mutasi',
    jsonb_build_array(jsonb_build_object('account_id', kas, 'debit', 100), jsonb_build_object('account_id', bank, 'credit', 100)))), 'kind tak dikenal tetap ditolak');

  reset role;
end $$;
