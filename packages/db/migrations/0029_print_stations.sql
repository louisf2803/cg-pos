-- CG POS · 0029_print_stations
-- Stasiun cetak (Dapur, Bar, Label): produk dipetakan ke SATU stasiun; pesanan yang disimpan atau dibayar otomatis diteruskan
-- hanya untuk baris yang produknya punya stasiun, lalu kasir mencetak tiket (checker) per stasiun sesuai mode cetaknya.
--   * pos.print_stations          : nama, jenis (checker/label), mode cetak (auto/ask/off), salinan, lebar kertas, template tiket (jsonb)
--   * pos.products.print_station_id: stasiun tujuan produk; NULL = tidak diteruskan ke dapur
--   * pos.kitchen_items.station_id : stasiun tiap baris yang sudah diteruskan
--   * pos.kitchen_send             : hanya baris bersasis stasiun; mengembalikan baris yang BARU diteruskan (untuk dicetak)
--   * pos.kitchen_board            : tambah kolom station_id
-- Tidak mengubah data yang ada. Tulis ke print_stations langsung oleh pemilik/admin/manajer (RLS), seperti katalog lain.
begin;

create table pos.print_stations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null default 'checker' check (kind in ('checker', 'label')),
  print_mode text not null default 'ask' check (print_mode in ('auto', 'ask', 'off')),
  copies int not null default 1 check (copies between 1 and 5),
  paper text not null default '58' check (paper in ('58', '80')),
  template jsonb not null default '{}'::jsonb check (jsonb_typeof(template) = 'object' and pg_column_size(template) <= 4000),
  sort int not null default 0,
  is_active boolean not null default true,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references pos.outlets(id, org_id) on delete cascade,
  unique (id, org_id)
);
create unique index print_stations_name on pos.print_stations (outlet_id, lower(btrim(name))) where deleted_at is null;
create index print_stations_outlet on pos.print_stations (org_id, outlet_id, sort);

alter table pos.print_stations enable row level security;
create policy sel on pos.print_stations for select to authenticated using (org_id in (select pos.user_org_ids()) and pos.can_see_outlet(org_id, outlet_id));
create policy ins on pos.print_stations for insert to authenticated with check (pos.can_manage(org_id));
create policy upd on pos.print_stations for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id));
create policy del on pos.print_stations for delete to authenticated using (pos.can_manage(org_id));
revoke all on pos.print_stations from anon;
grant select, insert, update, delete on pos.print_stations to authenticated;

create trigger trg_touch_print_stations before update on pos.print_stations for each row execute function pos.touch_updated_at();
create trigger trg_seq_print_stations before insert or update on pos.print_stations for each row execute function pos.set_sync_seq();
create trigger trg_log_print_stations after insert or update or delete on pos.print_stations for each row execute function pos.log_change('print_station');

-- produk → stasiun (hapus stasiun = produk kembali tidak diteruskan)
alter table pos.products add column if not exists print_station_id uuid;
alter table pos.products drop constraint if exists products_print_station_fk;
alter table pos.products add constraint products_print_station_fk
  foreign key (print_station_id, org_id) references pos.print_stations(id, org_id) on delete set null (print_station_id);
create index if not exists products_print_station on pos.products (print_station_id) where print_station_id is not null;

alter table pos.kitchen_items add column if not exists station_id uuid;
create index if not exists kitchen_items_station on pos.kitchen_items (outlet_id, station_id, status, sent_at);

-- Teruskan baris yang belum terkirim, hanya yang produknya punya stasiun aktif. Idempoten per baris.
create or replace function pos.kitchen_send(p_order uuid, p_device uuid default null) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare o orders%rowtype; d devices%rowtype; v_lines jsonb;
begin
  select * into o from orders where id = p_order;
  if not found then raise exception 'order not found'; end if;
  if p_device is not null then
    select * into d from devices where id = p_device and is_active;
    if not found or d.user_id is distinct from auth.uid() or d.outlet_id <> o.outlet_id or d.org_id <> o.org_id then raise exception 'not allowed'; end if;
  elsif not pos.can_see_outlet(o.org_id, o.outlet_id) then
    raise exception 'not allowed';
  end if;
  if o.status not in ('open', 'paid') then raise exception 'order is not active'; end if;
  with ins as (
    insert into kitchen_items(item_id, org_id, outlet_id, order_id, station_id, sent_by)
    select i.id, o.org_id, o.outlet_id, o.id, s.id, auth.uid()
      from order_items i
      join products p on p.id = i.product_id and p.org_id = i.org_id
      join print_stations s on s.id = p.print_station_id and s.org_id = p.org_id and s.outlet_id = o.outlet_id and s.is_active and s.deleted_at is null
     where i.order_id = o.id and i.org_id = o.org_id and i.voided_at is null
    on conflict (item_id) do nothing
    returning item_id, station_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('itemId', i.id, 'stationId', ins.station_id, 'name', i.name, 'qty', i.qty, 'note', i.note,
           'extras', coalesce((select jsonb_agg(jsonb_build_object('name', e.name, 'qty', e.qty) order by e.name) from order_item_extras e where e.order_item_id = i.id and e.org_id = i.org_id), '[]'::jsonb))
           order by i.sort, i.name), '[]'::jsonb)
    into v_lines
    from ins join order_items i on i.id = ins.item_id and i.org_id = o.org_id;
  return jsonb_build_object('sent', jsonb_array_length(v_lines), 'lines', v_lines,
                            'pending', (select count(*) from kitchen_items where order_id = o.id and status <> 'served'));
end $$;
revoke all on function pos.kitchen_send(uuid, uuid) from public, anon;
grant execute on function pos.kitchen_send(uuid, uuid) to authenticated, service_role;

drop function if exists pos.kitchen_board(uuid, int);
create or replace function pos.kitchen_board(p_outlet uuid, p_served_minutes int default 0)
returns table(item_id uuid, order_id uuid, order_number text, order_type text, table_name text, label text, guest_count int, queue_no int,
              name text, qty numeric, note text, extras jsonb, status text, sent_at timestamptz, status_at timestamptz, station_id uuid)
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid;
begin
  select org_id into v_org from outlets where id = p_outlet;
  if v_org is null or not pos.can_see_outlet(v_org, p_outlet) then raise exception 'not allowed'; end if;
  return query
  select ki.item_id, o.id, o.number, o.order_type, t.name, o.label, o.guest_count, o.queue_no, oi.name, oi.qty, oi.note,
         coalesce((select jsonb_agg(jsonb_build_object('name', e.name, 'qty', e.qty) order by e.name) from order_item_extras e where e.order_item_id = oi.id and e.org_id = oi.org_id), '[]'::jsonb),
         ki.status, ki.sent_at, ki.status_at, ki.station_id
    from kitchen_items ki
    join order_items oi on oi.id = ki.item_id and oi.org_id = ki.org_id and oi.voided_at is null
    join orders o on o.id = oi.order_id and o.org_id = oi.org_id and o.status in ('open', 'paid')
    left join tables t on t.id = o.table_id and t.org_id = o.org_id
   where ki.outlet_id = p_outlet and ki.org_id = v_org
     and (ki.status <> 'served' or ki.status_at > now() - make_interval(mins => greatest(coalesce(p_served_minutes, 0), 0)))
   order by ki.sent_at, oi.sort, oi.name;
end $$;
revoke all on function pos.kitchen_board(uuid, int) from public, anon;
grant execute on function pos.kitchen_board(uuid, int) to authenticated, service_role;

commit;
