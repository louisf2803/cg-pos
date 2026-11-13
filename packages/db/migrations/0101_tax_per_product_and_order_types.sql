-- 0101_tax_per_product_and_order_types.sql
-- Pajak per produk (tarif khusus / bebas pajak) dan aturan pajak per jenis order (dine_in, takeaway, delivery, service).

begin;

-- 1. Tambah kolom tarif pajak khusus pada tabel produk
alter table pos.products
  add column if not exists tax_rate numeric(7,4) check (tax_rate is null or (tax_rate between 0 and 100));

-- 2. Tambah kolom tarif per jenis order pada tabel pajak
alter table pos.taxes
  add column if not exists order_type_rates jsonb not null default '{}'::jsonb;

-- Pastikan order_types ada di pos.taxes (bila belum)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'pos' and table_name = 'taxes' and column_name = 'order_types'
  ) then
    alter table pos.taxes add column order_types text[] not null default '{dine_in,takeaway,delivery,service}';
  end if;
end $$;

-- 3. Fungsi simpan pengaturan pajak lengkap (termasuk mode per_product/per_order dan jenis order)
create or replace function pos.tax_settings_save(
  p_outlet_id uuid,
  p_name text,
  p_rate numeric,
  p_enabled boolean,
  p_inclusive boolean,
  p_tax_mode text default 'per_order',
  p_order_types text[] default array['dine_in','takeaway','delivery','service']::text[],
  p_order_type_rates jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pos, public
as $$
declare
  v_org_id uuid;
  v_tax_id uuid;
  v_tax_calc text;
begin
  select org_id into v_org_id from pos.outlets where id = p_outlet_id;
  if v_org_id is null then
    raise exception 'Outlet tidak ditemukan' using errcode = 'P0002';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nama pajak wajib diisi' using errcode = 'P0001';
  end if;

  if p_rate is null or p_rate < 0 or p_rate > 100 then
    raise exception 'Tarif pajak harus antara 0 dan 100' using errcode = 'P0001';
  end if;

  if p_tax_mode not in ('per_order', 'per_product') then
    raise exception 'Mode pajak tidak valid' using errcode = 'P0001';
  end if;

  -- Cari pajak default atau pajak pertama di org
  select id into v_tax_id from pos.taxes where org_id = v_org_id and deleted_at is null order by created_at limit 1;

  if v_tax_id is not null then
    update pos.taxes
    set name = trim(p_name),
        rate = p_rate,
        is_default = p_enabled,
        order_types = coalesce(p_order_types, array['dine_in','takeaway','delivery','service']::text[]),
        order_type_rates = coalesce(p_order_type_rates, '{}'::jsonb),
        updated_at = now()
    where id = v_tax_id;
  else
    insert into pos.taxes (id, org_id, name, rate, is_default, order_types, order_type_rates)
    values (gen_random_uuid(), v_org_id, trim(p_name), p_rate, p_enabled, coalesce(p_order_types, array['dine_in','takeaway','delivery','service']::text[]), coalesce(p_order_type_rates, '{}'::jsonb));
  end if;

  v_tax_calc := case when p_inclusive then 'inclusive' else 'after_discount' end;

  update pos.outlet_settings
  set tax_calc = v_tax_calc,
      tax_mode = p_tax_mode,
      updated_at = now()
  where outlet_id = p_outlet_id;
end;
$$;

revoke all on function pos.tax_settings_save from public;
grant execute on function pos.tax_settings_save to authenticated;

commit;
