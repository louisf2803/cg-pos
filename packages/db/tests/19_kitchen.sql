-- Layar dapur (migrasi 0018): kirim per baris (idempoten), status maju/mundur, papan per outlet, status bertahan saat pesanan disimpan ulang.
create or replace function pg_temp.ok5(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails5(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); out1 uuid := ctx('out1'); dev uuid := ctx('dev'); ud uuid := ctx('ud');
  oid uuid := gen_random_uuid(); i1 uuid := gen_random_uuid(); i2 uuid := gen_random_uuid(); i3 uuid := gen_random_uuid();
  mgr uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); stn uuid := gen_random_uuid();
  pfx text; v jsonb; r jsonb; n int; pl jsonb;
begin
  select o.code || '/' || d.code || '/' into pfx from devices d join outlets o on o.id = d.outlet_id where d.id = dev;
  insert into auth.users(id, email) values (mgr, 'mgr-kds@x'), (stranger, 'stranger-kds@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o2, stranger, 'owner');
  insert into member_outlets(org_id, user_id, outlet_id) values (o1, mgr, out1);

  -- sejak 0029 hanya produk yang punya stasiun yang diteruskan ke dapur
  insert into print_stations(id, org_id, outlet_id, name) values (stn, o1, out1, 'Dapur');
  update products set print_station_id = stn where id in (ctx('kopi'), ctx('air'));

  perform set_config('request.jwt.claim.sub', ud::text, true);
  pl := jsonb_build_object('id', oid, 'number', pfx || '261110/951', 'order_type', 'dine_in', 'cashier_id', ctx('emp'), 'opened_at', now(), 'client_created_at', now(),
    'subtotal', 40000, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', 40000, 'base_version', null,
    'items', jsonb_build_array(
      jsonb_build_object('id', i1, 'product_id', ctx('kopi'), 'product_unit_id', ctx('pu_kopi'), 'name', 'Kopi', 'qty', 1, 'unit_price', 25000, 'extras_total', 0, 'discount', 0, 'tax_amount', 0, 'line_total', 25000, 'sort', 0, 'note', 'tanpa gula'),
      jsonb_build_object('id', i2, 'product_id', ctx('air'), 'product_unit_id', ctx('pu_air'), 'name', 'Air', 'qty', 1, 'unit_price', 15000, 'extras_total', 0, 'discount', 0, 'tax_amount', 0, 'line_total', 15000, 'sort', 1)),
    'discounts', '[]'::jsonb, 'tax_lines', '[]'::jsonb);
  v := pos.sync_push(dev, jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'payload', pl)));
  perform pg_temp.ok5(v->0->>'status' = 'applied', 'pesanan tersimpan: ' || v::text);

  -- kirim ke dapur dari perangkat kasir
  r := pos.kitchen_send(oid, dev);
  perform pg_temp.ok5((r->>'sent')::int = 2, 'dua baris terkirim: ' || r::text);
  r := pos.kitchen_send(oid, dev);
  perform pg_temp.ok5((r->>'sent')::int = 0, 'kirim ulang tidak menggandakan');
  perform pg_temp.ok5((select count(*) from kitchen_items where order_id = oid) = 2, 'tepat dua baris dapur');
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.kitchen_send(%L, %L)', oid, gen_random_uuid())), 'perangkat tak dikenal ditolak');
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.kitchen_send(%L, null)', oid)), 'akun perangkat tanpa id perangkat tidak boleh lewat jalur staf');

  -- tambah baris setelah dikirim, simpan ulang: status baris lama bertahan, baris baru ikut terkirim berikutnya
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  r := pos.kitchen_set_status(array[i1], 'preparing');
  perform pg_temp.ok5((r->>'changed')::int = 1, 'status berubah');
  perform set_config('request.jwt.claim.sub', ud::text, true);
  pl := pl || jsonb_build_object('base_version', 1, 'subtotal', 60000, 'total', 60000,
    'items', (pl->'items') || jsonb_build_array(jsonb_build_object('id', i3, 'product_id', ctx('kopi'), 'product_unit_id', ctx('pu_kopi'), 'name', 'Kopi susu', 'qty', 1, 'unit_price', 20000, 'extras_total', 0, 'discount', 0, 'tax_amount', 0, 'line_total', 20000, 'sort', 2)));
  v := pos.sync_push(dev, jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'payload', pl)));
  perform pg_temp.ok5(v->0->>'status' = 'applied', 'pesanan disimpan ulang: ' || v::text);
  perform pg_temp.ok5((select status from kitchen_items where item_id = i1) = 'preparing', 'status dapur bertahan setelah simpan ulang');
  r := pos.kitchen_send(oid, dev);
  perform pg_temp.ok5((r->>'sent')::int = 1, 'hanya baris baru yang terkirim: ' || r::text);

  -- papan dapur untuk staf outlet
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  select count(*) into n from pos.kitchen_board(out1);
  perform pg_temp.ok5(n = 3, 'papan memuat tiga baris: ' || n);
  perform pg_temp.ok5((select note from pos.kitchen_board(out1) where item_id = i1) = 'tanpa gula', 'catatan baris ikut');
  perform pg_temp.ok5((select order_number from pos.kitchen_board(out1) where item_id = i2) = pfx || '261110/951', 'nomor pesanan ikut');
  r := pos.kitchen_set_status(array[i1, i2], 'ready');
  perform pg_temp.ok5((r->>'changed')::int = 2, 'dua baris siap');
  r := pos.kitchen_set_status(array[i1, i2], 'served');
  perform pg_temp.ok5((select count(*) from pos.kitchen_board(out1)) = 1, 'baris disajikan hilang dari papan');
  perform pg_temp.ok5((select count(*) from pos.kitchen_board(out1, 60)) = 3, 'riwayat 60 menit menampilkan yang disajikan');
  r := pos.kitchen_set_status(array[i2], 'new');
  perform pg_temp.ok5((select status from kitchen_items where item_id = i2) = 'new', 'status boleh mundur');
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.kitchen_set_status(array[%L::uuid], %L)', i1, 'bubar')), 'status asing ditolak');
  perform pg_temp.ok5(pg_temp.fails5('select pos.kitchen_set_status(array[]::uuid[], ''ready'')'), 'tanpa baris ditolak');
  set local role authenticated;
  perform pg_temp.ok5(pg_temp.fails5(format('update kitchen_items set status = %L where item_id = %L', 'served', i3)), 'klien tidak boleh menulis langsung ke tabel dapur');
  perform pg_temp.ok5((select count(*) from kitchen_items where order_id = oid) = 3, 'staf outlet melihat tiga baris dapur (RLS)');
  reset role;
  perform pg_temp.ok5((select status from kitchen_items where item_id = i3) = 'new', 'status tidak berubah');

  -- org lain tidak melihat dan tidak mengubah
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform pg_temp.ok5(pg_temp.fails5(format('select * from pos.kitchen_board(%L)', out1)), 'org lain ditolak membaca papan');
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.kitchen_set_status(array[%L::uuid], %L)', i3, 'ready')), 'org lain ditolak mengubah status');
  perform pg_temp.ok5(pg_temp.fails5(format('select pos.kitchen_send(%L, null)', oid)), 'org lain ditolak mengirim');
  set local role authenticated;
  perform pg_temp.ok5((select count(*) from kitchen_items where order_id = oid) = 0, 'org lain tidak melihat baris dapur (RLS)');
  reset role;

  -- pesanan dibatalkan: hilang dari papan
  perform set_config('request.jwt.claim.sub', ud::text, true);
  reset role;
  update orders set status = 'void' where id = oid;
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  perform pg_temp.ok5((select count(*) from pos.kitchen_board(out1, 60)) = 0, 'pesanan batal tidak tampil di dapur');
  reset role;
  delete from kitchen_items where order_id = oid;
  delete from org_members where user_id in (mgr, stranger);
exception when others then
  reset role;
  raise;
end $$;
