-- Mode harga sudah termasuk pajak (migrasi 0012): harga menu 22.000 x 2 = 44.000, PB1 10% di dalamnya (pajak 4.000, bersih 40.000).
-- Aturan: inklusif (tax_inclusive=true) -> qty x unit_price + extras - discount - tax_amount = line_total; eksklusif tetap seperti dulu.
create or replace function pg_temp.pl(p_num text, p_incl boolean, p_line_tax numeric) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('id', gen_random_uuid(), 'number', p_num, 'order_type', 'takeaway', 'cashier_id', ctx('emp'),
    'opened_at', now(), 'client_created_at', now(), 'subtotal', 40000, 'discount_total', 0, 'service_charge', 0, 'tax_total', 4000, 'rounding', 0, 'total', 44000,
    'tax_inclusive', case when p_incl then true end,
    'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'product_id', ctx('kopi'), 'product_unit_id', ctx('pu_kopi'), 'name', 'Kopi', 'qty', 2, 'unit_price', 22000,
        'extras_total', 0, 'discount', 0, 'tax_amount', p_line_tax, 'line_total', 40000, 'sort', 0)),
    'discounts', '[]'::jsonb, 'tax_lines', jsonb_build_array(jsonb_build_object('name', 'PB1', 'rate', 10, 'base_amount', 40000, 'amount', 4000))));
$$;
do $$
declare
  pfx text; v jsonb; r1 jsonb; r2 jsonb; r3 jsonb; oid uuid;
begin
  select o.code || '/' || d.code || '/' into pfx from devices d join outlets o on o.id = d.outlet_id where d.id = ctx('dev');
  perform set_config('request.jwt.claim.sub', ctx('ud')::text, true);
  r1 := pg_temp.pl(pfx || '261110/901', true, 4000);    -- inklusif benar
  r2 := pg_temp.pl(pfx || '261110/902', false, 4000);   -- angka inklusif tanpa bendera
  r3 := pg_temp.pl(pfx || '261110/903', true, 3000);    -- inklusif dengan pajak baris salah
  v := pos.sync_push(ctx('dev'), jsonb_build_array(
    jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', r1->>'id', 'payload', r1),
    jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', r2->>'id', 'payload', r2),
    jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', r3->>'id', 'payload', r3)));
  if v->0->>'status' <> 'applied' then raise exception 'ASSERT GAGAL: pesanan inklusif ditolak: %', v->0; end if;
  if coalesce(v->1->>'error', '') not like '%inconsistent%' then raise exception 'ASSERT GAGAL: angka inklusif tanpa bendera harus ditolak: %', v->1; end if;
  if coalesce(v->2->>'error', '') not like '%inconsistent%' then raise exception 'ASSERT GAGAL: pajak baris inklusif yang salah harus ditolak: %', v->2; end if;
  oid := (r1->>'id')::uuid;
  if not (select tax_inclusive and subtotal = 40000 and tax_total = 4000 and total = 44000 from orders where id = oid) then
    raise exception 'ASSERT GAGAL: bendera/angka pesanan inklusif tersimpan';
  end if;
  if (select count(*) from orders where id in ((r2->>'id')::uuid, (r3->>'id')::uuid)) <> 0 then raise exception 'ASSERT GAGAL: pesanan yang ditolak tidak boleh tersimpan'; end if;
  -- upsert ulang pesanan terbuka (mis. ganti pembulatan) tetap diterima dan bendera tetap
  r1 := r1 || jsonb_build_object('base_version', 1);
  v := pos.sync_push(ctx('dev'), jsonb_build_array(jsonb_build_object('op_id', gen_random_uuid(), 'type', 'order.upsert', 'entity_id', oid, 'payload', r1)));
  if v->0->>'status' <> 'applied' then raise exception 'ASSERT GAGAL: upsert ulang inklusif ditolak: %', v->0; end if;
  if not (select tax_inclusive from orders where id = oid) then raise exception 'ASSERT GAGAL: bendera hilang setelah upsert ulang'; end if;
end $$;
