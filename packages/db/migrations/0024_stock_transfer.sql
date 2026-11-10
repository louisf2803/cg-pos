-- CG POS · 0024_stock_transfer
-- Transfer stok antar lokasi (outlet atau gudang) dalam satu organisasi, dua tahap:
--   * pos.stock_transfer_create  : kirim. Stok keluar dari lokasi asal sekarang (gerakan transfer_out), status "dalam perjalanan".
--   * pos.stock_transfer_receive : terima. Stok masuk ke lokasi tujuan dengan harga perolehan sama dengan biaya rata-rata saat dikirim.
--   * pos.stock_transfer_cancel  : batalkan selama masih dalam perjalanan; stok kembali ke lokasi asal dengan biaya yang sama.
--   * pos.stock_transfer_list / pos.stock_location_list : bacaan untuk dashboard (pemilik/admin/manajer)
-- Tabel stock_transfers dan stock_transfer_lines hanya bisa diubah lewat fungsi di atas (pemicu penjaga). Stok boleh negatif.
begin;

create or replace function pos.stock_transfer_guard() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid := coalesce(new.org_id, old.org_id);
begin
  if coalesce(current_setting('pos.transfer_fn', true), '') = 'on' then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'DELETE' and not exists (select 1 from pos.orgs where id = v_org) then return old; end if;   -- hapus organisasi
  raise exception 'stock transfers can only be changed with the stock_transfer functions';
end $$;
revoke all on function pos.stock_transfer_guard() from public, anon, authenticated;
drop trigger if exists stock_transfers_guard on pos.stock_transfers;
create trigger stock_transfers_guard before insert or update or delete on pos.stock_transfers for each row execute function pos.stock_transfer_guard();
drop trigger if exists stock_transfer_lines_guard on pos.stock_transfer_lines;
create trigger stock_transfer_lines_guard before insert or update or delete on pos.stock_transfer_lines for each row execute function pos.stock_transfer_guard();

create or replace function pos.stock_transfer_create(p_id uuid, p_from uuid, p_to uuid, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  a pos.locations%rowtype; b pos.locations%rowtype; t pos.stock_transfers%rowtype; ln jsonb; v_pid uuid; v_qty numeric; v_seen uuid[] := '{}'; v_num bigint; v_n int := 0;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  if p_id is null then raise exception 'id required'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'lines required'; end if;
  if jsonb_array_length(p_lines) > 200 then raise exception 'too many lines'; end if;
  select * into a from pos.locations where id = p_from and is_active;
  select * into b from pos.locations where id = p_to and is_active;
  if a.id is null or b.id is null then raise exception 'location not found'; end if;
  if a.org_id <> b.org_id then raise exception 'locations belong to different organizations'; end if;
  if a.id = b.id then raise exception 'from and to must differ'; end if;
  if not pos.can_manage(a.org_id) then raise exception 'not allowed'; end if;

  select * into t from pos.stock_transfers where id = p_id;
  if found then
    if t.org_id <> a.org_id then raise exception 'not allowed'; end if;
    return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status, 'duplicate', true);
  end if;

  perform set_config('pos.transfer_fn', 'on', true);
  v_num := pos.next_doc_number(a.org_id, 'STF', 0);
  insert into pos.stock_transfers(id, org_id, from_location_id, to_location_id, number, status, note, created_by)
  values (p_id, a.org_id, a.id, b.id, 'TRF-' || lpad(v_num::text, 6, '0'), 'in_transit', nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid())
  returning * into t;
  for ln in select * from jsonb_array_elements(p_lines) loop
    v_pid := (ln->>'product_id')::uuid; v_qty := (ln->>'qty')::numeric;
    if v_pid is null or v_qty is null or v_qty <= 0 or v_qty > 1000000000 or v_qty <> round(v_qty, 4) then raise exception 'invalid line'; end if;
    if v_pid = any(v_seen) then raise exception 'duplicate product in lines'; end if;
    v_seen := v_seen || v_pid;
    if not exists (select 1 from pos.products where id = v_pid and org_id = a.org_id and deleted_at is null and track_stock and kind in ('goods', 'ingredient')) then raise exception 'product does not track stock'; end if;
    insert into pos.stock_transfer_lines(transfer_id, product_id, org_id, qty) values (t.id, v_pid, a.org_id, v_qty);
    insert into pos.stock_movements(org_id, location_id, product_id, kind, qty_delta, ref_type, ref_id, source_key, reason, created_by)
    values (a.org_id, a.id, v_pid, 'transfer_out', -v_qty, 'transfer', t.id, 'transfer-out:' || t.id || ':' || v_pid, 'Transfer ' || t.number || ' ke ' || b.name, auth.uid());
    v_n := v_n + 1;
  end loop;
  insert into pos.activity_logs(org_id, outlet_id, actor_user_id, action, entity, entity_id, detail)
  values (a.org_id, null, auth.uid(), 'stock_transfer.created', 'stock_transfer', t.id, jsonb_build_object('name', t.number, 'changes', jsonb_build_object('lines', jsonb_build_array(null, to_jsonb(v_n::text || ' barang, ' || a.name || ' ke ' || b.name)))));
  perform set_config('pos.transfer_fn', 'off', true);
  return jsonb_build_object('id', t.id, 'number', t.number, 'status', t.status, 'duplicate', false, 'lines', v_n);
