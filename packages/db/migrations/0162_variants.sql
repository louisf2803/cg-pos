-- CG POS · 0162_variants
-- Varian menggantikan "Ekstra": master varian (jenis + isi), ditempel per produk dengan isi yang boleh,
-- tambahan harga per isi, induk resep (hingga dua), dan takaran stok per kolom induk.
-- Semua aditif: grup Ekstra lama tetap jalan (jenis 'plain', tanpa induk, tanpa baris stok varian).
set local search_path = pos, extensions, public;

alter table extra_groups
  add column kind text not null default 'plain' check (kind in ('plain', 'material', 'cup')),
  add column material_ingredient_id uuid,
  add column material_unit_id uuid,
  add constraint extra_groups_material_fk foreign key (material_ingredient_id, org_id) references products(id, org_id),
  add constraint extra_groups_material_unit_fk foreign key (material_unit_id, org_id) references units(id, org_id);

alter table product_extra_groups add column is_parent boolean not null default false;

-- isi varian yang boleh untuk satu produk + tambahan harganya (tanpa baris = semua isi boleh, harga dari isi itu)
create table product_extra_options (
  product_id uuid not null,
  option_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  price_delta numeric(18,2) not null default 0 check (price_delta >= 0),
  primary key (product_id, option_id),
  foreign key (product_id, org_id) references products(id, org_id) on delete cascade,
  foreign key (option_id, org_id) references extra_options(id, org_id) on delete cascade
);
create index on product_extra_options (option_id);

-- takaran stok per kolom induk. option_id kosong = bahan resep dasar; terisi = bahan yang ikut pilihan itu (gula, gelas, box).
-- combo_key = id isi induk digabung '|' sesuai urutan induk di produk; '*' bila produk tanpa induk.
create table variant_stock_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  product_id uuid not null,
  option_id uuid,
  combo_key text not null default '*',
  ingredient_id uuid not null,
  qty numeric(18,4) not null check (qty > 0),
  unit_id uuid not null,
  foreign key (product_id, org_id) references products(id, org_id) on delete cascade,
  foreign key (option_id, org_id) references extra_options(id, org_id) on delete cascade,
  foreign key (ingredient_id, org_id) references products(id, org_id),
  foreign key (unit_id, org_id) references units(id, org_id),
  check (product_id <> ingredient_id)
);
create unique index variant_stock_lines_uq on variant_stock_lines (product_id, coalesce(option_id, '00000000-0000-0000-0000-000000000000'::uuid), combo_key, ingredient_id);
create index on variant_stock_lines (ingredient_id);

do $$
declare t text;
begin
  foreach t in array array['product_extra_options', 'variant_stock_lines'] loop
    execute format('alter table pos.%I enable row level security', t);
    execute format('create policy sel on pos.%I for select to authenticated using (org_id in (select pos.user_org_ids()))', t);
    execute format('revoke all on pos.%I from anon', t);
    execute format('revoke insert, update, delete on pos.%I from authenticated', t);
    execute format('grant select on pos.%I to authenticated', t);
    execute format('grant all on pos.%I to service_role', t);
  end loop;
end $$;

-- kunci kolom untuk satu baris pesanan: id isi induk yang dipilih, urut sesuai induk di produk; null bila ada induk yang belum dipilih
create or replace function pos.variant_combo_key(p_item uuid) returns text
language plpgsql stable set search_path = pos, extensions, pg_temp as $$
declare v_prod uuid; v_n int; v_parts text[];
begin
  select coalesce(p.parent_id, p.id) into v_prod from order_items oi join products p on p.id = oi.product_id where oi.id = p_item;
  if v_prod is null then return null; end if;
  select count(*) into v_n from product_extra_groups where product_id = v_prod and is_parent;
  if v_n = 0 then return '*'; end if;
  select array_agg(sel.opt order by sel.sort, sel.gid) into v_parts from (
    select peg.sort, peg.group_id as gid,
           (select e.option_id::text from order_item_extras e join extra_options eo on eo.id = e.option_id and eo.org_id = e.org_id
             where e.order_item_id = p_item and eo.group_id = peg.group_id limit 1) as opt
      from product_extra_groups peg where peg.product_id = v_prod and peg.is_parent) sel;
  if array_position(v_parts, null) is not null then return null; end if;
  return array_to_string(v_parts, '|');
end $$;

