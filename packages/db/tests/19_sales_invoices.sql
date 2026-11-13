-- Faktur penjualan (migrasi 0129): faktur dengan uang muka membuat jurnal seimbang dan idempoten, pembayaran bertahap mengubah status
-- open -> partially_paid -> paid, pembayaran tidak boleh melebihi sisa, validasi, hanya pengelola yang boleh, org lain tidak boleh.
create or replace function pg_temp.ok29(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails29(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;
create or replace function pg_temp.bal29(je uuid) returns boolean language sql as $$
  select coalesce(sum(debit), 0) = coalesce(sum(credit), 0) and count(*) >= 2 from pos.journal_lines where entry_id = je
$$;

do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  i1 uuid := gen_random_uuid(); i2 uuid := gen_random_uuid(); p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); p3 uuid := gen_random_uuid();
  acct uuid; cust uuid := gen_random_uuid(); r jsonb; inv pos.sales_invoices%rowtype;
  lines jsonb := '[{"name":"Kopi 1 kg","qty":10,"unit_price":100000},{"name":"Gula","qty":5,"unit_price":20000}]';
begin
  insert into auth.users(id, email) values (adm, 'adm-si@x'), (cash, 'cash-si@x'), (stranger, 'stranger-si@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  select id into acct from accounts where org_id = o1 and category = 'cash_bank' and kind = 'detail' and is_active limit 1;
  insert into customers(id, org_id, name) values (cust, o1, 'PT Pelanggan Faktur');

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  -- faktur: subtotal 1.100.000, diskon 100.000, pajak 110.000 => total 1.110.000; uang muka 300.000, termin 14 hari
  r := pos.sales_invoice_create(i1, o1, cust, date '2026-11-01', 14, 100000, 110000, 300000, acct, 'Pesanan kantor', lines);
  perform pg_temp.ok29((r->>'total')::numeric = 1110000 and (r->>'number') like 'FJ-%', 'total dan nomor faktur');
  perform pg_temp.ok29(pg_temp.bal29((r->>'journal_id')::uuid), 'jurnal faktur seimbang');
  select * into inv from pos.sales_invoices where id = i1;
  perform pg_temp.ok29(inv.status = 'partially_paid' and inv.paid_total = 300000 and inv.due_date = date '2026-11-15', 'status sebagian, jatuh tempo = tanggal + termin');
  perform pg_temp.ok29((select count(*) from pos.sales_invoice_payments where invoice_id = i1 and is_down_payment and amount = 300000) = 1, 'uang muka tercatat sebagai pembayaran pertama');
  perform pg_temp.ok29((pos.sales_invoice_create(i1, o1, cust, date '2026-11-01', 14, 100000, 110000, 300000, acct, null, lines)->>'already')::boolean, 'faktur idempoten menurut id');
  perform pg_temp.ok29((select count(*) from pos.journal_entries where source_type = 'sales_invoice' and source_id = i1) = 1, 'tidak ada jurnal ganda');
  -- pembayaran bertahap
  r := pos.sales_invoice_pay(p1, i1, acct, date '2026-11-05', 500000, 'Cicilan 1');
  perform pg_temp.ok29(r->>'status' = 'partially_paid' and (r->>'paid_total')::numeric = 800000 and pg_temp.bal29((r->>'journal_id')::uuid), 'cicilan 1: masih sebagian, jurnal seimbang');
  perform pg_temp.ok29((pos.sales_invoice_pay(p1, i1, acct, date '2026-11-05', 500000, 'Cicilan 1')->>'already')::boolean, 'pembayaran idempoten menurut id');
  perform pg_temp.ok29((select paid_total from pos.sales_invoices where id = i1) = 800000, 'pembayaran ulang tidak menggandakan');
  perform pg_temp.ok29(pg_temp.fails29(format('select pos.sales_invoice_pay(%L, %L, %L, current_date, 310001, null)', p2, i1, acct), 'amount exceeds outstanding'), 'melebihi sisa ditolak');
  r := pos.sales_invoice_pay(p3, i1, acct, date '2026-11-10', 310000, 'Pelunasan');
  perform pg_temp.ok29(r->>'status' = 'paid' and (select status from pos.sales_invoices where id = i1) = 'paid', 'lunas');
  -- tanpa uang muka: open
  r := pos.sales_invoice_create(i2, o1, null, null, 0, 0, 0, 0, null, null, '[{"name":"Jasa","qty":1,"unit_price":50000}]');
  perform pg_temp.ok29((select status from pos.sales_invoices where id = i2) = 'open', 'tanpa uang muka: belum dibayar');
  -- validasi
  perform pg_temp.ok29(pg_temp.fails29(format('select pos.sales_invoice_create(%L, %L, null, null, 0, 0, 0, 0, null, null, ''[]'')', gen_random_uuid(), o1), 'invoice has no lines'), 'tanpa baris ditolak');
  perform pg_temp.ok29(pg_temp.fails29(format('select pos.sales_invoice_create(%L, %L, null, null, 0, 0, 0, 10, null, null, ''[{"name":"X","qty":1,"unit_price":100}]'')', gen_random_uuid(), o1), 'down payment account required'), 'uang muka tanpa akun ditolak');
  perform pg_temp.ok29(pg_temp.fails29(format('select pos.sales_invoice_create(%L, %L, null, null, 0, 0, 0, 500, %L, null, ''[{"name":"X","qty":1,"unit_price":100}]'')', gen_random_uuid(), o1, acct), 'down payment exceeds invoice total'), 'uang muka melebihi total ditolak');
  perform pg_temp.ok29(pg_temp.fails29(format('select pos.sales_invoice_create(%L, %L, null, null, 0, 500, 0, 0, null, null, ''[{"name":"X","qty":1,"unit_price":100}]'')', gen_random_uuid(), o1), 'discount is larger than the invoice'), 'diskon melebihi subtotal ditolak');
  perform pg_temp.ok29(pg_temp.fails29(format('select pos.sales_invoice_create(%L, %L, null, null, 0, 0, 0, 0, null, null, ''[{"name":"X","qty":0,"unit_price":100}]'')', gen_random_uuid(), o1), 'invalid line'), 'qty 0 ditolak');
  reset role;
  -- kasir tidak boleh
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok29(pg_temp.fails29(format('select pos.sales_invoice_create(%L, %L, null, null, 0, 0, 0, 0, null, null, ''[{"name":"X","qty":1,"unit_price":100}]'')', gen_random_uuid(), o1), 'not allowed'), 'kasir tidak boleh membuat faktur');
  perform pg_temp.ok29(pg_temp.fails29(format('select pos.sales_invoice_pay(%L, %L, %L, current_date, 100, null)', gen_random_uuid(), i2, acct), 'not allowed'), 'kasir tidak boleh menerima pembayaran');
  reset role;
  -- org lain tidak boleh
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok29(pg_temp.fails29(format('select pos.sales_invoice_pay(%L, %L, %L, current_date, 100, null)', gen_random_uuid(), i2, acct), 'not allowed'), 'org lain tidak boleh membayar faktur');
    perform pg_temp.ok29(pg_temp.fails29(format('select pos.sales_invoice_create(%L, %L, null, null, 0, 0, 0, 0, null, null, ''[{"name":"X","qty":1,"unit_price":100}]'')', gen_random_uuid(), o1), 'not allowed'), 'org lain tidak boleh membuat faktur');
    reset role;
  end if;
  -- bersihkan
  -- jurnal terposting tidak bisa dihapus (sengaja); cukup bersihkan faktur dan pelanggan uji
  delete from pos.sales_invoices where org_id = o1;
  delete from pos.doc_sequences where org_id = o1 and scope = 'SINV';
  delete from pos.customers where id = cust;
end $$;
