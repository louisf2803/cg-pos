-- Stasiun cetak (migrasi 0029): CRUD lewat RLS, pemetaan produk, kirim otomatis hanya baris bersasis stasiun, daftar baris baru, papan dapur.
create or replace function pg_temp.ok6(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); out1 uuid := ctx('out1'); dev uuid := ctx('dev'); ud uuid := ctx('ud');
  mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  dapur uuid := gen_random_uuid(); bar uuid := gen_random_uuid(); mati uuid := gen_random_uuid();
  oid uuid := gen_random_uuid(); i1 uuid := gen_random_uuid(); i2 uuid := gen_random_uuid(); i3 uuid := gen_random_uuid();
  pfx text; v jsonb; r jsonb; pl jsonb; ok boolean; n int;
begin
  select o.code || '/' || d.code || '/' into pfx from devices d join outlets o on o.id = d.outlet_id where d.id = dev;
  insert into auth.users(id, email) values (mgr, 'mgr-st@x'), (cash, 'cash-st@x'), (other, 'other-st@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cash, 'cashier'), (o2, other, 'owner');
  insert into member_outlets(org_id, user_id, outlet_id) values (o1, mgr, out1), (o1, cash, out1);

  -- manajer boleh membuat stasiun; kasir tidak; org lain tidak melihat
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  insert into pos.print_stations(id, org_id, outlet_id, name, print_mode, template) values (dapur, o1, out1, 'Dapur Utama', 'auto', '{"title":"CHECKER DAPUR","showTable":true}');
  insert into pos.print_stations(id, org_id, outlet_id, name, kind, copies, paper) values (bar, o1, out1, 'Bar', 'checker', 2, '80');
  insert into pos.print_stations(id, org_id, outlet_id, name, is_active) values (mati, o1, out1, 'Lama', false);
  reset role;
  perform pg_temp.ok6((select count(*) from print_stations where org_id = o1) >= 3, 'tiga stasiun tersimpan');
  perform pg_temp.ok6((select print_mode from print_stations where id = bar) = 'ask', 'mode cetak bawaan: tanya dulu');

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  begin insert into pos.print_stations(org_id, outlet_id, name) values (o1, out1, 'Dilarang'); ok := false; exception when others then ok := true; end;
  perform pg_temp.ok6((select count(*) from pos.print_stations where org_id = o1) >= 3, 'kasir boleh membaca stasiun');
  reset role;
  perform pg_temp.ok6(ok, 'kasir tidak boleh membuat stasiun');

  perform set_config('request.jwt.claim.sub', other::text, true);
  set local role authenticated;
  select count(*) into n from pos.print_stations where org_id = o1;
  reset role;
  perform pg_temp.ok6(n = 0, 'org lain tidak melihat stasiun');

  -- validasi
  begin insert into print_stations(org_id, outlet_id, name) values (o1, out1, 'DAPUR UTAMA'); ok := false; exception when unique_violation then ok := true; end;
  perform pg_temp.ok6(ok, 'nama stasiun unik per outlet (tanpa peduli huruf besar)');
  begin insert into print_stations(org_id, outlet_id, name, print_mode) values (o1, out1, 'X1', 'semua'); ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ok6(ok, 'mode cetak tidak dikenal ditolak');
  begin insert into print_stations(org_id, outlet_id, name, copies) values (o1, out1, 'X2', 9); ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ok6(ok, 'salinan > 5 ditolak');
  begin insert into print_stations(org_id, outlet_id, name, template) values (o1, out1, 'X3', '[1]'); ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ok6(ok, 'template harus objek');
  begin insert into print_stations(org_id, outlet_id, name) values (o1, out1, '   '); ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ok6(ok, 'nama kosong ditolak');

  -- pemetaan produk: Kopi → Dapur, Air → stasiun nonaktif; produk lain tanpa stasiun
  update products set print_station_id = dapur where id = ctx('kopi');
  update products set print_station_id = mati where id = ctx('air');

  perform set_config('request.jwt.claim.sub', ud::text, true);
  pl := jsonb_build_object('id', oid, 'number', pfx || '261110/988', 'order_type', 'dine_in', 'cashier_id', ctx('emp'), 'opened_at', now(), 'client_created_at', now(),
    'subtotal', 60000, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', 60000, 'base_version', null,
    'items', jsonb_build_array(
      jsonb_build_object('id', i1, 'product_id', ctx('kopi'), 'product_unit_id', ctx('pu_kopi'), 'name', 'Kopi', 'qty', 2, 'unit_price', 25000, 'extras_total', 0, 'discount', 0, 'tax_amount', 0, 'line_total', 50000, 'sort', 0, 'note', 'tanpa gula'),
      jsonb_build_object('id', i2, 'product_id', ctx('air'), 'product_unit_id', ctx('pu_air'), 'name', 'Air', 'qty', 1, 'unit_price', 5000, 'extras_total', 0, 'discount', 0, 'tax_amount', 0, 'line_total', 5000, 'sort', 1),
      jsonb_build_object('id', i3, 'product_id', ctx('bean'), 'product_unit_id', (select id from product_units where product_id = ctx('bean') limit 1), 'name', 'Biji', 'qty', 1, 'unit_price', 5000, 'extras_total', 0, 'discount', 0, 'tax_amount', 0, 'line_total', 5000, 'sort', 2)),
    'discounts', '[]'::jsonb, 'tax_lines', '[]'::jsonb);
  v := pos.sync_push(dev, jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'payload', pl)));
  perform pg_temp.ok6(v->0->>'status' = 'applied', 'pesanan tersimpan: ' || v::text);

  r := pos.kitchen_send(oid, dev);
  perform pg_temp.ok6((r->>'sent')::int = 1, 'hanya satu baris bersasis stasiun aktif yang diteruskan: ' || r::text);
  perform pg_temp.ok6((r->'lines'->0->>'itemId')::uuid = i1 and (r->'lines'->0->>'stationId')::uuid = dapur, 'baris yang dikembalikan: item dan stasiunnya');
  perform pg_temp.ok6((r->'lines'->0->>'name') = 'Kopi' and (r->'lines'->0->>'qty')::numeric = 2 and (r->'lines'->0->>'note') = 'tanpa gula', 'nama, jumlah, catatan ikut');
  perform pg_temp.ok6(jsonb_typeof(r->'lines'->0->'extras') = 'array', 'ekstra berupa larik');
  r := pos.kitchen_send(oid, dev);
  perform pg_temp.ok6((r->>'sent')::int = 0 and jsonb_array_length(r->'lines') = 0, 'kirim ulang tidak mengembalikan baris lagi');
  perform pg_temp.ok6((select station_id from kitchen_items where item_id = i1) = dapur, 'stasiun tercatat di baris dapur');
  perform pg_temp.ok6(not exists (select 1 from kitchen_items where item_id in (i2, i3)), 'baris tanpa stasiun / stasiun nonaktif tidak diteruskan');

  -- tambah stasiun untuk Air setelah itu: kirim berikutnya meneruskan baris tsb
  update print_stations set is_active = true where id = mati;
  r := pos.kitchen_send(oid, dev);
  perform pg_temp.ok6((r->>'sent')::int = 1 and (r->'lines'->0->>'itemId')::uuid = i2, 'baris yang stasiunnya baru diaktifkan ikut terkirim');

  -- papan memuat station_id
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  perform pg_temp.ok6((select station_id from pos.kitchen_board(out1) where item_id = i1) = dapur, 'papan dapur memuat station_id');

  -- hapus stasiun: produk kembali tanpa stasiun
  delete from print_stations where id = dapur;
  perform pg_temp.ok6((select print_station_id from products where id = ctx('kopi')) is null, 'hapus stasiun melepas produk');

  -- stasiun outlet lain tidak dipakai produk org ini: FK org+id menolak stasiun org lain
  begin update products set print_station_id = (select id from print_stations where org_id = o2 limit 1) where id = ctx('kopi'); ok := true; exception when foreign_key_violation then ok := true; end;
  perform pg_temp.ok6(ok, 'pemetaan lintas org tidak berlaku');
end $$;