-- Bahan keluar dari takaran varian untuk satu order (satuan dasar). Produk yang punya resep varian (baris dasar)
-- memakai resep itu menggantikan resep biasa; kolom yang belum diisi tidak mengurangi apa pun.
create or replace function pos.variant_components(p_order uuid)
returns table(component_id uuid, component_qty numeric)
language sql stable set search_path = pos, extensions, pg_temp as $$
  select vl.ingredient_id, oi.qty * pu.conversion * vl.qty * pos.ingredient_factor(vl.ingredient_id, vl.unit_id)
    from order_items oi
    join product_units pu on pu.id = oi.product_unit_id
    join products sp on sp.id = oi.product_id
    cross join lateral (select pos.variant_combo_key(oi.id) as k) ck
    join variant_stock_lines vl on vl.product_id = coalesce(sp.parent_id, sp.id) and vl.combo_key = ck.k
      and (vl.option_id is null or exists (select 1 from order_item_extras e where e.order_item_id = oi.id and e.org_id = oi.org_id and e.option_id = vl.option_id))
    join products ip on ip.id = vl.ingredient_id and ip.track_stock
   where oi.order_id = p_order and oi.voided_at is null and ck.k is not null
$$;

-- produk yang memakai resep varian: resep biasa dilewati
create or replace function pos.has_variant_recipe(p_product uuid) returns boolean
language sql stable set search_path = pos, extensions, pg_temp as $$
  select exists (select 1 from variant_stock_lines vl join products p on p.id = p_product
                  where vl.product_id = coalesce(p.parent_id, p.id) and vl.option_id is null)
$$;

create or replace function pos.finalize_order(p_order uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  o orders%rowtype; v_loc uuid; v_date date; r record; v_cogs numeric := 0;
  v_lines jsonb := '[]'::jsonb; v_closed timestamptz;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.finalized_at is not null then return; end if;
  if o.status <> 'paid' then raise exception 'order % is not paid', o.number; end if;
  v_loc := pos.outlet_location(o.outlet_id);
  v_closed := coalesce(o.closed_at, now());
  v_date := pos.open_book_date(o.org_id, pos.book_date(o.outlet_id, v_closed));

  -- stok keluar: satu gerakan per bahan per order
  for r in
    select c.pid, sum(c.q) as q from (
      select comp.component_id as pid, comp.component_qty as q
        from order_items oi
        join product_units pu on pu.id = oi.product_unit_id
        cross join lateral pos.sale_components(oi.product_id, oi.qty * pu.conversion) comp
       where oi.order_id = p_order and oi.voided_at is null and not pos.has_variant_recipe(oi.product_id)
      union all
      select eoi.ingredient_id, e.qty * eoi.qty * pos.ingredient_factor(eoi.ingredient_id, eoi.unit_id)
        from order_item_extras e
        join order_items oi on oi.id = e.order_item_id and oi.org_id = e.org_id
        join extra_option_ingredients eoi on eoi.option_id = e.option_id
        join products ip on ip.id = eoi.ingredient_id and ip.track_stock
       where oi.order_id = p_order and oi.voided_at is null
      union all
      select vc.component_id, vc.component_qty from pos.variant_components(p_order) vc
    ) c group by c.pid having sum(c.q) > 0
  loop
    insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, ref_type, ref_id, source_key, occurred_at)
    values (o.org_id, v_loc, r.pid, 'sale', -r.q, 'order', o.id, 'order:' || o.id || ':' || r.pid, v_closed);
  end loop;

  select coalesce(-sum(total_cost), 0) into v_cogs
    from stock_movements where ref_type = 'order' and ref_id = o.id and kind = 'sale';

  -- debit: tiap akun metode bayar
  for r in
    select pm.account_id, sum(p.amount) as amt
      from payments p join payment_methods pm on pm.id = p.method_id and pm.org_id = p.org_id
     where p.order_id = o.id and p.status = 'succeeded' group by pm.account_id
  loop
    v_lines := v_lines || jsonb_build_object('account_id', r.account_id, 'debit', r.amt, 'memo', 'Pembayaran ' || o.number);
  end loop;
  if o.discount_total > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(o.org_id,'sales_discount'), 'debit', o.discount_total);
  end if;
  if o.rounding < 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(o.org_id,'rounding'), 'debit', -o.rounding);
  end if;
  -- kredit
  if o.subtotal > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(o.org_id,'sales_revenue'), 'credit', o.subtotal, 'memo', o.number);
  end if;
  if o.service_charge > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(o.org_id,'service_revenue'), 'credit', o.service_charge);
  end if;
  if o.tax_total > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(o.org_id,'tax_payable'), 'credit', o.tax_total);
  end if;
  if o.rounding > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(o.org_id,'rounding'), 'credit', o.rounding);
  end if;
  -- HPP
  if v_cogs > 0 then
    v_lines := v_lines
      || jsonb_build_object('account_id', pos.account_id(o.org_id,'cogs'), 'debit', v_cogs, 'memo', 'HPP ' || o.number)
      || jsonb_build_object('account_id', pos.account_id(o.org_id,'inventory'), 'credit', v_cogs, 'memo', 'HPP ' || o.number);
  end if;

  if jsonb_array_length(v_lines) >= 2 then
    perform pos.post_journal(o.org_id, o.outlet_id, v_date, 'SAL', 'Penjualan ' || o.number,
                             'sale', o.id, 'order:' || o.id || ':sale', v_lines);
  end if;
  update orders set finalized_at = now() where id = o.id;
