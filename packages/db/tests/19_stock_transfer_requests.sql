-- Permintaan barang (migrasi 0042): buat (idempoten), setujui/tolak final, dipenuhi membuat transfer stok yang benar, batal, hanya pengelola, org lain tidak melihat.
create or replace function pg_temp.ok42(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails42(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return want is null or sqlerrm = want;
end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); loc uuid := pos.outlet_location(ctx('out1')); bean uuid := ctx('bean'); air uuid := ctx('air');
  mgr uuid := gen_random_uuid(); cashier uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  wh uuid; wh2 uuid; svc uuid; r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid(); t1 uuid := gen_random_uuid(); r jsonb;
  lines jsonb;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-srq@x'), (cashier, 'cashier-srq@x'), (stranger, 'stranger-srq@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cashier, 'cashier'), (o2, stranger, 'owner');
  insert into locations(org_id, name, kind) values (o1, 'Gudang pusat', 'warehouse') returning id into wh;
  insert into locations(org_id, name, kind) values (o2, 'Gudang org lain', 'warehouse') returning id into wh2;
  insert into products(org_id, kind, name, is_sellable, track_stock) values (o1, 'service', 'Jasa permintaan', true, true) returning id into svc;
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, source_key) values
    (o1, wh, bean, 'adjust_in', 800, 300, 'srq-setup-bean'), (o1, wh, air, 'adjust_in', 60, 2000, 'srq-setup-air');
  lines := jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 120), jsonb_build_object('product_id', air, 'qty', 10));

  -- kasir, orang luar, dan tanpa login ditolak
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh, lines), 'not allowed'), 'kasir tidak boleh meminta');
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh, lines), 'not allowed'), 'org lain tidak boleh meminta');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh, lines), 'no access'), 'tanpa login ditolak');

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  -- galat masukan
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, loc, lines), 'from and to must differ'), 'asal = tujuan ditolak');
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh2, lines), 'locations belong to different organizations'), 'lintas organisasi ditolak');
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_create(%L, %L, %L, null, ''[]''::jsonb)', gen_random_uuid(), loc, wh), 'lines required'), 'tanpa baris ditolak');
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh, jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 0))), 'invalid line'), 'jumlah 0 ditolak');
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh, jsonb_build_array(jsonb_build_object('product_id', bean, 'qty', 1), jsonb_build_object('product_id', bean, 'qty', 2))), 'duplicate product in lines'), 'produk ganda ditolak');
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_create(%L, %L, %L, null, %L::jsonb)', gen_random_uuid(), loc, wh, jsonb_build_array(jsonb_build_object('product_id', svc, 'qty', 1))), 'product does not track stock'), 'jasa tidak dilacak ditolak');
  perform pg_temp.ok42((select count(*) from stock_requests where org_id = o1) = 0, 'penolakan tidak meninggalkan permintaan');

  -- buat, idempoten
  r := pos.stock_request_create(r1, loc, wh, 'stok bar menipis', lines);
  perform pg_temp.ok42(r->>'status' = 'requested' and (r->>'lines')::int = 2 and (r->>'number') like 'REQ-%' and not (r->>'duplicate')::boolean, 'permintaan dibuat dengan nomor REQ-');
  perform pg_temp.ok42((pos.stock_request_create(r1, loc, wh, null, lines)->>'duplicate')::boolean, 'idempoten menurut id');
  perform pg_temp.ok42((select count(*) from stock_request_lines where request_id = r1) = 2, 'baris tidak ganda');
  -- belum disetujui tidak bisa dipenuhi
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_fulfill(%L, %L)', r1, t1), 'request not approved'), 'belum disetujui tidak bisa dipenuhi');
  -- setujui lalu final
  perform pg_temp.ok42(pos.stock_request_decide(r1, true, 'oke')->>'status' = 'approved', 'disetujui');
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_decide(%L, false, null)', r1), 'request already decided'), 'keputusan final');
  -- penuhi: transfer stok keluar dari gudang
  r := pos.stock_request_fulfill(r1, t1);
  perform pg_temp.ok42(r->>'status' = 'fulfilled' and (r->>'transfer_number') like 'TRF-%', 'dipenuhi membuat transfer');
  perform pg_temp.ok42((select qty from stock_balances where location_id = wh and product_id = bean) = 680 and (select qty from stock_balances where location_id = wh and product_id = air) = 50, 'stok sumber berkurang sebesar permintaan');
  perform pg_temp.ok42((select status from stock_transfers where id = t1) = 'in_transit' and (select count(*) from stock_transfer_lines where transfer_id = t1) = 2, 'transfer dalam perjalanan dengan dua baris');
  perform pg_temp.ok42((select transfer_id from stock_requests where id = r1) = t1, 'permintaan menautkan transfer');
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_fulfill(%L, %L)', r1, gen_random_uuid()), 'request not approved'), 'tidak bisa dipenuhi dua kali');
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_cancel(%L)', r1), 'request already decided'), 'yang sudah dipenuhi tidak bisa dibatalkan');

  -- tolak dan batal
  perform pos.stock_request_create(r2, loc, wh, null, lines);
  perform pg_temp.ok42(pos.stock_request_decide(r2, false, 'stok pusat habis')->>'status' = 'rejected', 'ditolak');
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_fulfill(%L, %L)', r2, gen_random_uuid()), 'request not approved'), 'yang ditolak tidak bisa dipenuhi');
  perform pos.stock_request_create(r3, loc, wh, null, lines);
  perform pg_temp.ok42(pos.stock_request_cancel(r3)->>'status' = 'cancelled', 'dibatalkan');
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_decide(%L, true, null)', r3), 'request already decided'), 'yang dibatalkan tidak bisa disetujui');
  set local role authenticated;
  perform pg_temp.ok42(pg_temp.fails42(format('update pos.stock_requests set status = ''fulfilled'' where id = %L', r3), 'permission denied for table stock_requests') and pg_temp.fails42(format('insert into pos.stock_requests(org_id, number, requester_location_id, source_location_id) values (%L, ''X'', %L, %L)', o1, loc, wh), null), 'klien tidak boleh menulis tabel langsung');
  reset role;

  -- keterbacaan (sebagai peran authenticated agar RLS berlaku)
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pg_temp.ok42((select count(*) from pos.stock_requests) = 3 and (select count(*) from pos.stock_request_lines) = 6, 'manajer membaca permintaan org sendiri');
  reset role;
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  set local role authenticated;
  perform pg_temp.ok42((select count(*) from pos.stock_requests) = 0 and (select count(*) from pos.stock_request_lines) = 0, 'kasir tidak melihat permintaan');
  reset role;
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  set local role authenticated;
  perform pg_temp.ok42((select count(*) from pos.stock_requests) = 0, 'org lain tidak melihat permintaan');
  perform pg_temp.ok42(pg_temp.fails42(format('select pos.stock_request_decide(%L, true, null)', r2), 'not allowed'), 'org lain tidak boleh memutuskan');
  reset role;
end $$;
