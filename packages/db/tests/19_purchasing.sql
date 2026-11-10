-- Pembelian (migrasi 0016): PO, faktur dengan penerimaan sebagian, bayar faktur, jurnal dan stok sejalan, hanya pemilik/manajer.
create or replace function pg_temp.ok5(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails5(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); loc uuid := pos.outlet_location(ctx('out1')); bean uuid := ctx('bean');
  mgr uuid := gen_random_uuid(); cashier uuid := gen_random_uuid(); sup uuid := gen_random_uuid();
  po uuid := gen_random_uuid(); inv uuid := gen_random_uuid(); inv2 uuid := gen_random_uuid(); rcp uuid := gen_random_uuid(); pay1 uuid := gen_random_uuid(); pay2 uuid := gen_random_uuid();
  base_unit uuid; kg_unit uuid; kg_pu uuid; cash uuid; ap uuid; invacc uuid; taxacc uuid; line1 uuid; svc uuid;
  r jsonb; q0 numeric; a0 numeric; q1 numeric; a1 numeric; n1 text; j_deb numeric; j_cred numeric; je uuid;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-pur@x'), (cashier, 'cashier-pur@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cashier, 'cashier');
  insert into suppliers(id, org_id, name, term_days) values (sup, o1, 'PT Uji Pemasok', 14);
  insert into products(org_id, kind, name, is_sellable, track_stock) values (o1, 'service', 'Jasa pembelian', true, true) returning id into svc;
  cash := pos.account_id(o1, 'cash_main'); ap := pos.account_id(o1, 'accounts_payable'); invacc := pos.account_id(o1, 'inventory'); taxacc := pos.account_id(o1, 'purchase_tax_input');
  select unit_id into base_unit from product_units where product_id = bean and is_base and deleted_at is null limit 1;
  insert into units(org_id, name) values (o1, 'ZZ karung') returning id into kg_unit;
  insert into product_units(org_id, product_id, unit_id, conversion, is_base) values (o1, bean, kg_unit, 10, false) returning id into kg_pu;
  -- saldo awal yang pasti positif
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, source_key) values (o1, loc, bean, 'adjust_in', 100, 1000, 'pur-setup-bean');
  select qty, avg_cost into q0, a0 from stock_balances where location_id = loc and product_id = bean;

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;

  -- PO: total dihitung server (2 karung x 50.000 - 5.000 = 95.000; diskon 5.000, pajak 9.000, biaya lain 1.000 -> 100.000)
  r := pos.purchase_order_save(po, loc, sup, current_date, current_date + 3, 5000, 9000, 1000, 'pesan uji', 'ordered',
        jsonb_build_array(jsonb_build_object('product_id', bean, 'unit_id', kg_unit, 'qty', 2, 'unit_price', 50000, 'discount', 5000)));
  perform pg_temp.ok5(r->>'number' like 'PO-%' and (r->>'total')::numeric = 100000, 'PO dibuat, total dihitung server: ' || r::text);
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.purchase_order_save(%L,%L,%L,null,null,0,0,0,null,%L,%L::jsonb)', gen_random_uuid(), loc, sup, 'ordered', '[]')), 'PO tanpa baris ditolak');
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.purchase_order_save(%L,%L,%L,null,null,0,0,0,null,%L,%L::jsonb)', gen_random_uuid(), loc, sup, 'ordered',
     jsonb_build_array(jsonb_build_object('product_id', svc, 'unit_id', base_unit, 'qty', 1, 'unit_price', 1000)))), 'barang tanpa stok ditolak');
  -- ubah PO yang masih dipesan
  r := pos.purchase_order_save(po, loc, sup, current_date, null, 5000, 9000, 1000, 'pesan uji', 'ordered',
        jsonb_build_array(jsonb_build_object('product_id', bean, 'unit_id', kg_unit, 'qty', 2, 'unit_price', 50000, 'discount', 5000)));
  perform pg_temp.ok5((select count(*) from purchase_order_lines where order_id = po) = 1, 'baris PO diganti, bukan digandakan');

  -- faktur dari PO: 2 karung (=20 satuan dasar) diterima sebagian (1 karung = 10)
  r := pos.purchase_invoice_create(inv, loc, sup, po, 'SJ-777', current_date, null, 5000, 9000, 1000, 'faktur uji',
        jsonb_build_array(jsonb_build_object('product_id', bean, 'unit_id', kg_unit, 'qty', 2, 'unit_price', 50000, 'discount', 5000, 'received_qty', 1)));
  n1 := r->>'number';
  perform pg_temp.ok5(n1 like 'FPB-%' and (r->>'total')::numeric = 100000, 'faktur dibuat: ' || r::text);
  perform pg_temp.ok5((select due_date from purchase_invoices where id = inv) = current_date + 14, 'jatuh tempo mengikuti termin pemasok (14 hari)');
  perform pg_temp.ok5((select status from purchase_orders where id = po) = 'received', 'PO ditandai diterima');
  -- biaya per satuan dasar: nilai baris 95.000/2 karung = 47.500 per karung; faktor (95.000-5.000+1.000)/95.000; /10
  select qty, avg_cost into q1, a1 from stock_balances where location_id = loc and product_id = bean;
  perform pg_temp.ok5(q1 = q0 + 10, 'stok bertambah 10 satuan dasar: ' || q0 || ' -> ' || q1);
  perform pg_temp.ok5((select unit_cost from stock_movements where source_key like 'purchase:%' and ref_id = inv limit 1) = round(47500 * (91000.0/95000) / 10, 4), 'biaya per satuan dasar');
  -- idempoten
  r := pos.purchase_invoice_create(inv, loc, sup, null, null, null, null, 0, 0, 0, null, jsonb_build_array(jsonb_build_object('product_id', bean, 'unit_id', kg_unit, 'qty', 1, 'unit_price', 1)));
  perform pg_temp.ok5((r->>'already')::boolean, 'ulang dengan id sama tidak menggandakan');
  perform pg_temp.ok5((select count(*) from purchase_invoices where id = inv) = 1, 'satu faktur');

  -- jurnal seimbang: Dr Persediaan 91.000, Dr Pajak masukan 9.000, Cr Utang 100.000
  select id into je from journal_entries where source_key = 'purchase:' || inv;
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into j_deb, j_cred from journal_lines where entry_id = je;
  perform pg_temp.ok5(j_deb = 100000 and j_cred = 100000, 'jurnal seimbang');
  perform pg_temp.ok5((select debit from journal_lines where entry_id = je and account_id = invacc) = 91000, 'persediaan 91.000');
  perform pg_temp.ok5((select debit from journal_lines where entry_id = je and account_id = taxacc) = 9000, 'pajak masukan 9.000');
  perform pg_temp.ok5((select credit from journal_lines where entry_id = je and account_id = ap) = 100000, 'utang usaha 100.000');

  -- penerimaan lanjutan: lebih dari sisa ditolak; sisa 1 karung diterima; kunci ulang idempoten
  select id into line1 from purchase_invoice_lines where invoice_id = inv;
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.purchase_receive(%L,%L,null,%L::jsonb)', inv, gen_random_uuid(), jsonb_build_array(jsonb_build_object('line_id', line1, 'qty', 2)))), 'melebihi sisa ditolak');
  r := pos.purchase_receive(inv, rcp, 'sisa', jsonb_build_array(jsonb_build_object('line_id', line1, 'qty', 1)));
  perform pg_temp.ok5((select received_qty from purchase_invoice_lines where id = line1) = 2, 'baris lengkap diterima');
  perform pg_temp.ok5((select qty from stock_balances where location_id = loc and product_id = bean) = q0 + 20, 'stok total +20');
  r := pos.purchase_receive(inv, rcp, 'sisa', jsonb_build_array(jsonb_build_object('line_id', line1, 'qty', 1)));
  perform pg_temp.ok5((r->>'already')::boolean and (select qty from stock_balances where location_id = loc and product_id = bean) = q0 + 20, 'penerimaan ulang tidak menggandakan stok');

  -- bayar: akun harus kas/bank; melebihi sisa ditolak; sebagian lalu lunas
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.purchase_pay(%L,%L,%L,1000,null,null)', gen_random_uuid(), inv, ap)), 'akun hutang bukan akun kas/bank');
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.purchase_pay(%L,%L,%L,100001,null,null)', gen_random_uuid(), inv, cash)), 'melebihi sisa ditolak');
  r := pos.purchase_pay(pay1, inv, cash, 40000, current_date, 'cicil');
  perform pg_temp.ok5((select status from purchase_invoices where id = inv) = 'partially_paid' and (select paid_total from purchase_invoices where id = inv) = 40000, 'sebagian dibayar');
  r := pos.purchase_pay(pay1, inv, cash, 40000, current_date, 'cicil');
  perform pg_temp.ok5((r->>'already')::boolean and (select paid_total from purchase_invoices where id = inv) = 40000, 'bayar ulang dengan id sama idempoten');
  r := pos.purchase_pay(pay2, inv, cash, 60000, current_date, 'lunas');
  perform pg_temp.ok5((select status from purchase_invoices where id = inv) = 'paid', 'lunas');
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.purchase_pay(%L,%L,%L,1,null,null)', gen_random_uuid(), inv, cash)), 'faktur lunas tidak bisa dibayar lagi');
  perform pg_temp.ok5((select count(*) from journal_lines jl join journal_entries e on e.id = jl.entry_id where e.source_type = 'purchase_payment' and e.source_id in (pay1, pay2)) = 4, 'dua jurnal bayar');
  perform pg_temp.ok5((select sum(debit) - sum(credit) from journal_lines jl join journal_entries e on e.id = jl.entry_id where e.source_type in ('purchase_invoice','purchase_payment') and e.source_id in (inv, pay1, pay2)
        and jl.account_id = ap) = 0, 'saldo utang usaha kembali nol');

  -- faktur tanpa pemasok dan tanpa PO, diterima penuh secara bawaan
  r := pos.purchase_invoice_create(inv2, loc, null, null, null, current_date, 0, 0, 0, 0, null,
        jsonb_build_array(jsonb_build_object('product_id', bean, 'unit_id', base_unit, 'qty', 5, 'unit_price', 1200)));
  perform pg_temp.ok5((r->>'total')::numeric = 6000 and (select received_qty from purchase_invoice_lines where invoice_id = inv2) = 5, 'faktur tanpa pemasok, diterima penuh');

  -- hak akses
  reset role;
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  set local role authenticated;
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.purchase_order_save(%L,%L,%L,null,null,0,0,0,null,%L,%L::jsonb)', gen_random_uuid(), loc, sup, 'draft',
     jsonb_build_array(jsonb_build_object('product_id', bean, 'unit_id', base_unit, 'qty', 1, 'unit_price', 1)))), 'kasir tidak boleh membuat PO');
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.purchase_invoice_create(%L,%L,null,null,null,null,0,0,0,0,null,%L::jsonb)', gen_random_uuid(), loc,
     jsonb_build_array(jsonb_build_object('product_id', bean, 'unit_id', base_unit, 'qty', 1, 'unit_price', 1)))), 'kasir tidak boleh membuat faktur');
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.purchase_pay(%L,%L,%L,1,null,null)', gen_random_uuid(), inv2, cash)), 'kasir tidak boleh membayar');
  perform pg_temp.ok5(pg_temp.fails5(format('insert into purchase_invoices(org_id, location_id, number, total) values (%L,%L,%L,1)', o1, loc, 'X-1')), 'tulis langsung faktur ditolak');
  update purchase_invoices set paid_total = 0 where id = inv;
  delete from purchase_payments where id = pay1;
  reset role;
  perform pg_temp.ok5((select paid_total from purchase_invoices where id = inv) = 100000 and exists (select 1 from purchase_payments where id = pay1), 'ubah/hapus langsung oleh kasir tidak berefek (RLS)');
  -- pemilik/manajer pun tidak bisa menulis langsung ke faktur dan pembayaran
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pg_temp.ok5((select count(*) from purchase_invoices where id = inv) = 1, 'manajer boleh membaca faktur');
  update purchase_payments set amount = 1 where id = pay1;
  perform pg_temp.ok5((select amount from purchase_payments where id = pay1) = 40000, 'update langsung pembayaran tidak berefek (RLS)');
  reset role;
  delete from products where id = svc;
exception when others then
  reset role;
  raise;
end $$;
