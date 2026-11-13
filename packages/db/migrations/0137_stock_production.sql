-- CG POS · 0137_stock_production
-- Produksi stok (A137): acuan produksi (resep konversi: bahan -> barang jadi) dan perintah produksi. Menjalankan perintah mengurangi stok bahan
-- (production_out, biaya rata-rata) dan menambah stok barang jadi (production_in) pada lokasi yang sama, dengan harga perolehan barang jadi
-- = total biaya bahan terpakai / jumlah jadi. Tidak ada jurnal (persediaan pindah antar barang di akun yang sama). Asumsi belum dicek ke Majoo
-- (artikel 82 dan 84 belum dibaca): satu acuan = satu barang jadi, jumlah bahan dalam satuan dasar, perintah = kelipatan (batch) acuan.
-- Hanya pengelola (pos.can_manage). Tabel hanya berubah lewat fungsi.

create table pos.production_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  output_product_id uuid not null,
  output_qty numeric(18,4) not null check (output_qty > 0 and output_qty <= 1000000000),
  note text check (note is null or char_length(note) <= 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (output_product_id, org_id) references pos.products(id, org_id)
);
create unique index production_templates_name on pos.production_templates (org_id, lower(btrim(name)));

create table pos.production_template_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  template_id uuid not null,
  product_id uuid not null,
  qty numeric(18,4) not null check (qty > 0 and qty <= 1000000000),
  unique (template_id, product_id),
  foreign key (template_id, org_id) references pos.production_templates(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references pos.products(id, org_id)
);

create table pos.production_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  location_id uuid not null,
  template_id uuid not null,
  number text not null,
  run_date date not null,
  batches numeric(18,4) not null check (batches > 0 and batches <= 1000000),
  produced_qty numeric(18,4) not null check (produced_qty > 0),
  total_cost numeric(18,2) not null default 0 check (total_cost >= 0),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (org_id, number),
  unique (id, org_id),
  foreign key (location_id, org_id) references pos.locations(id, org_id),
  foreign key (template_id, org_id) references pos.production_templates(id, org_id)
);
create index production_runs_org on pos.production_runs (org_id, run_date desc);

alter table pos.production_templates enable row level security;
alter table pos.production_template_lines enable row level security;
alter table pos.production_runs enable row level security;
create policy sel on pos.production_templates for select to authenticated using (pos.can_manage(org_id));
create policy sel on pos.production_template_lines for select to authenticated using (pos.can_manage(org_id));
create policy sel on pos.production_runs for select to authenticated using (pos.can_manage(org_id));
revoke all on pos.production_templates, pos.production_template_lines, pos.production_runs from anon;
grant select on pos.production_templates, pos.production_template_lines, pos.production_runs to authenticated;