end $$;
revoke all on function pos.stock_transfer_create(uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function pos.stock_transfer_create(uuid, uuid, uuid, text, jsonb) to authenticated, service_role;

create or replace function pos.stock_transfer_receive(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare t pos.stock_transfers%rowtype; r record; v_cost numeric; v_n int := 0;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select * into t from pos.stock_transfers where id = p_id for update;
  if not found then raise exception 'transfer not found'; end if;
  if not pos.can_manage(t.org_id) then raise exception 'not allowed'; end if;
  if t.status <> 'in_transit' then raise exception 'transfer is not in transit'; end if;
  perform set_config('pos.transfer_fn', 'on', true);
  for r in select * from pos.stock_transfer_lines where transfer_id = t.id order by product_id loop
    select unit_cost into v_cost from pos.stock_movements where org_id = t.org_id and source_key = 'transfer-out:' || t.id || ':' || r.product_id;
    insert into pos.stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, ref_type, ref_id, source_key, reason, created_by)
    values (t.org_id, t.to_location_id, r.product_id, 'transfer_in', r.qty, coalesce(v_cost, 0), 'transfer', t.id, 'transfer-in:' || t.id || ':' || r.product_id, 'Transfer ' || t.number, auth.uid());
    update pos.stock_transfer_lines set received_qty = r.qty where transfer_id = t.id and product_id = r.product_id;
    v_n := v_n + 1;
  end loop;
  update pos.stock_transfers set status = 'received' where id = t.id;
  insert into pos.activity_logs(org_id, outlet_id, actor_user_id, action, entity, entity_id, detail)
  values (t.org_id, null, auth.uid(), 'stock_transfer.updated', 'stock_transfer', t.id, jsonb_build_object('name', t.number, 'changes', jsonb_build_object('status', jsonb_build_array('in_transit', 'received'))));
  perform set_config('pos.transfer_fn', 'off', true);
  return jsonb_build_object('id', t.id, 'status', 'received', 'lines', v_n);
end $$;
revoke all on function pos.stock_transfer_receive(uuid) from public, anon;
grant execute on function pos.stock_transfer_receive(uuid) to authenticated, service_role;

create or replace function pos.stock_transfer_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare t pos.stock_transfers%rowtype; r record; v_cost numeric; v_n int := 0;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select * into t from pos.stock_transfers where id = p_id for update;
  if not found then raise exception 'transfer not found'; end if;
  if not pos.can_manage(t.org_id) then raise exception 'not allowed'; end if;
  if t.status <> 'in_transit' then raise exception 'transfer is not in transit'; end if;
  perform set_config('pos.transfer_fn', 'on', true);
  for r in select * from pos.stock_transfer_lines where transfer_id = t.id order by product_id loop
    select unit_cost into v_cost from pos.stock_movements where org_id = t.org_id and source_key = 'transfer-out:' || t.id || ':' || r.product_id;
    insert into pos.stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, ref_type, ref_id, source_key, reason, created_by)
    values (t.org_id, t.from_location_id, r.product_id, 'transfer_in', r.qty, coalesce(v_cost, 0), 'transfer', t.id, 'transfer-cancel:' || t.id || ':' || r.product_id, 'Transfer ' || t.number || ' dibatalkan', auth.uid());
    v_n := v_n + 1;
  end loop;
  update pos.stock_transfers set status = 'cancelled' where id = t.id;
  insert into pos.activity_logs(org_id, outlet_id, actor_user_id, action, entity, entity_id, detail)
  values (t.org_id, null, auth.uid(), 'stock_transfer.updated', 'stock_transfer', t.id, jsonb_build_object('name', t.number, 'changes', jsonb_build_object('status', jsonb_build_array('in_transit', 'cancelled'))));
  perform set_config('pos.transfer_fn', 'off', true);
  return jsonb_build_object('id', t.id, 'status', 'cancelled', 'lines', v_n);
end $$;
revoke all on function pos.stock_transfer_cancel(uuid) from public, anon;
grant execute on function pos.stock_transfer_cancel(uuid) to authenticated, service_role;

create or replace function pos.stock_location_list() returns table(id uuid, name text, kind text)
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  return query select l.id, l.name, l.kind from pos.locations l where l.is_active and l.org_id in (select pos.user_org_ids()) and pos.can_manage(l.org_id) order by l.kind, l.name;
end $$;
revoke all on function pos.stock_location_list() from public, anon;
grant execute on function pos.stock_location_list() to authenticated, service_role;

create or replace function pos.stock_transfer_list(p_limit int default 100) returns table(id uuid, number text, status text, from_id uuid, from_name text, to_id uuid, to_name text, note text, created_at timestamptz, lines jsonb)
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  return query
  select t.id, t.number, t.status, t.from_location_id, fl.name, t.to_location_id, tl.name, t.note, t.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('product_id', x.product_id, 'name', p.name, 'qty', x.qty, 'received_qty', x.received_qty) order by p.name)
                     from pos.stock_transfer_lines x join pos.products p on p.id = x.product_id where x.transfer_id = t.id), '[]'::jsonb)
    from pos.stock_transfers t join pos.locations fl on fl.id = t.from_location_id join pos.locations tl on tl.id = t.to_location_id
   where t.org_id in (select pos.user_org_ids()) and pos.can_manage(t.org_id)
   order by t.created_at desc, t.id
   limit greatest(1, least(coalesce(p_limit, 100), 300));
end $$;
revoke all on function pos.stock_transfer_list(int) from public, anon;
grant execute on function pos.stock_transfer_list(int) to authenticated, service_role;

commit;
