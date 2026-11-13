-- 21_tax_per_product_and_order_types.sql
-- Uji pajak per produk dan jenis order

begin;

select plan(5);

-- 1. Verifikasi kolom tax_rate pada pos.products
select has_column('pos', 'products', 'tax_rate', 'Tabel pos.products memiliki kolom tax_rate');

-- 2. Verifikasi kolom order_type_rates pada pos.taxes
select has_column('pos', 'taxes', 'order_type_rates', 'Tabel pos.taxes memiliki kolom order_type_rates');

-- 3. Verifikasi fungsi pos.tax_settings_save ada
select has_function('pos', 'tax_settings_save', array['uuid', 'text', 'numeric', 'boolean', 'boolean', 'text', 'text[]', 'jsonb'], 'Fungsi pos.tax_settings_save terdaftar');

-- 4. Test insert/update produk dengan custom tax_rate
do $$
declare
  v_org_id uuid;
  v_prod_id uuid := gen_random_uuid();
begin
  select id into v_org_id from pos.orgs limit 1;
  insert into pos.products (id, org_id, name, kind, price, tax_rate)
  values (v_prod_id, v_org_id, 'Kopi Bebas Pajak', 'goods', 15000, 0);

  if not exists (select 1 from pos.products where id = v_prod_id and tax_rate = 0) then
    raise exception 'tax_rate 0 gagal disimpan';
  end if;

  update pos.products set tax_rate = 5.5 where id = v_prod_id;
  if not exists (select 1 from pos.products where id = v_prod_id and tax_rate = 5.5) then
    raise exception 'tax_rate 5.5 gagal diperbarui';
  end if;
end $$;

select pass('Simpan dan update tax_rate produk berhasil');

-- 5. Test RPC pos.tax_settings_save
do $$
declare
  v_outlet_id uuid;
begin
  select id into v_outlet_id from pos.outlets limit 1;
  perform pos.tax_settings_save(
    v_outlet_id,
    'PB1 Dine-in Only',
    10,
    true,
    false,
    'per_product',
    array['dine_in']::text[],
    '{"dine_in": 10, "takeaway": 0}'::jsonb
  );

  if not exists (
    select 1 from pos.outlet_settings
    where outlet_id = v_outlet_id and tax_mode = 'per_product' and tax_calc = 'after_discount'
  ) then
    raise exception 'outlet_settings gagal diperbarui via tax_settings_save';
  end if;
end $$;

select pass('RPC pos.tax_settings_save berhasil dieksekusi');

rollback;
