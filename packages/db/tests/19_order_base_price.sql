-- Harga dasar item dan referensi diskon (migrasi 0034).
-- Aturan: base_price <> unit_price = override harga kasir -> produk harus allow_price_override dan selisih <= max_price_override_pct.
-- Tanpa base_price perilaku lama tidak berubah. reference diskon dipangkas (spasi) dan maks 60 huruf.
create or replace function pg_temp.pl34(p_num text, p_unit numeric, p_base numeric, p_ref text, p_free boolean default false) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('id', gen_random_uuid(), 'number', p_num, 'order_type', 'takeaway', 'cashier_id', ctx('emp'),
    'opened_at', now(), 'client_created_at', now(),
    'subtotal', 2 * p_unit, 'discount_total', case when p_ref is null then 0 else 1000 end, 'service_charge', 0, 'tax_total', 0, 'rounding', 0,
    'total', 2 * p_unit - case when p_ref is null then 0 else 1000 end,
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'product_id', ctx('kopi'), 'product_unit_id', ctx('pu_kopi'), 'name', 'Kopi', 'qty', 2, 'unit_price', p_unit,
        'base_price', p_base, 'extras_total', 0, 'discount', 0, 'tax_amount', 0, 'line_total', 2 * p_unit, 'is_free', p_free, 'sort', 0)),
    'discounts', case when p_ref is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'source', 'coupon', 'amount', 1000, 'points_used', 0, 'reference', p_ref)) end,
    'tax_lines', '[]'::jsonb));
$$;
do $$
declare
  pfx text; v jsonb; ok_pl jsonb; over_pl jsonb; plain_pl jsonb; ref_pl jsonb; long_pl jsonb; blank_pl jsonb; free_pl jsonb;
begin
  select o.code || '/' || d.code || '/' into pfx from devices d join outlets o on o.id = d.outlet_id where d.id = ctx('dev');
  perform set_config('request.jwt.claim.sub', ctx('ud')::text, true);

  -- produk Kopi: boleh ubah harga sampai 10 persen
  update products set allow_price_override = true, max_price_override_pct = 10 where id = ctx('kopi');

  ok_pl    := pg_temp.pl34(pfx || '261112/941', 20000, 22000, null);        -- turun 9,09 persen: boleh
  over_pl  := pg_temp.pl34(pfx || '261112/942', 18000, 22000, null);        -- turun 18,18 persen: melebihi batas
  plain_pl := pg_temp.pl34(pfx || '261112/943', 22000, null, null);         -- tanpa base_price: perilaku lama
  ref_pl   := pg_temp.pl34(pfx || '261112/944', 22000, 22000, '  CPN-2026-001  ');
  long_pl  := pg_temp.pl34(pfx || '261112/945', 22000, null, repeat('x', 100));
  blank_pl := pg_temp.pl34(pfx || '261112/946', 22000, null, '   ');
  free_pl  := pg_temp.pl34(pfx || '261112/947', 0, 22000, null, true);      -- item gratis tidak dianggap override

  v := pos.sync_push(ctx('dev'), jsonb_build_array(
    jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', ok_pl->>'id',    'payload', ok_pl),
    jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', over_pl->>'id',  'payload', over_pl),
    jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', plain_pl->>'id', 'payload', plain_pl),
    jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', ref_pl->>'id',   'payload', ref_pl),
    jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', long_pl->>'id',  'payload', long_pl),
    jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', blank_pl->>'id', 'payload', blank_pl),
    jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', free_pl->>'id',  'payload', free_pl)));

  if v->0->>'status' <> 'applied' then raise exception 'ASSERT GAGAL: override dalam batas ditolak: %', v->0; end if;
  if coalesce(v->1->>'error', '') not like '%price_override_exceeds_limit%' then raise exception 'ASSERT GAGAL: override melebihi batas harus ditolak: %', v->1; end if;
  if v->2->>'status' <> 'applied' then raise exception 'ASSERT GAGAL: tanpa base_price harus tetap diterima: %', v->2; end if;
  if v->3->>'status' <> 'applied' then raise exception 'ASSERT GAGAL: base_price = unit_price dengan referensi diskon ditolak: %', v->3; end if;
  if v->4->>'status' <> 'applied' then raise exception 'ASSERT GAGAL: referensi panjang ditolak: %', v->4; end if;
  if v->5->>'status' <> 'applied' then raise exception 'ASSERT GAGAL: referensi kosong ditolak: %', v->5; end if;
  if v->6->>'status' <> 'applied' then raise exception 'ASSERT GAGAL: item gratis dengan base_price ditolak: %', v->6; end if;

  if (select base_price from order_items where order_id = (ok_pl->>'id')::uuid) is distinct from 22000 then raise exception 'ASSERT GAGAL: base_price tersimpan'; end if;
  if (select base_price from order_items where order_id = (plain_pl->>'id')::uuid) is not null then raise exception 'ASSERT GAGAL: tanpa base_price harus null'; end if;
  if (select count(*) from orders where id = (over_pl->>'id')::uuid) <> 0 then raise exception 'ASSERT GAGAL: pesanan ditolak tidak boleh tersimpan'; end if;
  if (select reference from order_discounts where order_id = (ref_pl->>'id')::uuid) is distinct from 'CPN-2026-001' then raise exception 'ASSERT GAGAL: referensi dipangkas dan tersimpan'; end if;
  if (select char_length(reference) from order_discounts where order_id = (long_pl->>'id')::uuid) <> 60 then raise exception 'ASSERT GAGAL: referensi dipotong 60 huruf'; end if;
  if (select reference from order_discounts where order_id = (blank_pl->>'id')::uuid) is not null then raise exception 'ASSERT GAGAL: referensi kosong jadi null'; end if;

  -- produk tidak mengizinkan ubah harga: override apa pun ditolak
  update products set allow_price_override = false where id = ctx('kopi');
  over_pl := pg_temp.pl34(pfx || '261112/948', 21000, 22000, null);
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', over_pl->>'id', 'payload', over_pl)));
  if coalesce(v->0->>'error', '') not like '%price_override_not_allowed%' then raise exception 'ASSERT GAGAL: produk tanpa izin ubah harga harus menolak override: %', v->0; end if;

  -- upsert ulang pesanan terbuka tetap menyimpan base_price (hapus lalu isi ulang item)
  update products set allow_price_override = true where id = ctx('kopi');
  ok_pl := ok_pl || jsonb_build_object('base_version', 1);
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', ok_pl->>'id', 'payload', ok_pl)));
  if v->0->>'status' <> 'applied' then raise exception 'ASSERT GAGAL: upsert ulang ditolak: %', v->0; end if;
  if (select base_price from order_items where order_id = (ok_pl->>'id')::uuid) is distinct from 22000 then raise exception 'ASSERT GAGAL: base_price hilang setelah upsert ulang'; end if;
end $$;
