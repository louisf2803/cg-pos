-- CG POS · 0043_purchase_price_map
-- Pemetaan harga beli per barang: mode 'manual' (harga diisi pengelola) atau 'last' (harga dari faktur pembelian terakhir yang tidak batal).
-- Dipakai untuk mengisi harga otomatis saat membuat PO/faktur pembelian. Rancangan Claude atas arahan Louis (12 Nov 2026; Majoo tidak bisa dilihat).
-- ASUMSI belum dicek ke Majoo: satu pengaturan per barang (bukan per pemasok); tanpa pengaturan = mode 'last'; harga 'last' memakai satuan
-- pada baris faktur itu, harga 'manual' memakai satuan yang dipilih (kosong = satuan dasar). Aditif; penulisan hanya lewat fungsi.

create table pos.purchase_price_map (
  org_id uuid not null references pos.orgs(id) on delete cascade,
  product_id uuid not null,
  mode text not null default 'last' check (mode in ('manual', 'last')),
  manual_price numeric(18,4) check (manual_price is null or (manual_price >= 0 and manual_price <= 1000000000000)),
  manual_unit_id uuid,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (org_id, product_id),
  foreign key (product_id, org_id) references pos.products(id, org_id) on delete cascade,
  foreign key (manual_unit_id, org_id) references pos.units(id, org_id),
  check ((mode = 'manual') = (manual_price is not null))
);

alter table pos.purchase_price_map enable row level security;
create policy sel on pos.purchase_price_map for select to authenticated using (pos.can_manage(org_id));
revoke all on pos.purchase_price_map from anon;
grant select on pos.purchase_price_map to authenticated;

-- Atur pemetaan satu barang (pengelola). p_mode 'last' menghapus harga manual.
create or replace function pos.purchase_price_set(p_org uuid, p_product uuid, p_mode text, p_price numeric, p_unit uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if p_mode not in ('manual', 'last') then raise exception 'invalid mode'; end if;
  if not exists (select 1 from pos.products where id = p_product and org_id = p_org and deleted_at is null and kind in ('goods', 'ingredient')) then raise exception 'product not found'; end if;
  if p_mode = 'manual' then
    if p_price is null or p_price < 0 or p_price > 1000000000000 or p_price <> round(p_price, 4) then raise exception 'invalid price'; end if;
    if p_unit is not null and not exists (select 1 from pos.units where id = p_unit and org_id = p_org) then raise exception 'unit not found'; end if;
  end if;
  insert into pos.purchase_price_map(org_id, product_id, mode, manual_price, manual_unit_id, updated_by)
  values (p_org, p_product, p_mode, case when p_mode = 'manual' then p_price end, case when p_mode = 'manual' then p_unit end, auth.uid())
  on conflict (org_id, product_id) do update set mode = excluded.mode, manual_price = excluded.manual_price, manual_unit_id = excluded.manual_unit_id,
    updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('product_id', p_product, 'mode', p_mode);
end $$;

-- Harga beli yang disarankan untuk satu barang. source: 'manual', 'last', atau 'none' (belum pernah dibeli dan tanpa harga manual).
create or replace function pos.purchase_price_suggest(p_org uuid, p_product uuid) returns jsonb
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare m pos.purchase_price_map%rowtype; l record;
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  select * into m from pos.purchase_price_map where org_id = p_org and product_id = p_product;
  if found and m.mode = 'manual' then
    return jsonb_build_object('source', 'manual', 'price', m.manual_price, 'unit_id', m.manual_unit_id);
  end if;
  select pl.unit_price, pl.unit_id, pi.number, pi.invoice_date into l
    from pos.purchase_invoice_lines pl join pos.purchase_invoices pi on pi.id = pl.invoice_id and pi.org_id = pl.org_id
   where pl.org_id = p_org and pl.product_id = p_product and pi.status <> 'void'
   order by pi.invoice_date desc, pi.created_at desc, pl.id desc limit 1;
  if found then
    return jsonb_build_object('source', 'last', 'price', l.unit_price, 'unit_id', l.unit_id, 'invoice_number', l.number, 'invoice_date', l.invoice_date);
  end if;
  return jsonb_build_object('source', 'none', 'price', null, 'unit_id', null);
end $$;

revoke all on function pos.purchase_price_set(uuid, uuid, text, numeric, uuid), pos.purchase_price_suggest(uuid, uuid) from public, anon;
grant execute on function pos.purchase_price_set(uuid, uuid, text, numeric, uuid), pos.purchase_price_suggest(uuid, uuid) to authenticated, service_role;
