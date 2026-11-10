-- CG POS · 0018_kitchen
-- Layar dapur: pesanan dikirim ke dapur per baris, dapur menandai Baru, Diproses, Siap, Disajikan.
--   * pos.kitchen_items       : status dapur per baris pesanan. Sengaja tanpa kunci asing ke order_items: saat pesanan terbuka disimpan
--                               ulang, baris pesanan dibuat ulang dengan id yang sama dan status dapur harus bertahan.
--   * pos.kitchen_send        : perangkat kasir (atau staf outlet) mengirim baris yang belum terkirim. Idempoten per baris.
--   * pos.kitchen_set_status  : staf outlet mengubah status baris (maju atau mundur).
--   * pos.kitchen_board       : papan dapur satu outlet, siap pakai untuk layar.
-- Tulis langsung ke tabel dicabut; hanya fungsi di atas yang boleh mengubahnya.
begin;

create table kitchen_items (
  item_id uuid primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid not null,
  order_id uuid not null,
  status text not null default 'new' check (status in ('new', 'preparing', 'ready', 'served')),
  sent_at timestamptz not null default now(),
  status_at timestamptz not null default now(),
  sent_by uuid
);
create index kitchen_items_board on kitchen_items (outlet_id, status, sent_at);
create index kitchen_items_order on kitchen_items (order_id);
alter table kitchen_items enable row level security;
create policy sel on kitchen_items for select to authenticated using (pos.can_see_outlet(org_id, outlet_id));
revoke all on kitchen_items from anon, authenticated;
grant select on kitchen_items to authenticated;

create or replace function pos.kitchen_send(p_order uuid, p_device uuid default null) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare o orders%rowtype; d devices%rowtype; v_n int := 0;
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
  insert into kitchen_items(item_id, org_id, outlet_id, order_id, sent_by)
  select i.id, o.org_id, o.outlet_id, o.id, auth.uid() from order_items i
   where i.order_id = o.id and i.org_id = o.org_id and i.voided_at is null
  on conflict (item_id) do nothing;
  get diagnostics v_n = row_count;
  return jsonb_build_object('sent', v_n, 'pending', (select count(*) from kitchen_items where order_id = o.id and status <> 'served'));
end $$;
revoke all on function pos.kitchen_send(uuid, uuid) from public, anon;
grant execute on function pos.kitchen_send(uuid, uuid) to authenticated, service_role;

create or replace function pos.kitchen_set_status(p_items uuid[], p_status text) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare k kitchen_items%rowtype; v_n int := 0;
begin
  if p_status is null or p_status not in ('new', 'preparing', 'ready', 'served') then raise exception 'invalid status'; end if;
  if p_items is null or coalesce(array_length(p_items, 1), 0) = 0 then raise exception 'no items'; end if;
  if array_length(p_items, 1) > 200 then raise exception 'too many items'; end if;
  for k in select * from kitchen_items where item_id = any(p_items) order by item_id for update loop
    if not pos.can_see_outlet(k.org_id, k.outlet_id) then raise exception 'not allowed'; end if;
    if k.status <> p_status then
      update kitchen_items set status = p_status, status_at = now() where item_id = k.item_id;
      v_n := v_n + 1;
    end if;
  end loop;
  return jsonb_build_object('changed', v_n);
end $$;
revoke all on function pos.kitchen_set_status(uuid[], text) from public, anon;
grant execute on function pos.kitchen_set_status(uuid[], text) to authenticated, service_role;

create or replace function pos.kitchen_board(p_outlet uuid, p_served_minutes int default 0)
returns table(item_id uuid, order_id uuid, order_number text, order_type text, table_name text, label text, guest_count int, queue_no int,
              name text, qty numeric, note text, extras jsonb, status text, sent_at timestamptz, status_at timestamptz)
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid;
begin
  select org_id into v_org from outlets where id = p_outlet;
  if v_org is null or not pos.can_see_outlet(v_org, p_outlet) then raise exception 'not allowed'; end if;
  return query
  select ki.item_id, o.id, o.number, o.order_type, t.name, o.label, o.guest_count, o.queue_no, oi.name, oi.qty, oi.note,
         coalesce((select jsonb_agg(jsonb_build_object('name', e.name, 'qty', e.qty) order by e.name) from order_item_extras e where e.order_item_id = oi.id and e.org_id = oi.org_id), '[]'::jsonb),
         ki.status, ki.sent_at, ki.status_at
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