end $$;

-- Simpan seluruh pengaturan varian satu produk sekaligus.
-- p_setup = { groups: [{group_id, is_parent, options: [{option_id, price_delta}] | null}], lines: [{option_id|null, combo_key, ingredient_id, qty, unit_id}] }
-- Urutan groups = urutan tampil dan urutan induk. Paling banyak dua induk.
create or replace function pos.product_variants_save(p_product uuid, p_setup jsonb) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare p products%rowtype; g jsonb; o jsonb; l jsonb; k int := 0; v_parents int := 0;
begin
  select * into p from products where id = p_product;
  if not found then raise exception 'product not found'; end if;
  if not pos.can_manage(p.org_id) then raise exception 'not allowed'; end if;
  if coalesce(jsonb_typeof(p_setup->'groups'), 'array') <> 'array' or coalesce(jsonb_typeof(p_setup->'lines'), 'array') <> 'array' then raise exception 'invalid setup'; end if;

  delete from product_extra_options where product_id = p_product;
  delete from product_extra_groups where product_id = p_product;
  delete from variant_stock_lines where product_id = p_product;

  for g in select * from jsonb_array_elements(coalesce(p_setup->'groups', '[]'::jsonb)) loop
    if not exists (select 1 from extra_groups x where x.id = (g->>'group_id')::uuid and x.org_id = p.org_id and x.deleted_at is null) then raise exception 'group not found'; end if;
    if coalesce((g->>'is_parent')::boolean, false) then v_parents := v_parents + 1; end if;
    if v_parents > 2 then raise exception 'at most two parent variants'; end if;
    insert into product_extra_groups(product_id, group_id, org_id, sort, is_parent)
    values (p_product, (g->>'group_id')::uuid, p.org_id, k, coalesce((g->>'is_parent')::boolean, false));
    k := k + 1;
    if jsonb_typeof(g->'options') = 'array' then
      for o in select * from jsonb_array_elements(g->'options') loop
        if not exists (select 1 from extra_options x where x.id = (o->>'option_id')::uuid and x.org_id = p.org_id and x.group_id = (g->>'group_id')::uuid and x.deleted_at is null) then raise exception 'option not found'; end if;
        insert into product_extra_options(product_id, option_id, org_id, price_delta)
        values (p_product, (o->>'option_id')::uuid, p.org_id, coalesce((o->>'price_delta')::numeric, 0));
      end loop;
    end if;
  end loop;

  for l in select * from jsonb_array_elements(coalesce(p_setup->'lines', '[]'::jsonb)) loop
    if coalesce((l->>'qty')::numeric, 0) <= 0 then continue; end if;
    insert into variant_stock_lines(org_id, product_id, option_id, combo_key, ingredient_id, qty, unit_id)
    values (p.org_id, p_product, nullif(l->>'option_id', '')::uuid, coalesce(nullif(l->>'combo_key', ''), '*'),
            (l->>'ingredient_id')::uuid, (l->>'qty')::numeric, (l->>'unit_id')::uuid)
    on conflict (product_id, coalesce(option_id, '00000000-0000-0000-0000-000000000000'::uuid), combo_key, ingredient_id)
    do update set qty = excluded.qty, unit_id = excluded.unit_id;
  end loop;
end $$;

revoke all on function pos.variant_combo_key(uuid), pos.variant_components(uuid), pos.has_variant_recipe(uuid) from public, anon, authenticated;
revoke all on function pos.product_variants_save(uuid, jsonb) from public, anon;
grant execute on function pos.product_variants_save(uuid, jsonb) to authenticated, service_role;

