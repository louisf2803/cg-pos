-- Jadikan Invoice dari kasir (migrasi 0147): kasir (peran cashier) boleh membuat faktur dari pesanan terbukanya sendiri dengan total persis sama,
-- tidak boleh mengarang nominal, tidak boleh untuk pesanan tanpa pelanggan atau yang sudah dibayar sebagian, org lain ditolak, dan fungsi inti tidak bisa dipanggil klien.
create or replace function pg_temp.ok47(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails47(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  cust uuid := gen_random_uuid(); ord uuid := gen_random_uuid(); ord2 uuid := gen_random_uuid(); inv uuid := gen_random_uuid(); r jsonb;
  lines jsonb := '[{"name":"Kopi","qty":2,"unit_price":20000},{"name":"Roti","qty":1,"unit_price":10000}]';
begin
  insert into auth.users(id, email) values (cash, 'cash-oi@x'), (stranger, 'stranger-oi@x');
  insert into org_members(org_id, user_id, role) values (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  insert into customers(id, org_id, name) values (cust, o1, 'PT Faktur Kasir');
  -- pesanan terbuka: subtotal 50.000, pajak 5.000, total 55.000; satu lagi tanpa pelanggan
  insert into orders(id, org_id, outlet_id, device_id, cashier_id, number, order_type, subtotal, tax_total, total, customer_id, opened_at)
  values (ord, o1, ctx('out1'), ctx('dev'), ctx('emp'), 'OI-1', 'takeaway', 50000, 5000, 55000, cust, now()),
         (ord2, o1, ctx('out1'), ctx('dev'), ctx('emp'), 'OI-2', 'takeaway', 50000, 5000, 55000, null, now());

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok47(pg_temp.fails47(format('select pos.sales_invoice_create(%L, %L, %L, null, 14, 0, 5000, 0, null, null, %L::jsonb)', gen_random_uuid(), o1, cust, lines)), 'kasir tidak boleh memakai sales_invoice_create langsung');
  perform pg_temp.ok47(pg_temp.fails47(format('select pos._sales_invoice_create_core(%L, %L, %L, null, 14, 0, 5000, 0, null, null, %L::jsonb)', gen_random_uuid(), o1, cust, lines)), 'fungsi inti tertutup bagi klien');
  perform pg_temp.ok47(pg_temp.fails47(format('select pos.order_invoice_create(%L, %L, 14, 0, 6000, null, %L::jsonb)', gen_random_uuid(), ord, lines)), 'total tidak sama dengan pesanan ditolak');
  perform pg_temp.ok47(pg_temp.fails47(format('select pos.order_invoice_create(%L, %L, 14, 0, 5000, null, %L::jsonb)', gen_random_uuid(), ord2, lines)), 'pesanan tanpa pelanggan ditolak');
  r := pos.order_invoice_create(inv, ord, 14, 0, 5000, 'dari kasir', lines);
  perform pg_temp.ok47((r->>'total')::numeric = 55000 and (r->>'number') like 'FJ-%', 'faktur dari pesanan dibuat oleh kasir');
  perform pg_temp.ok47((pos.order_invoice_create(inv, ord, 14, 0, 5000, 'dari kasir', lines)->>'already')::boolean, 'idempoten menurut id');
  reset role;
  perform pg_temp.ok47((select customer_id from pos.sales_invoices where id = inv) = cust, 'faktur untuk pelanggan pesanan');

  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok47(pg_temp.fails47(format('select pos.order_invoice_create(%L, %L, 14, 0, 5000, null, %L::jsonb)', gen_random_uuid(), ord, lines)), 'org lain ditolak');
    reset role;
  end if;
  delete from pos.sales_invoices where id = inv;
  delete from pos.orders where id in (ord, ord2);
  delete from pos.customers where id = cust;
end $$;

-- Stok keluar HANYA setelah faktur dari pesanan kasir lunas (migrasi 0148); belum dibayar tidak memotong stok.
do $$
declare
  o1 uuid := ctx('o1'); cash uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); cust uuid := gen_random_uuid(); ord uuid := gen_random_uuid();
  inv uuid := gen_random_uuid(); acct uuid; air uuid := ctx('air');
  lines jsonb;
begin
  lines := jsonb_build_array(jsonb_build_object('product_id', air, 'name', 'Air', 'qty', 2, 'unit_price', 5000));
  insert into auth.users(id, email) values (cash, 'cash-oi2@x'), (adm, 'adm-oi2@x');
  insert into org_members(org_id, user_id, role) values (o1, cash, 'cashier'), (o1, adm, 'admin');
  select id into acct from accounts where org_id = o1 and category = 'cash_bank' and kind = 'detail' and is_active limit 1;
  insert into customers(id, org_id, name) values (cust, o1, 'PT Stok Faktur');
  insert into orders(id, org_id, outlet_id, device_id, cashier_id, number, order_type, subtotal, total, customer_id, opened_at)
  values (ord, o1, ctx('out1'), ctx('dev'), ctx('emp'), 'OI-3', 'takeaway', 10000, 10000, cust, now());

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pos.order_invoice_create(inv, ord, 7, 0, 0, null, lines);
  reset role;
  perform pg_temp.ok47((select count(*) from pos.stock_movements where ref_type = 'sales_invoice' and ref_id = inv) = 0, 'faktur belum dibayar tidak memotong stok');
  perform pg_temp.ok47((select outlet_id from pos.sales_invoices where id = inv) = ctx('out1'), 'faktur mencatat outlet pesanan');

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  perform pos.sales_invoice_pay(gen_random_uuid(), inv, acct, null, 4000, null);
  reset role;
  perform pg_temp.ok47((select count(*) from pos.stock_movements where ref_type = 'sales_invoice' and ref_id = inv) = 0, 'bayar sebagian belum memotong stok');
  set local role authenticated;
  perform pos.sales_invoice_pay(gen_random_uuid(), inv, acct, null, 6000, null);
  reset role;
  perform pg_temp.ok47((select coalesce(sum(qty_delta), 0) from pos.stock_movements where ref_type = 'sales_invoice' and ref_id = inv) = -2, 'lunas memotong stok 2');
  perform pg_temp.ok47((select stock_out_at is not null from pos.sales_invoices where id = inv), 'stok keluar tercatat sekali');
  perform pg_temp.ok47((select count(*) from pos.journal_entries where source_type = 'sales_invoice_stock' and source_id = inv) = 1, 'jurnal HPP faktur');

  -- bersihkan
  update pos.sales_invoices set status = status where id = inv;
end $$;
