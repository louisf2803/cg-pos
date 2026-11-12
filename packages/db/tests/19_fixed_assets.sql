-- Aset tetap (migrasi 0040): perolehan dengan jurnal seimbang dan idempoten, penyusutan garis lurus per bulan (idempoten, bulan terakhir
-- menghabiskan sisa, tidak melewati umur), pelepasan aset dengan laba/rugi, dan hanya pemilik/admin yang boleh; org lain tidak boleh.
create or replace function pg_temp.ok40(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails40(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;
create or replace function pg_temp.bal40(je uuid) returns boolean language sql as $$
  select coalesce(sum(debit), 0) = coalesce(sum(credit), 0) and count(*) >= 2 from pos.journal_lines where entry_id = je
$$;

do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); a3 uuid := gen_random_uuid();
  acct_cash uuid; acct_exp uuid; m0 date := date_trunc('month', current_date)::date; r jsonb; v_je uuid; n int;
begin
  insert into auth.users(id, email) values (adm, 'adm-fa@x'), (cash, 'cash-fa@x'), (stranger, 'stranger-fa@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  select id into acct_cash from accounts where org_id = o1 and category = 'cash_bank' and kind = 'detail' limit 1;
  select id into acct_exp from accounts where org_id = o1 and category = 'expense' and kind = 'detail' limit 1;

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  -- perolehan: aset 12 juta, sisa 1,2 juta, umur 12 bulan, diperoleh 3 bulan lalu, dibayar kas
  r := pos.fixed_asset_acquire(a1, o1, 'Mesin Espresso', (m0 - interval '3 months')::date, 12000000, 1200000, 12, null, acct_cash);
  perform pg_temp.ok40((r->>'journal_id') is not null and pg_temp.bal40((r->>'journal_id')::uuid), 'perolehan membuat jurnal seimbang');
  perform pg_temp.ok40((pos.fixed_asset_acquire(a1, o1, 'Mesin Espresso', (m0 - interval '3 months')::date, 12000000, 1200000, 12, null, acct_cash)->>'already')::boolean, 'perolehan idempoten menurut id');
  perform pg_temp.ok40((select count(*) from pos.journal_entries where source_type = 'fixed_asset' and source_id = a1) = 1, 'tidak ada jurnal ganda');
  -- validasi
  perform pg_temp.ok40(pg_temp.fails40(format('select pos.fixed_asset_acquire(%L, %L, ''X'', current_date, 1000, 1000, 12, null, null)', gen_random_uuid(), o1), 'invalid salvage'), 'sisa >= harga ditolak');
  perform pg_temp.ok40(pg_temp.fails40(format('select pos.fixed_asset_acquire(%L, %L, ''X'', current_date, 1000, 0, 0, null, null)', gen_random_uuid(), o1), 'invalid life'), 'umur 0 ditolak');
  perform pg_temp.ok40(pg_temp.fails40(format('select pos.fixed_asset_acquire(%L, %L, ''X'', current_date, -5, 0, 12, null, null)', gen_random_uuid(), o1), 'invalid cost'), 'harga negatif ditolak');
  perform pg_temp.ok40(pg_temp.fails40(format('select pos.fixed_asset_acquire(%L, %L, ''  '', current_date, 1000, 0, 12, null, null)', gen_random_uuid(), o1), 'name required (max 120)'), 'nama kosong ditolak');
  -- aset kecil untuk menguji sisa di bulan terakhir: 1000,01 selama 2 bulan
  perform pos.fixed_asset_acquire(a2, o1, 'Rak Kecil', (m0 - interval '3 months')::date, 1000.01, 0, 2, null, null);

  -- penyusutan bulan m-2 (bulan setelah perolehan): 900000 untuk a1 dan 500,01 untuk a2
  r := pos.fixed_asset_depreciate(o1, (m0 - interval '2 months')::date);
  perform pg_temp.ok40((r->>'assets')::int = 2 and (r->>'total')::numeric = 900000 + 500.01, 'penyusutan bulan pertama untuk dua aset');
  perform pg_temp.ok40((pos.fixed_asset_depreciate(o1, (m0 - interval '2 months')::date)->>'assets')::int = 0, 'penyusutan idempoten per bulan');
  perform pg_temp.ok40(pg_temp.fails40(format('select pos.fixed_asset_depreciate(%L, %L)', o1, (m0 + interval '1 month')::date), 'period in the future'), 'bulan depan ditolak');
  perform pos.fixed_asset_depreciate(o1, (m0 - interval '1 month')::date);
  perform pos.fixed_asset_depreciate(o1, m0);
  perform pg_temp.ok40((select sum(amount) from pos.asset_depreciations where asset_id = a2) = 1000.01, 'bulan terakhir menghabiskan sisa (total = harga)');
  perform pg_temp.ok40((select count(*) from pos.asset_depreciations where asset_id = a2) = 2, 'aset umur 2 bulan hanya disusutkan 2 kali');
  perform pg_temp.ok40((select count(*) from pos.asset_depreciations where asset_id = a1) = 3 and (select sum(amount) from pos.asset_depreciations where asset_id = a1) = 2700000, 'a1 tiga bulan x 900000');
  perform pg_temp.ok40((select bool_and(pg_temp.bal40(journal_entry_id)) from pos.asset_depreciations), 'semua jurnal penyusutan seimbang');
  -- aset yang diperoleh di bulan yang sama belum disusutkan
  perform pos.fixed_asset_acquire(a3, o1, 'Meja Baru', m0, 5000000, 0, 10, null, null);
  perform pg_temp.ok40((pos.fixed_asset_depreciate(o1, m0)->>'assets')::int = 0, 'aset diperoleh bulan ini belum disusutkan');

  -- pelepasan a1: dijual 9 juta, akumulasi 2,7 juta, harga 12 juta -> rugi 300000
  perform pg_temp.ok40(pg_temp.fails40(format('select pos.fixed_asset_dispose(%L, current_date, 9000000, %L, null)', a1, acct_cash), 'gain/loss account required'), 'selisih tanpa akun laba/rugi ditolak');
  perform pg_temp.ok40(pg_temp.fails40(format('select pos.fixed_asset_dispose(%L, current_date, 9000000, null, %L)', a1, acct_exp), 'cash account required'), 'hasil jual tanpa akun kas ditolak');
  r := pos.fixed_asset_dispose(a1, current_date, 9000000, acct_cash, acct_exp);
  perform pg_temp.ok40((r->>'gain_loss')::numeric = -300000 and pg_temp.bal40((r->>'journal_id')::uuid), 'pelepasan: rugi 300000 dan jurnal seimbang');
  perform pg_temp.ok40((select status from pos.fixed_assets where id = a1) = 'disposed', 'status jadi disposed');
  perform pg_temp.ok40(pg_temp.fails40(format('select pos.fixed_asset_dispose(%L, current_date, 0, null, null)', a1), 'asset already disposed'), 'dilepas dua kali ditolak');
  perform pg_temp.ok40((pos.fixed_asset_depreciate(o1, m0)->>'assets')::int = 0, 'aset yang sudah dilepas tidak disusutkan');
  reset role;

  -- kasir tidak boleh
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok40(pg_temp.fails40(format('select pos.fixed_asset_acquire(%L, %L, ''X'', current_date, 1000, 0, 12, null, null)', gen_random_uuid(), o1), 'not allowed'), 'kasir tidak boleh mencatat aset');
  perform pg_temp.ok40(pg_temp.fails40(format('select pos.fixed_asset_depreciate(%L, current_date)', o1), 'not allowed'), 'kasir tidak boleh menyusutkan');
  reset role;
  -- org lain tidak boleh
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok40(pg_temp.fails40(format('select pos.fixed_asset_depreciate(%L, current_date)', o1), 'not allowed'), 'org lain tidak boleh menyusutkan');
    perform pg_temp.ok40(pg_temp.fails40(format('select pos.fixed_asset_dispose(%L, current_date, 0, null, null)', a3), 'not allowed'), 'org lain tidak boleh melepas aset');
    reset role;
  end if;
end $$;
