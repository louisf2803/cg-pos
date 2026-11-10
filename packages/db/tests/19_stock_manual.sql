-- Stok manual (migrasi 0014): masuk, keluar, terbuang; hanya pemilik/manajer; idempoten; rata-rata biaya bergerak.
create or replace function pg_temp.ok3(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); loc uuid := pos.outlet_location(ctx('out1')); bean uuid := ctx('bean');
  mgr uuid := gen_random_uuid(); cashier uuid := gen_random_uuid(); r jsonb; q0 numeric; a0 numeric; q1 numeric; a1 numeric;
  untracked uuid; svc uuid; foreign_prod uuid; foreign_loc uuid; mv stock_movements%rowtype; fl record;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-stk@x'), (cashier, 'cashier-stk@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cashier, 'cashier');
  insert into products(org_id, kind, name, track_stock) values (o1, 'goods', 'Tidak dilacak', false) returning id into untracked;
  insert into products(org_id, kind, name, is_sellable, track_stock) values (o1, 'service', 'Jasa antar', true, true) returning id into svc;
  insert into products(org_id, kind, name) values (o2, 'goods', 'Barang org lain') returning id into foreign_prod;
  select id into foreign_loc from locations where org_id = o2 limit 1;
  select qty, avg_cost into q0, a0 from stock_balances where location_id = loc and product_id = bean;

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;

  -- masuk dengan harga: rata-rata bergerak
  r := pos.stock_post(loc, bean, 'adjust_in', 500, 300, 'beli pasar', 'k1');
  perform pg_temp.ok3((r->>'qty')::numeric = q0 + 500, 'qty setelah masuk: ' || r::text);
  perform pg_temp.ok3((r->>'avg_cost')::numeric = round(case when q0 <= 0 then 300 else (q0 * a0 + 500 * 300) / (q0 + 500) end, 4), 'rata-rata baru: ' || r::text);
  q1 := (r->>'qty')::numeric; a1 := (r->>'avg_cost')::numeric;
  select * into mv from stock_movements where org_id = o1 and source_key = 'manual:k1';
  perform pg_temp.ok3(mv.kind = 'adjust_in' and mv.qty_delta = 500 and mv.reason = 'beli pasar' and mv.ref_type = 'manual' and mv.qty_after = q1, 'baris gerakan tercatat');

  -- kunci sama: tidak ganda
  r := pos.stock_post(loc, bean, 'adjust_in', 500, 300, 'beli pasar', 'k1');
  perform pg_temp.ok3((r->>'duplicate')::boolean and (r->>'qty')::numeric = q1, 'kunci ganda diabaikan: ' || r::text);
  perform pg_temp.ok3((select count(*) from stock_movements where org_id = o1 and source_key = 'manual:k1') = 1, 'tetap satu baris');

  -- masuk tanpa harga: rata-rata tidak bergeser
  r := pos.stock_post(loc, bean, 'adjust_in', 100, null, null, 'k2');
  perform pg_temp.ok3((r->>'qty')::numeric = q1 + 100 and (r->>'avg_cost')::numeric = a1, 'tanpa harga memakai rata-rata: ' || r::text);

  -- keluar dan terbuang memakai rata-rata saat ini, rata-rata tetap
  r := pos.stock_post(loc, bean, 'adjust_out', 40, null, 'tumpah', 'k3');
  perform pg_temp.ok3((r->>'qty')::numeric = q1 + 60 and (r->>'avg_cost')::numeric = a1, 'keluar: ' || r::text);
  select * into mv from stock_movements where org_id = o1 and source_key = 'manual:k3';
  perform pg_temp.ok3(mv.qty_delta = -40 and mv.unit_cost = a1 and mv.total_cost = round(-40 * a1, 4), 'biaya keluar = rata-rata');
  r := pos.stock_post(loc, bean, 'waste', 10, null, 'kedaluwarsa', 'k4');
  perform pg_temp.ok3((r->>'qty')::numeric = q1 + 50, 'terbuang: ' || r::text);
  perform pg_temp.ok3((select kind from stock_movements where org_id = o1 and source_key = 'manual:k4') = 'waste', 'jenis waste');

  -- stok boleh negatif
  r := pos.stock_post(loc, bean, 'adjust_out', q1 + 50 + 25, null, 'koreksi besar', null);
  perform pg_temp.ok3((r->>'qty')::numeric = -25, 'boleh negatif: ' || r::text);

  -- masukan salah
  perform pg_temp.ok3(pg_temp.fails(format('select pos.stock_post(%L,%L,%L,0,1,null,null)', loc, bean, 'adjust_in')), 'qty 0 ditolak');
  perform pg_temp.ok3(pg_temp.fails(format('select pos.stock_post(%L,%L,%L,-5,1,null,null)', loc, bean, 'adjust_in')), 'qty negatif ditolak');
  perform pg_temp.ok3(pg_temp.fails(format('select pos.stock_post(%L,%L,%L,1.00001,1,null,null)', loc, bean, 'adjust_in')), '5 desimal ditolak');
  perform pg_temp.ok3(pg_temp.fails(format('select pos.stock_post(%L,%L,%L,1,1,null,null)', loc, bean, 'sale')), 'jenis sale tidak boleh dari fungsi ini');
  perform pg_temp.ok3(pg_temp.fails(format('select pos.stock_post(%L,%L,%L,1,1,null,null)', loc, bean, 'opening')), 'jenis opening tidak boleh');
  perform pg_temp.ok3(pg_temp.fails(format('select pos.stock_post(%L,%L,%L,1,-1,null,null)', loc, bean, 'adjust_in')), 'harga negatif ditolak');
  perform pg_temp.ok3(pg_temp.fails(format('select pos.stock_post(%L,%L,%L,1,1,%L,null)', loc, bean, 'adjust_in', repeat('x', 201))), 'alasan 201 huruf ditolak');
  perform pg_temp.ok3(pg_temp.fails(format('select pos.stock_post(%L,%L,%L,1,1,null,null)', loc, untracked, 'adjust_in')), 'produk tidak dilacak ditolak');
  perform pg_temp.ok3(pg_temp.fails(format('select pos.stock_post(%L,%L,%L,1,1,null,null)', loc, svc, 'adjust_in')), 'jasa ditolak');
  perform pg_temp.ok3(pg_temp.fails(format('select pos.stock_post(%L,%L,%L,1,1,null,null)', loc, foreign_prod, 'adjust_in')), 'produk org lain ditolak');
  perform pg_temp.ok3(pg_temp.fails(format('select pos.stock_post(%L,%L,%L,1,1,null,null)', foreign_loc, foreign_prod, 'adjust_in')), 'lokasi org lain ditolak');

  -- kasir tidak boleh; tulis langsung ditolak
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  perform pg_temp.ok3(pg_temp.fails(format('select pos.stock_post(%L,%L,%L,1,1,null,null)', loc, bean, 'adjust_in')), 'kasir ditolak');
  perform pg_temp.ok3(pg_temp.fails(format('insert into stock_movements(org_id, location_id, product_id, kind, qty_delta) values (%L,%L,%L,%L,5)', o1, loc, bean, 'adjust_in')), 'kasir tidak boleh menulis langsung');
  reset role;

  -- append-only dan tanda jumlah dijaga
  perform pg_temp.ok3(pg_temp.fails(format('update stock_movements set qty_delta = 1 where id = %L', mv.id)), 'gerakan tidak bisa diubah');
  perform pg_temp.ok3(pg_temp.fails(format('insert into stock_movements(org_id, location_id, product_id, kind, qty_delta) values (%L,%L,%L,%L,-5)', o1, loc, bean, 'adjust_in')), 'adjust_in harus positif');
  perform pg_temp.ok3(pg_temp.fails(format('insert into stock_movements(org_id, location_id, product_id, kind, qty_delta) values (%L,%L,%L,%L,5)', o1, loc, bean, 'adjust_out')), 'adjust_out harus negatif');
  -- saldo = jumlah gerakan
  perform pg_temp.ok3((select qty from stock_balances where location_id = loc and product_id = bean) = (select sum(qty_delta) from stock_movements where location_id = loc and product_id = bean), 'saldo = jumlah gerakan');
  -- bersihkan produk uji supaya tes berikutnya (isolasi antar org) tidak terpengaruh
  delete from products where id in (untracked, svc, foreign_prod);
end $$;