-- Simpan acuan produksi. p_lines = [{product_id, qty}] (satuan dasar). Idempoten menurut p_id (id sama = ubah dan ganti baris).
create or replace function pos.production_template_save(p_id uuid, p_org uuid, p_name text, p_output_product uuid, p_output_qty numeric, p_note text, p_active boolean, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare ln jsonb; v_pid uuid; v_qty numeric; v_seen uuid[] := '{}'; v_n int := 0;
begin
  if p_id is null then raise exception 'id required'; end if;
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'name required'; end if;
  if p_output_qty is null or p_output_qty <= 0 or p_output_qty > 1000000000 or p_output_qty <> round(p_output_qty, 4) then raise exception 'invalid output quantity'; end if;
  if not exists (select 1 from products where id = p_output_product and org_id = p_org and deleted_at is null and track_stock and kind in ('goods', 'ingredient')) then raise exception 'output product does not track stock'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'template has no ingredients'; end if;
  if jsonb_array_length(p_lines) > 50 then raise exception 'too many ingredients'; end if;
  if exists (select 1 from production_templates where id = p_id and org_id <> p_org) then raise exception 'not allowed'; end if;
  if exists (select 1 from production_templates where org_id = p_org and id <> p_id and lower(btrim(name)) = lower(btrim(p_name))) then raise exception 'name already used'; end if;
  for ln in select * from jsonb_array_elements(p_lines) loop
    v_pid := (ln->>'product_id')::uuid; v_qty := (ln->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 1000000000 or v_qty <> round(v_qty, 4) then raise exception 'invalid ingredient quantity'; end if;
    if v_pid = p_output_product then raise exception 'output cannot be an ingredient'; end if;
    if v_pid = any(v_seen) then raise exception 'duplicate ingredient'; end if;
    if not exists (select 1 from products where id = v_pid and org_id = p_org and deleted_at is null and track_stock and kind in ('goods', 'ingredient')) then raise exception 'ingredient does not track stock'; end if;
    v_seen := v_seen || v_pid;
  end loop;
  insert into production_templates(id, org_id, name, output_product_id, output_qty, note, is_active)
  values (p_id, p_org, btrim(p_name), p_output_product, p_output_qty, nullif(left(btrim(coalesce(p_note, '')), 300), ''), coalesce(p_active, true))
  on conflict (id) do update set name = excluded.name, output_product_id = excluded.output_product_id, output_qty = excluded.output_qty, note = excluded.note, is_active = excluded.is_active;
  delete from production_template_lines where template_id = p_id;
  for ln in select * from jsonb_array_elements(p_lines) loop
    insert into production_template_lines(org_id, template_id, product_id, qty) values (p_org, p_id, (ln->>'product_id')::uuid, (ln->>'qty')::numeric);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('id', p_id, 'ingredients', v_n);
end $$;

-- Hapus acuan yang belum pernah dipakai; yang sudah dipakai cukup dinonaktifkan.
create or replace function pos.production_template_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare t production_templates%rowtype;
begin
  select * into t from production_templates where id = p_id for update;
  if not found then return jsonb_build_object('id', p_id, 'deleted', false); end if;
  if not pos.can_manage(t.org_id) then raise exception 'not allowed'; end if;
  if exists (select 1 from production_runs where template_id = p_id) then raise exception 'template has runs'; end if;
  delete from production_templates where id = p_id;
  return jsonb_build_object('id', p_id, 'deleted', true);
end $$;

-- Jalankan produksi sebanyak p_batches kali acuan di p_location. Idempoten menurut p_id.
create or replace function pos.production_run(p_id uuid, p_org uuid, p_location uuid, p_template uuid, p_batches numeric, p_date date, p_note text)
returns jsonb language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  r production_runs%rowtype; t production_templates%rowtype; l locations%rowtype; ln record; v_need numeric; v_have numeric; v_cost numeric; v_total numeric := 0;
  v_produced numeric; v_num bigint; v_allow boolean := true; v_date date;
begin
  if p_id is null then raise exception 'id required'; end if;
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  select * into r from production_runs where id = p_id;
  if found then
    if r.org_id <> p_org then raise exception 'not allowed'; end if;
    return jsonb_build_object('id', r.id, 'number', r.number, 'produced_qty', r.produced_qty, 'already', true);
  end if;
  if p_batches is null or p_batches <= 0 or p_batches > 1000000 or p_batches <> round(p_batches, 4) then raise exception 'invalid batches'; end if;
  select * into t from production_templates where id = p_template and org_id = p_org;
  if not found then raise exception 'template not found'; end if;
  if not t.is_active then raise exception 'template inactive'; end if;
  select * into l from locations where id = p_location and org_id = p_org and is_active;
  if not found then raise exception 'location not found'; end if;
  if l.outlet_id is not null then select coalesce(allow_negative_stock, true) into v_allow from outlet_settings where outlet_id = l.outlet_id; end if;
  v_date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  v_produced := round(t.output_qty * p_batches, 4);
  v_num := pos.next_doc_number(p_org, 'PROD', 0);
  insert into production_runs(id, org_id, location_id, template_id, number, run_date, batches, produced_qty, note, created_by)
  values (p_id, p_org, p_location, p_template, 'PRD-' || lpad(v_num::text, 6, '0'), v_date, p_batches, v_produced, nullif(left(btrim(coalesce(p_note, '')), 300), ''), auth.uid())
  returning * into r;
  for ln in select product_id, qty from production_template_lines where template_id = p_template order by product_id loop
    v_need := round(ln.qty * p_batches, 4);
    select coalesce(qty, 0) into v_have from stock_balances where location_id = p_location and product_id = ln.product_id;
    if coalesce(v_have, 0) < v_need and not coalesce(v_allow, true) then raise exception 'insufficient stock'; end if;
    insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, ref_type, ref_id, source_key, reason, created_by)
    values (p_org, p_location, ln.product_id, 'production_out', -v_need, 0, 'production', r.id, 'prod:' || r.id || ':out:' || ln.product_id, 'Produksi ' || r.number, auth.uid())
    returning total_cost into v_cost;
    v_total := v_total + abs(coalesce(v_cost, 0));
  end loop;
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, ref_type, ref_id, source_key, reason, created_by)
  values (p_org, p_location, t.output_product_id, 'production_in', v_produced, round(v_total / v_produced, 4), 'production', r.id, 'prod:' || r.id || ':in', 'Produksi ' || r.number, auth.uid());
  update production_runs set total_cost = round(v_total, 2) where id = r.id;
  return jsonb_build_object('id', r.id, 'number', r.number, 'produced_qty', v_produced, 'total_cost', round(v_total, 2));
end $$;

revoke all on function pos.production_template_save(uuid, uuid, text, uuid, numeric, text, boolean, jsonb), pos.production_template_delete(uuid),
  pos.production_run(uuid, uuid, uuid, uuid, numeric, date, text) from public, anon;
grant execute on function pos.production_template_save(uuid, uuid, text, uuid, numeric, text, boolean, jsonb), pos.production_template_delete(uuid),
  pos.production_run(uuid, uuid, uuid, uuid, numeric, date, text) to authenticated, service_role;
