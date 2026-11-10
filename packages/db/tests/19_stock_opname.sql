-- Stok opname (migrasi 0015): draf, selesai membuat penyesuaian sebesar selisih, final terkunci, hanya pemilik/manajer.
create or replace function pg_temp.ok4(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails4(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); loc uuid := pos.outlet_location(ctx('out1')); bean uuid := ctx('bean'); air uuid := ctx('air');
  mgr uuid := gen_random_uuid(); cashier uuid := gen_random_uuid(); oid uuid := gen_random_uuid(); oid2 uuid := gen_random_uuid();
  r jsonb; q_bean numeric; q_air numeric; a_air numeric; svc uuid; n1 text; n2 text; mv stock_movements%rowtype;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-opn@x'), (cashier, 'cashier-opn@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cashier, 'cashier');
  insert into products(org_id, kind, name, is_sellable, track_stock) values (o1, 'service', 'Jasa opname', true, true) returning id into svc;
  -- saldo awal yang pasti positif, apa pun yang dilakukan tes sebelumnya
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, source_key) values
    (o1, loc, bean, 'adjust_in', 1000, 200, 'opn-setup-bean'), (o1, loc, air, 'adjust_in', 100, 2000, 'opn-setup-air');
  select qty into q_bean from stock_balances where location_id = loc and product_id = bean;
  select qty, avg_cost into q_air, a_air from stock_balances where location_id = loc and product_id = air;

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;

  -- buat draf: jumlah sistem dicatat dari saldo saat itu
  r := pos.stock_opname_save(oid, loc, 'hitung akhir bulan', jsonb_build_array(
    jsonb_build_object('product_id', bean, 'counted_qty', q_bean - 40), jsonb_build_object('product_id', air, 'counted_qty', q_air + 3)));
  n1 := r->>'number';
  perform pg_temp.ok4(n1 like 'OPN-%' and (r->>'lines')::int = 2, 'draf dibuat: ' || r::text);
  perform pg_temp.ok4((select system_qty from stock_opname_lines where opname_id = oid and product_id = bean) = q_bean, 'jumlah sistem tercatat');
  perform pg_temp.ok4((select difference from stock_opname_lines where opname_id = oid and product_id = bean) = -40, 'selisih -40');

  -- simpan ulang draf: jumlah sistem tetap, jumlah fisik berubah, baris yang hilang dari daftar dihapus
  r := pos.stock_opname_save(oid, loc, 'hitung akhir bulan', jsonb_build_array(jsonb_build_object('product_id', bean, 'counted_qty', q_bean - 30), jsonb_build_object('product_id', air, 'counted_qty', q_air + 3)));
  perform pg_temp.ok4((select counted_qty from stock_opname_lines where opname_id = oid and product_id = bean) = q_bean - 30, 'jumlah fisik diperbarui');
  r := pos.stock_opname_save(oid, loc, null, jsonb_build_array(jsonb_build_object('product_id', bean, 'counted_qty', q_bean - 30)));
  perform pg_temp.ok4((select count(*) from stock_opname_lines where opname_id = oid) = 1, 'baris yang dibuang dihapus');
  r := pos.stock_opname_save(oid, loc, null, jsonb_build_array(jsonb_build_object('product_id', bean, 'counted_qty', q_bean - 30), jsonb_build_object('product_id', air, 'counted_qty', q_air + 3)));

  -- penjualan terjadi setelah dihitung: selisih tetap dari jumlah sistem saat dihitung
  reset role;
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, ref_type, source_key) values (o1, loc, bean, 'sale', -5, 'order', 'opname-test-sale');
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;

  -- masukan salah
  perform pg_temp.ok4(pg_temp.fails4(format('select pos.stock_opname_save(%L,%L,null,%L::jsonb)', gen_random_uuid(), loc, '[{"product_id":"' || bean || '","counted_qty":-1}]')), 'jumlah negatif ditolak');
  perform pg_temp.ok4(pg_temp.fails4(format('select pos.stock_opname_save(%L,%L,null,%L::jsonb)', gen_random_uuid(), loc, '[{"product_id":"' || bean || '","counted_qty":1.00001}]')), '5 desimal ditolak');
  perform pg_temp.ok4(pg_temp.fails4(format('select pos.stock_opname_save(%L,%L,null,%L::jsonb)', gen_random_uuid(), loc, '[{"product_id":"' || svc || '","counted_qty":1}]')), 'jasa ditolak');
  perform pg_temp.ok4(pg_temp.fails4(format('select pos.stock_opname_save(%L,%L,null,%L::jsonb)', gen_random_uuid(), loc, '[{"product_id":"' || bean || '","counted_qty":1},{"product_id":"' || bean || '","counted_qty":2}]')), 'produk ganda ditolak');
  perform pg_temp.ok4(pg_temp.fails4(format('select pos.stock_opname_finalize(%L)', gen_random_uuid())), 'opname tak dikenal ditolak');
  perform pg_temp.ok4((select count(*) from stock_opnames where org_id = o1) = 1, 'penolakan tidak meninggalkan draf');

  -- kasir tidak boleh; status final tidak bisa dipaksa lewat update
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  perform pg_temp.ok4(pg_temp.fails4(format('select pos.stock_opname_save(%L,%L,null,%L::jsonb)', gen_random_uuid(), loc, '[]')), 'kasir tidak boleh menyimpan');
  perform pg_temp.ok4(pg_temp.fails4(format('select pos.stock_opname_finalize(%L)', oid)), 'kasir tidak boleh menyelesaikan');
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  perform pg_temp.ok4(pg_temp.fails4(format('update stock_opnames set status = %L where id = %L', 'final', oid)), 'final tidak bisa dipaksa lewat update');

  -- selesai: penyesuaian sebesar selisih, bukan sebesar (fisik - saldo kini)
  r := pos.stock_opname_finalize(oid);
  perform pg_temp.ok4((r->>'adjusted')::int = 2, 'dua penyesuaian: ' || r::text);
  perform pg_temp.ok4((select qty from stock_balances where location_id = loc and product_id = bean) = q_bean - 5 - 30, 'saldo bean = awal - penjualan - selisih');
  perform pg_temp.ok4((select qty from stock_balances where location_id = loc and product_id = air) = q_air + 3, 'saldo air = awal + 3');
  select * into mv from stock_movements where source_key = 'opname:' || oid || ':' || air;
  perform pg_temp.ok4(mv.kind = 'opname_adjust' and mv.qty_delta = 3 and mv.unit_cost = a_air and mv.ref_type = 'opname' and mv.ref_id = oid, 'penyesuaian masuk memakai rata-rata saat ini');
  perform pg_temp.ok4((select status from stock_opnames where id = oid) = 'final' and (select finalized_at from stock_opnames where id = oid) is not null, 'status final');

  -- final terkunci
  perform pg_temp.ok4(pg_temp.fails4(format('select pos.stock_opname_finalize(%L)', oid)), 'tidak bisa diselesaikan dua kali');
  perform pg_temp.ok4(pg_temp.fails4(format('select pos.stock_opname_save(%L,%L,null,%L::jsonb)', oid, loc, '[]')), 'final tidak bisa disimpan ulang');
  perform pg_temp.ok4(pg_temp.fails4(format('delete from stock_opnames where id = %L', oid)), 'final tidak bisa dihapus');
  perform pg_temp.ok4(pg_temp.fails4(format('update stock_opname_lines set counted_qty = 0 where opname_id = %L', oid)), 'baris final tidak bisa diubah');
  perform pg_temp.ok4(pg_temp.fails4(format('delete from stock_opname_lines where opname_id = %L', oid)), 'baris final tidak bisa dihapus');
  perform pg_temp.ok4(pg_temp.fails4(format('insert into stock_opname_lines(opname_id, product_id, org_id, system_qty, counted_qty) values (%L,%L,%L,0,1)', oid, svc, o1)), 'baris baru di final ditolak');

  -- opname kedua: tanpa baris tidak bisa diselesaikan; draf boleh dihapus; selisih nol tidak membuat gerakan
  r := pos.stock_opname_save(oid2, loc, null, '[]'::jsonb);
  n2 := r->>'number';
  perform pg_temp.ok4(n2 <> n1, 'nomor berurutan: ' || n1 || ' lalu ' || n2);
  perform pg_temp.ok4(pg_temp.fails4(format('select pos.stock_opname_finalize(%L)', oid2)), 'tanpa baris ditolak');
  r := pos.stock_opname_save(oid2, loc, null, jsonb_build_array(jsonb_build_object('product_id', air, 'counted_qty', q_air + 3)));
  r := pos.stock_opname_finalize(oid2);
  perform pg_temp.ok4((r->>'adjusted')::int = 0, 'selisih nol = tanpa gerakan');
  reset role;
  delete from products where id = svc;
exception when others then
  reset role;
  raise;
end $$;
