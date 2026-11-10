-- Transfer stok (migrasi 0024): kirim, terima, batalkan, biaya ikut pindah, hanya manajer, tabel terkunci.
create or replace function pg_temp.ok11(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails11(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); loc uuid := pos.outlet_location(ctx('out1')); bean uuid := ctx('bean'); air uuid := ctx('air');
  mgr uuid := gen_random_uuid(); cashier uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  wh uuid; wh2 uuid; t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid(); svc uuid; r jsonb;
  q_src numeric; q_dst numeric; avg_src numeric; n int;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-trf@x'), (cashier, 'cashier-trf@x'), (stranger, 'stranger-trf@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cashier, 'cashier'), (o2, stranger, 'owner');
  insert into locations(org_id, name, kind) values (o1, 'Gudang uji', 'warehouse') returning id into wh;
  insert into locations(org_id, name, kind) values (o2, 'Gudang org lain', 'warehouse') returning id into wh2;
  insert into products(org_id, kind, name, is_sellable, track_stock) values (o1, 'service', 'Jasa transfer', true, true) returning id into svc;
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, source_key) values
    (o1, loc, bean, 'adjust_in', 500, 300, 'trf-setup-bean'), (o1, loc, air, 'adjust_in', 50, 2000, 'trf-setup-air');
  select qty, avg_cost into q_src, avg_src from stock_balances where location_id = loc and product_id = bean;
  select coalesce(sum(qty), 0) into q_dst from stock_balances where location_id = wh and product_id = bean;

  -- kasir dan orang luar ditolak
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  perform pg_temp.ok11(pg_temp.fails11(format('select pos.stock_transfer_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh, jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 1)))), 'kasir ditolak');
  perform pg_temp.ok11(pg_temp.fails11('select * from pos.stock_location_list()') = false and (select count(*) from pos.stock_location_list()) = 0, 'kasir tidak melihat lokasi');
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform pg_temp.ok11(pg_temp.fails11(format('select pos.stock_transfer_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh, jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 1)))), 'org lain ditolak');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.ok11(pg_temp.fails11(format('select pos.stock_transfer_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh, jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 1)))), 'tanpa login ditolak');

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  -- galat masukan
  perform pg_temp.ok11(pg_temp.fails11(format('select pos.stock_transfer_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, loc, jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 1)))), 'asal = tujuan');
  perform pg_temp.ok11(pg_temp.fails11(format('select pos.stock_transfer_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh2, jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 1)))), 'lintas organisasi');
  perform pg_temp.ok11(pg_temp.fails11(format('select pos.stock_transfer_create(%L, %L, %L, null, ''[]''::jsonb)', gen_random_uuid(), loc, wh)), 'tanpa baris');
  perform pg_temp.ok11(pg_temp.fails11(format('select pos.stock_transfer_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh, jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 0)))), 'jumlah 0');
  perform pg_temp.ok11(pg_temp.fails11(format('select pos.stock_transfer_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh, jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 1.00001)))), '5 desimal');
  perform pg_temp.ok11(pg_temp.fails11(format('select pos.stock_transfer_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh, jsonb_build_array(jsonb_build_object('product_id', svc, 'qty', 1)))), 'jasa tidak dilacak');
  perform pg_temp.ok11(pg_temp.fails11(format('select pos.stock_transfer_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh, jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 1), jsonb_build_object('product_id', bean, 'qty', 2)))), 'produk ganda');
  perform pg_temp.ok11((select count(*) from stock_transfers where org_id = o1) = 0, 'galat tidak meninggalkan dokumen');

  -- kirim
  r := pos.stock_transfer_create(t1, loc, wh, 'isi ulang gudang', jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 120), jsonb_build_object('product_id', air, 'qty', 10)));
  perform pg_temp.ok11((r->>'number') like 'TRF-%' and r->>'status' = 'in_transit' and not (r->>'duplicate')::boolean, 'kirim: ' || r::text);
  perform pg_temp.ok11((select qty from stock_balances where location_id = loc and product_id = bean) = q_src - 120, 'asal berkurang');
  perform pg_temp.ok11((select coalesce(sum(qty), 0) from stock_balances where location_id = wh and product_id = bean) = q_dst, 'tujuan belum bertambah');
  -- kirim ulang dengan id sama: tidak ganda
  r := pos.stock_transfer_create(t1, loc, wh, 'isi ulang gudang', jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 120)));
  perform pg_temp.ok11((r->>'duplicate')::boolean and (select qty from stock_balances where location_id = loc and product_id = bean) = q_src - 120, 'kirim ulang idempoten');
  -- daftar
  select count(*) into n from pos.stock_transfer_list(10) where id = t1 and jsonb_array_length(lines) = 2;
  perform pg_temp.ok11(n = 1, 'daftar memuat baris');

  -- terima: tujuan bertambah dengan biaya asal
  r := pos.stock_transfer_receive(t1);
  perform pg_temp.ok11(r->>'status' = 'received', 'diterima');
  perform pg_temp.ok11((select qty from stock_balances where location_id = wh and product_id = bean) = q_dst + 120, 'tujuan bertambah');
  perform pg_temp.ok11((select avg_cost from stock_balances where location_id = wh and product_id = bean) = avg_src, 'biaya rata-rata ikut pindah');
  perform pg_temp.ok11((select bool_and(received_qty = qty) from stock_transfer_lines where transfer_id = t1), 'jumlah terima tercatat');
  perform pg_temp.ok11(pg_temp.fails11(format('select pos.stock_transfer_receive(%L)', t1)), 'tidak bisa diterima dua kali');
  perform pg_temp.ok11(pg_temp.fails11(format('select pos.stock_transfer_cancel(%L)', t1)), 'yang sudah diterima tidak bisa dibatalkan');

  -- batal: stok kembali
  r := pos.stock_transfer_create(t2, loc, wh, null, jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 40)));
  perform pg_temp.ok11((select qty from stock_balances where location_id = loc and product_id = bean) = q_src - 160, 'asal berkurang lagi');
  perform pos.stock_transfer_cancel(t2);
  perform pg_temp.ok11((select qty from stock_balances where location_id = loc and product_id = bean) = q_src - 120, 'batal mengembalikan stok');
  perform pg_temp.ok11((select status from stock_transfers where id = t2) = 'cancelled', 'status batal');
  perform pg_temp.ok11(pg_temp.fails11(format('select pos.stock_transfer_receive(%L)', t2)), 'yang batal tidak bisa diterima');

  -- tabel terkunci dari klien langsung, fungsi tertutup untuk anon, log tercatat
  set local role authenticated;
  perform pg_temp.ok11(pg_temp.fails11(format('update pos.stock_transfers set status = ''received'' where id = %L', t2)), 'update langsung ditolak');
  perform pg_temp.ok11(pg_temp.fails11(format('delete from pos.stock_transfers where id = %L', t1)), 'hapus langsung ditolak');
  perform pg_temp.ok11(pg_temp.fails11(format('insert into pos.stock_transfer_lines(transfer_id, product_id, org_id, qty) values (%L, %L, %L, 1)', t1, air, o1)), 'sisip baris langsung ditolak');
  reset role;
  perform pg_temp.ok11(not has_function_privilege('anon', 'pos.stock_transfer_create(uuid, uuid, uuid, text, jsonb)', 'execute'), 'anon tidak boleh');
  perform pg_temp.ok11((select count(*) from activity_logs where entity = 'stock_transfer' and entity_id in (t1, t2)) >= 4, 'log aktivitas tercatat');
end $$;
