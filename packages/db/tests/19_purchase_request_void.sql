-- Pembelian lanjutan (migrasi 0126): PO dengan referensi permintaan, uang muka, faktur dengan uang muka/lampiran, dan pembatalan faktur (void).
create or replace function pg_temp.ok_pv(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails_pv(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  t_org uuid := gen_random_uuid();
  mgr uuid := gen_random_uuid();
  outl uuid := gen_random_uuid();
  loc uuid;
  loc_src uuid := gen_random_uuid();
  sup uuid := gen_random_uuid();
  prod uuid := gen_random_uuid();
  u_base uuid := gen_random_uuid();
  req_id uuid := gen_random_uuid();
  po_id uuid := gen_random_uuid();
  inv_id uuid := gen_random_uuid();
  cash uuid := gen_random_uuid();
  ap uuid := gen_random_uuid();
  invacc uuid := gen_random_uuid();
  taxacc uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Jakarta')::date;
  r jsonb;
begin
  -- Setup org & member mandiri agar terisolasi dari tes lain
  insert into orgs(id, name) values (t_org, 'Org Tes Purchase Void');
  insert into auth.users(id, email) values (mgr, 'mgr-pvoid@x');
  insert into org_members(org_id, user_id, role) values (t_org, mgr, 'manager');
  insert into outlets(id, org_id, name, code) values (outl, t_org, 'Outlet Utama', 'OU1');
  select id into loc from locations where outlet_id = outl;
  insert into locations(id, org_id, name, kind, is_active) values
    (loc_src, t_org, 'Gudang Pusat', 'warehouse', true);
  insert into suppliers(id, org_id, name, term_days) values (sup, t_org, 'Pemasok Mandiri', 7);
  -- seed bawaan org: akun sistem (kas, utang usaha, persediaan, pajak masukan) dan satuan dasar
  perform pos.seed_org_defaults(t_org);
  select id into u_base from units where org_id = t_org and name = 'pcs';
  insert into products(id, org_id, kind, name, is_sellable, track_stock) values (prod, t_org, 'goods', 'Barang PO', true, true);
  insert into product_units(org_id, product_id, unit_id, conversion, is_base) values (t_org, prod, u_base, 1, true);


  -- Permintaan barang
  insert into stock_requests(id, org_id, number, requester_location_id, source_location_id, status)
  values (req_id, t_org, 'REQ-TEST-001', loc, loc_src, 'approved');

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;

  -- 1. Buat PO dengan referensi permintaan & uang muka
  r := pos.purchase_order_save(
    po_id, loc, sup, today, today + 3,
    0, 0, 0, 'PO Uji DP', 'ordered',
    jsonb_build_array(jsonb_build_object('product_id', prod, 'unit_id', u_base, 'qty', 10, 'unit_price', 10000)),
    req_id, 25000
  );
  perform pg_temp.ok_pv((select request_id from purchase_orders where id = po_id) = req_id, 'PO menyimpan referensi permintaan stok');
  perform pg_temp.ok_pv((select down_payment from purchase_orders where id = po_id) = 25000, 'PO menyimpan uang muka');

  -- 2. Buat faktur dari PO dengan uang muka & lampiran
  r := pos.purchase_invoice_create(
    inv_id, loc, sup, po_id, 'INV-SUP-1', today, 7,
    0, 0, 0, 'Faktur uji void',
    jsonb_build_array(jsonb_build_object('product_id', prod, 'unit_id', u_base, 'qty', 10, 'unit_price', 10000, 'received_qty', 10)),
    25000, 'bukti_faktur.pdf'
  );
  perform pg_temp.ok_pv((select down_payment_applied from purchase_invoices where id = inv_id) = 25000, 'Faktur menyimpan potongan uang muka');
  perform pg_temp.ok_pv((select attachment_path from purchase_invoices where id = inv_id) = 'bukti_faktur.pdf', 'Faktur menyimpan lampiran');
  perform pg_temp.ok_pv((select status from purchase_orders where id = po_id) = 'received', 'PO status received setelah faktur dibuat');

  -- 3. Batalkan faktur (void)
  r := pos.purchase_invoice_void(inv_id, 'Faktur salah input barang');
  perform pg_temp.ok_pv((select status from purchase_invoices where id = inv_id) = 'void', 'Status faktur berubah jadi void');
  perform pg_temp.ok_pv((select status from purchase_orders where id = po_id) = 'ordered', 'PO kembali ordered setelah faktur dibatalkan');
  perform pg_temp.ok_pv((select count(*) from stock_movements where ref_id = inv_id and kind = 'adjust_out') > 0, 'Stok yang diterima dibalikkan dengan penyesuaian keluar');
end $$;
