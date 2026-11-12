-- Pemetaan harga beli (migrasi 0043): tanpa pengaturan = harga faktur terakhir (yang tidak batal); manual menimpa; kembali ke 'last' menghapus harga manual;
-- hanya pengelola; kasir dan org lain tidak melihat; klien tidak boleh menulis langsung.
create or replace function pg_temp.ok43(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails43(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return want is null or sqlerrm = want;
end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); loc uuid := pos.outlet_location(ctx('out1')); bean uuid := ctx('bean'); air uuid := ctx('air');
  mgr uuid := gen_random_uuid(); cashier uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); gram uuid; svc uuid;
  i1 uuid := gen_random_uuid(); i2 uuid := gen_random_uuid(); i3 uuid := gen_random_uuid(); r jsonb;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-ppm@x'), (cashier, 'cashier-ppm@x'), (stranger, 'stranger-ppm@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cashier, 'cashier'), (o2, stranger, 'owner');
  select id into gram from units where org_id = o1 and name = 'gram';
  insert into products(org_id, kind, name, is_sellable, track_stock) values (o1, 'service', 'Jasa harga', true, true) returning id into svc;
  -- tiga faktur untuk 'bean': lama, terbaru, dan batal yang paling baru
  insert into purchase_invoices(id, org_id, location_id, number, invoice_date, status) values
    (i1, o1, loc, 'PINV-T1', date '2026-01-10', 'open'), (i2, o1, loc, 'PINV-T2', date '2026-03-05', 'paid'), (i3, o1, loc, 'PINV-T3', date '2026-04-01', 'void');
  insert into purchase_invoice_lines(org_id, invoice_id, product_id, unit_id, qty, unit_price, line_total) values
    (o1, i1, bean, gram, 100, 280, 28000), (o1, i2, bean, gram, 100, 310, 31000), (o1, i3, bean, gram, 100, 999, 99900);

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  -- tanpa pengaturan: faktur terakhir yang tidak batal
  r := pos.purchase_price_suggest(o1, bean);
  perform pg_temp.ok43(r->>'source' = 'last' and (r->>'price')::numeric = 310 and r->>'invoice_number' = 'PINV-T2' and (r->>'unit_id')::uuid = gram, 'terakhir = faktur terbaru yang tidak batal');
  perform pg_temp.ok43(pos.purchase_price_suggest(o1, air)->>'source' = 'none', 'belum pernah dibeli = none');
  -- manual menimpa
  perform pos.purchase_price_set(o1, bean, 'manual', 295.5, gram);
  r := pos.purchase_price_suggest(o1, bean);
  perform pg_temp.ok43(r->>'source' = 'manual' and (r->>'price')::numeric = 295.5, 'manual menimpa harga terakhir');
  -- ubah ke manual lain lalu kembali ke last
  perform pos.purchase_price_set(o1, bean, 'manual', 300, null);
  perform pg_temp.ok43((select manual_price from pos.purchase_price_map where product_id = bean) = 300 and (select manual_unit_id from pos.purchase_price_map where product_id = bean) is null, 'upsert mengganti harga dan satuan');
  perform pos.purchase_price_set(o1, bean, 'last', null, null);
  perform pg_temp.ok43(pos.purchase_price_suggest(o1, bean)->>'source' = 'last' and (select manual_price from pos.purchase_price_map where product_id = bean) is null, 'kembali ke last menghapus harga manual');
  perform pg_temp.ok43((select count(*) from pos.purchase_price_map where product_id = bean) = 1, 'satu baris per barang');
  -- harga manual untuk barang tanpa faktur
  perform pos.purchase_price_set(o1, air, 'manual', 2000, null);
  perform pg_temp.ok43(pos.purchase_price_suggest(o1, air)->>'source' = 'manual', 'manual untuk barang yang belum pernah dibeli');
  -- validasi
  perform pg_temp.ok43(pg_temp.fails43(format('select pos.purchase_price_set(%L, %L, ''harian'', 1, null)', o1, bean), 'invalid mode'), 'mode tidak dikenal ditolak');
  perform pg_temp.ok43(pg_temp.fails43(format('select pos.purchase_price_set(%L, %L, ''manual'', -1, null)', o1, bean), 'invalid price'), 'harga negatif ditolak');
  perform pg_temp.ok43(pg_temp.fails43(format('select pos.purchase_price_set(%L, %L, ''manual'', null, null)', o1, bean), 'invalid price'), 'manual tanpa harga ditolak');
  perform pg_temp.ok43(pg_temp.fails43(format('select pos.purchase_price_set(%L, %L, ''manual'', 1.00001, null)', o1, bean), 'invalid price'), '5 desimal ditolak');
  perform pg_temp.ok43(pg_temp.fails43(format('select pos.purchase_price_set(%L, %L, ''manual'', 1, %L)', o1, bean, gen_random_uuid()), 'unit not found'), 'satuan tidak ada ditolak');
  perform pg_temp.ok43(pg_temp.fails43(format('select pos.purchase_price_set(%L, %L, ''manual'', 1, null)', o1, svc), 'product not found'), 'jasa tidak bisa dipetakan');
  perform pg_temp.ok43(pg_temp.fails43(format('select pos.purchase_price_set(%L, %L, ''manual'', 1, null)', o1, gen_random_uuid()), 'product not found'), 'barang tidak ada ditolak');
  -- klien tidak boleh menulis langsung
  perform pg_temp.ok43(pg_temp.fails43(format('update pos.purchase_price_map set manual_price = 1 where product_id = %L', air), 'permission denied for table purchase_price_map'), 'klien tidak boleh mengubah tabel langsung');
  perform pg_temp.ok43(pg_temp.fails43(format('insert into pos.purchase_price_map(org_id, product_id, mode, manual_price) values (%L, %L, ''manual'', 1)', o1, svc), 'permission denied for table purchase_price_map'), 'klien tidak boleh menyisipkan langsung');
  reset role;

  -- kasir dan org lain
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  set local role authenticated;
  perform pg_temp.ok43((select count(*) from pos.purchase_price_map) = 0, 'kasir tidak melihat pemetaan');
  perform pg_temp.ok43(pg_temp.fails43(format('select pos.purchase_price_set(%L, %L, ''manual'', 1, null)', o1, bean), 'not allowed'), 'kasir tidak boleh mengatur');
  perform pg_temp.ok43(pg_temp.fails43(format('select pos.purchase_price_suggest(%L, %L)', o1, bean), 'not allowed'), 'kasir tidak boleh meminta saran harga beli');
  reset role;
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  set local role authenticated;
  perform pg_temp.ok43((select count(*) from pos.purchase_price_map) = 0, 'org lain tidak melihat pemetaan');
  perform pg_temp.ok43(pg_temp.fails43(format('select pos.purchase_price_set(%L, %L, ''manual'', 1, null)', o1, bean), 'not allowed'), 'org lain tidak boleh mengatur');
  perform pg_temp.ok43(pg_temp.fails43(format('select pos.purchase_price_suggest(%L, %L)', o1, bean), 'not allowed'), 'org lain tidak boleh meminta saran');
  reset role;
end $$;
