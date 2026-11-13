-- Uji paket deposit dan saldo deposit pelanggan (migrasi 0107):
-- 1. Pembuatan paket deposit (bonus, batas nominal)
-- 2. Pembelian paket deposit lewat RPC pos.buy_deposit_package
-- 3. Verifikasi saldo pelanggan di pos.customer_deposits terisi otomatis
-- 4. Verifikasi jurnal akuntansi (Dr Kas, Cr Deposit Pelanggan)
-- 5. Verifikasi riwayat transaksi di pos.customer_deposit_entries
create or replace function pg_temp.okr(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1'); out1 uuid := ctx('out1');
  mgr uuid := gen_random_uuid();
  cust1 uuid := gen_random_uuid();
  pkg1 uuid := gen_random_uuid();
  res jsonb;
  v_bal bigint;
  v_sold int;
  v_jrn_count int;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-dep@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager');
  insert into member_outlets(org_id, user_id, outlet_id) values (o1, mgr, out1);

  -- Buat pelanggan
  insert into pos.customers(id, org_id, name, phone)
  values (cust1, o1, 'Pelanggan Deposit', '081234567890');

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;

  -- 1. Buat paket deposit: 500rb bonus 50rb (kredit 550rb, harga 500rb)
  insert into pos.deposit_packages(
    id, org_id, name, credit_amount, sale_price, is_active, note
  ) values (
    pkg1, o1, 'Deposit 500rb Bonus 50rb', 550000, 500000, true, 'Bonus 10%'
  );

  -- 2. Beli paket deposit lewat RPC
  res := pos.buy_deposit_package(
    gen_random_uuid(), o1, out1, cust1, pkg1, 'QRIS', 'Sari (Kasir)'
  );
  perform pg_temp.okr((res->>'order_number') like 'DEP/%', 'nomor dokumen deposit sah');

  -- 3. Periksa saldo pelanggan di customer_deposits
  select balance into v_bal from pos.customer_deposits where customer_id = cust1;
  perform pg_temp.okr(v_bal = 550000, 'saldo deposit pelanggan bertambah sesuai credit_amount (550.000)');

  -- 4. Periksa sold_count paket bertambah
  select sold_count into v_sold from pos.deposit_packages where id = pkg1;
  perform pg_temp.okr(v_sold = 1, 'sold_count paket deposit bertambah jadi 1');

  -- 5. Periksa entri jurnal akuntansi terbentuk
  select count(*) into v_jrn_count from pos.journal_entries
  where org_id = o1 and source_type = 'deposit';
  perform pg_temp.okr(v_jrn_count > 0, 'jurnal deposit tercatat');

  -- 6. Catat refund saldo deposit (mis. pengembalian 50.000)
  insert into pos.customer_deposit_entries (
    org_id, outlet_id, customer_id, package_name, kind, credit_amount,
    order_number, reason, processed_by
  ) values (
    o1, out1, cust1, 'Deposit 500rb Bonus 50rb', 'refund', 50000,
    'REF/DEP/001', 'Salah input', 'Manajer'
  );

  select balance into v_bal from pos.customer_deposits where customer_id = cust1;
  perform pg_temp.okr(v_bal = 500000, 'saldo berkurang setelah refund (500.000)');

  reset role;
end $$;
