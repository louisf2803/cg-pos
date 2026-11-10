-- Komplimen (migrasi 0019): metode gratis wajib alasan >= 3 karakter, referensi maksimal 120, spasi tepi dipangkas.
create or replace function pg_temp.ok6(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1'); dev uuid := ctx('dev'); ud uuid := ctx('ud');
  oid uuid := gen_random_uuid(); i1 uuid := gen_random_uuid(); i2 uuid := gen_random_uuid();
  free uuid; cash uuid; pfx text; v jsonb; pl jsonb; pid uuid := gen_random_uuid();
begin
  select o.code || '/' || d.code || '/' into pfx from devices d join outlets o on o.id = d.outlet_id where d.id = dev;
  select id into free from payment_methods where org_id = o1 and code = 'FREE';
  select id into cash from payment_methods where org_id = o1 and code = 'CASH';
  perform pg_temp.ok6(free is not null, 'metode FREE ada');

  perform set_config('request.jwt.claim.sub', ud::text, true);
  pl := jsonb_build_object('id', oid, 'number', pfx || '261110/961', 'order_type', 'dine_in', 'cashier_id', ctx('emp'), 'opened_at', now(), 'client_created_at', now(),
    'subtotal', 40000, 'discount_total', 0, 'service_charge', 0, 'tax_total', 0, 'rounding', 0, 'total', 40000, 'base_version', null,
    'items', jsonb_build_array(
      jsonb_build_object('id', i1, 'product_id', ctx('kopi'), 'product_unit_id', ctx('pu_kopi'), 'name', 'Kopi', 'qty', 1, 'unit_price', 25000, 'extras_total', 0, 'discount', 0, 'tax_amount', 0, 'line_total', 25000, 'sort', 0),
      jsonb_build_object('id', i2, 'product_id', ctx('air'), 'product_unit_id', ctx('pu_air'), 'name', 'Air', 'qty', 1, 'unit_price', 15000, 'extras_total', 0, 'discount', 0, 'tax_amount', 0, 'line_total', 15000, 'sort', 1)),
    'discounts', '[]'::jsonb, 'tax_lines', '[]'::jsonb);
  v := pos.sync_push(dev, jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'payload', pl)));
  perform pg_temp.ok6(v->0->>'status' = 'applied', 'pesanan tersimpan: ' || v::text);

  -- gratis tanpa alasan ditolak
  v := pos.sync_push(dev, jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'payment.add', 'payload',
    jsonb_build_object('id', gen_random_uuid(), 'order_id', oid, 'method_id', free, 'amount', 25000, 'paid_at', now()))));
  perform pg_temp.ok6(v->0->>'status' = 'rejected' and v->0->>'error' like '%complimentary_reason_required%', 'gratis tanpa alasan ditolak: ' || v::text);

  -- alasan terlalu pendek setelah dipangkas
  v := pos.sync_push(dev, jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'payment.add', 'payload',
    jsonb_build_object('id', gen_random_uuid(), 'order_id', oid, 'method_id', free, 'amount', 25000, 'paid_at', now(), 'reference', '  ab  '))));
  perform pg_temp.ok6(v->0->>'status' = 'rejected', 'alasan dua huruf ditolak: ' || v::text);

  -- alasan kosong/spasi saja ditolak
  v := pos.sync_push(dev, jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'payment.add', 'payload',
    jsonb_build_object('id', gen_random_uuid(), 'order_id', oid, 'method_id', free, 'amount', 25000, 'paid_at', now(), 'reference', '     '))));
  perform pg_temp.ok6(v->0->>'status' = 'rejected', 'alasan spasi saja ditolak');
  perform pg_temp.ok6((select count(*) from payments where order_id = oid) = 0, 'belum ada pembayaran tersimpan');

  -- gratis dengan alasan sah diterima dan alasan dipangkas
  v := pos.sync_push(dev, jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'payment.add', 'payload',
    jsonb_build_object('id', pid, 'order_id', oid, 'method_id', free, 'amount', 25000, 'paid_at', now(), 'reference', '  Uji rasa menu baru  '))));
  perform pg_temp.ok6(v->0->>'status' = 'applied', 'gratis beralasan diterima: ' || v::text);
  perform pg_temp.ok6((select reference from payments where id = pid) = 'Uji rasa menu baru', 'alasan tersimpan dan dipangkas');

  -- referensi terlalu panjang ditolak untuk metode apa pun
  v := pos.sync_push(dev, jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'payment.add', 'payload',
    jsonb_build_object('id', gen_random_uuid(), 'order_id', oid, 'method_id', cash, 'amount', 15000, 'tendered', 15000, 'paid_at', now(), 'reference', repeat('x', 121)))));
  perform pg_temp.ok6(v->0->>'status' = 'rejected' and v->0->>'error' like '%reference_too_long%', 'referensi 121 karakter ditolak: ' || v::text);

  -- tunai tanpa referensi tetap normal
  v := pos.sync_push(dev, jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'payment.add', 'payload',
    jsonb_build_object('id', gen_random_uuid(), 'order_id', oid, 'method_id', cash, 'amount', 15000, 'tendered', 20000, 'paid_at', now()))));
  perform pg_temp.ok6(v->0->>'status' = 'applied', 'tunai tanpa referensi diterima: ' || v::text);
  perform pg_temp.ok6((select count(*) from payments where order_id = oid) = 2, 'dua pembayaran tersimpan');

  -- mengubah alasan komplimen menjadi kosong lewat UPDATE juga ditolak
  begin
    update payments set reference = null where id = pid;
    raise exception 'ASSERT GAGAL: ubah alasan komplimen jadi kosong seharusnya ditolak';
  exception when others then
    if sqlerrm like 'ASSERT GAGAL%' then raise; end if;
    perform pg_temp.ok6(sqlerrm like '%complimentary_reason_required%', 'galat benar saat ubah alasan: ' || sqlerrm);
  end;
end $$;
