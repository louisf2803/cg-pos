-- CG POS · 0008_sync
-- Semua objek ada di schema pos. Tidak menyentuh schema public.
begin;
set local search_path = pos, extensions, public;

-- ===== 14_sync.sql =====
-- Bagian 14: sinkronisasi POS <-> server. Perangkat hanya memanggil dua fungsi ini (dan fungsi PIN/DOKU lewat rute server).

-- Catatan penghapusan untuk tabel penghubung yang tidak punya deleted_at
create table sync_tombstones (
  sync_seq bigint primary key default nextval('pos.sync_seq'),
  org_id uuid not null,
  table_name text not null,
  row_key jsonb not null,
  created_at timestamptz not null default now()
);
create index on sync_tombstones (org_id, sync_seq);

create or replace function pos.record_tombstone() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  insert into sync_tombstones(org_id, table_name, row_key) values (old.org_id, tg_table_name, to_jsonb(old));
  return old;
end $$;

-- Terapkan satu operasi dari perangkat. Dipanggil hanya oleh sync_push, di dalam sub-transaksi.
create or replace function pos._apply_op(p_dev devices, p_type text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  pl jsonb := p_payload; v_id uuid; o orders%rowtype; it jsonb; ex jsonb; d jsonb; tl jsonb; al jsonb;
  v_sum numeric; v_prefix text; v_outlet_code text; v_new_ver int; v_method payment_methods%rowtype;
  v_paid numeric; v_shift shifts%rowtype; v_item_id uuid; v_status text; v_pay uuid; v_change numeric;
  v_total numeric;
begin
  case p_type
  -----------------------------------------------------------------------------------------------
  when 'shift.open' then
    insert into shifts(id, org_id, outlet_id, device_id, cashier_id, opened_at, opening_cash, note)
    values ((pl->>'id')::uuid, p_dev.org_id, p_dev.outlet_id, p_dev.id, (pl->>'cashier_id')::uuid,
            (pl->>'opened_at')::timestamptz, coalesce((pl->>'opening_cash')::numeric, 0), pl->>'note');
    return jsonb_build_object('id', pl->>'id');

  when 'shift.close' then
    select * into v_shift from shifts where id = (pl->>'id')::uuid and org_id = p_dev.org_id;
    if not found or v_shift.device_id <> p_dev.id then raise exception 'shift not found on this device'; end if;
    perform pos.close_shift(v_shift.id, (pl->>'closed_by')::uuid, (pl->>'counted')::numeric,
                            (pl->>'closed_at')::timestamptz, pl->>'note');
    return jsonb_build_object('id', v_shift.id);

  -----------------------------------------------------------------------------------------------
  when 'order.upsert' then
    v_id := (pl->>'id')::uuid;
    select code into v_outlet_code from outlets where id = p_dev.outlet_id;
    v_prefix := v_outlet_code || '/' || p_dev.code || '/';
    if left(pl->>'number', length(v_prefix)) <> v_prefix then
      raise exception 'order number must start with %', v_prefix;
    end if;
    -- angka harus konsisten
    select coalesce(sum((i->>'line_total')::numeric), 0) into v_sum from jsonb_array_elements(coalesce(pl->'items','[]')) i
      where i->>'voided_at' is null;
    if abs(v_sum - (pl->>'subtotal')::numeric) > 0.01 then
      raise exception 'subtotal % does not match sum of lines %', pl->>'subtotal', v_sum;
    end if;
    for it in select * from jsonb_array_elements(coalesce(pl->'items','[]')) loop
      if abs((it->>'qty')::numeric * (it->>'unit_price')::numeric + coalesce((it->>'extras_total')::numeric,0)
             - coalesce((it->>'discount')::numeric,0) - (it->>'line_total')::numeric) > 0.01 then
        raise exception 'line % total is inconsistent', it->>'id';
      end if;
    end loop;

    select * into o from orders where id = v_id and org_id = p_dev.org_id for update;
    if found then
      if o.outlet_id <> p_dev.outlet_id then raise exception 'order belongs to another outlet'; end if;
      if o.status not in ('open') or exists (select 1 from payments where order_id = o.id and status in ('succeeded','pending')) then
        raise exception 'order_locked: order already has payments or is closed';
      end if;
      if coalesce((pl->>'base_version')::int, -1) <> o.version then
        raise exception 'version_conflict: server has version %', o.version;
      end if;
      delete from order_items where order_id = o.id;
      delete from order_discounts where order_id = o.id;
      delete from order_tax_lines where order_id = o.id;
      update orders set queue_no = (pl->>'queue_no')::int, order_type = pl->>'order_type',
             table_id = nullif(pl->>'table_id','')::uuid, customer_id = nullif(pl->>'customer_id','')::uuid,
             guest_count = (pl->>'guest_count')::int, label = pl->>'label', note = pl->>'note',
             subtotal = (pl->>'subtotal')::numeric, discount_total = (pl->>'discount_total')::numeric,
             service_charge = (pl->>'service_charge')::numeric, tax_total = (pl->>'tax_total')::numeric,
             rounding = (pl->>'rounding')::numeric, total = (pl->>'total')::numeric, version = version + 1
       where id = o.id returning version into v_new_ver;
    else
      insert into orders(id, org_id, outlet_id, device_id, shift_id, cashier_id, number, queue_no, order_type, table_id,
                         customer_id, guest_count, label, note, subtotal, discount_total, service_charge, tax_total,
                         rounding, total, opened_at, client_created_at)
      values (v_id, p_dev.org_id, p_dev.outlet_id, p_dev.id, nullif(pl->>'shift_id','')::uuid, (pl->>'cashier_id')::uuid,
              pl->>'number', (pl->>'queue_no')::int, pl->>'order_type', nullif(pl->>'table_id','')::uuid,
              nullif(pl->>'customer_id','')::uuid, (pl->>'guest_count')::int, pl->>'label', pl->>'note',
              (pl->>'subtotal')::numeric, (pl->>'discount_total')::numeric, (pl->>'service_charge')::numeric,
              (pl->>'tax_total')::numeric, (pl->>'rounding')::numeric, (pl->>'total')::numeric,
              (pl->>'opened_at')::timestamptz, (pl->>'client_created_at')::timestamptz);
      v_new_ver := 1;
    end if;

    for it in select * from jsonb_array_elements(coalesce(pl->'items','[]')) loop
      insert into order_items(id, org_id, order_id, product_id, product_unit_id, name, sku, qty, unit_price, extras_total,
                              discount, tax_amount, line_total, note, is_free, sort, voided_at, void_reason)
      values ((it->>'id')::uuid, p_dev.org_id, v_id, (it->>'product_id')::uuid, (it->>'product_unit_id')::uuid,
              it->>'name', it->>'sku', (it->>'qty')::numeric, (it->>'unit_price')::numeric,
              coalesce((it->>'extras_total')::numeric,0), coalesce((it->>'discount')::numeric,0),
              coalesce((it->>'tax_amount')::numeric,0), (it->>'line_total')::numeric, it->>'note',
              coalesce((it->>'is_free')::boolean,false), coalesce((it->>'sort')::int,0),
              nullif(it->>'voided_at','')::timestamptz, it->>'void_reason');
      for ex in select * from jsonb_array_elements(coalesce(it->'extras','[]')) loop
        insert into order_item_extras(id, org_id, order_item_id, option_id, name, price, qty)
        values ((ex->>'id')::uuid, p_dev.org_id, (it->>'id')::uuid, (ex->>'option_id')::uuid, ex->>'name',
                (ex->>'price')::numeric, (ex->>'qty')::numeric);
      end loop;
    end loop;
    for d in select * from jsonb_array_elements(coalesce(pl->'discounts','[]')) loop
      insert into order_discounts(id, org_id, order_id, order_item_id, source, promotion_id, coupon_id, points_used, amount, authorized_by)
      values ((d->>'id')::uuid, p_dev.org_id, v_id, nullif(d->>'order_item_id','')::uuid, d->>'source',
              nullif(d->>'promotion_id','')::uuid, nullif(d->>'coupon_id','')::uuid, (d->>'points_used')::int,
              (d->>'amount')::numeric, nullif(d->>'authorized_by','')::uuid);
    end loop;
    for tl in select * from jsonb_array_elements(coalesce(pl->'tax_lines','[]')) loop
      insert into order_tax_lines(order_id, tax_id, org_id, name, rate, base_amount, amount)
      values (v_id, nullif(tl->>'tax_id','')::uuid, p_dev.org_id, tl->>'name', (tl->>'rate')::numeric,
              (tl->>'base_amount')::numeric, (tl->>'amount')::numeric);
    end loop;
    return jsonb_build_object('id', v_id, 'version', v_new_ver);

  -----------------------------------------------------------------------------------------------
  when 'payment.add' then
    v_id := (pl->>'order_id')::uuid;
    select * into o from orders where id = v_id and org_id = p_dev.org_id for update;
    if not found then raise exception 'order not found'; end if;
    if o.outlet_id <> p_dev.outlet_id then raise exception 'order belongs to another outlet'; end if;
    if o.status = 'void' then raise exception 'order is void'; end if;
    select * into v_method from payment_methods where id = (pl->>'method_id')::uuid and org_id = p_dev.org_id and is_active and deleted_at is null;
    if not found then raise exception 'payment method not available'; end if;
    if v_method.kind = 'gateway' then raise exception 'gateway payments are created by the server, not by sync'; end if;
    if (pl->>'amount')::numeric > o.total - o.paid_total then
      raise exception 'amount % exceeds balance %', pl->>'amount', o.total - o.paid_total;
    end if;
    select * into v_shift from shifts where id = nullif(pl->>'shift_id','')::uuid and org_id = p_dev.org_id;
    if found and v_shift.status <> 'open' then raise exception 'shift_closed: payment cannot join a closed shift'; end if;
    v_change := case when v_method.kind = 'cash' and pl->>'tendered' is not null
                     then greatest((pl->>'tendered')::numeric - (pl->>'amount')::numeric, 0) else 0 end;
    insert into payments(id, org_id, outlet_id, order_id, shift_id, method_id, amount, tendered, change_given, status, paid_at, reference, created_by)
    values ((pl->>'id')::uuid, p_dev.org_id, p_dev.outlet_id, v_id, nullif(pl->>'shift_id','')::uuid, v_method.id,
            (pl->>'amount')::numeric, (pl->>'tendered')::numeric, v_change, 'succeeded',
            (pl->>'paid_at')::timestamptz, pl->>'reference', nullif(pl->>'created_by','')::uuid);
    for al in select * from jsonb_array_elements(coalesce(pl->'allocations','[]')) loop
      insert into payment_allocations(payment_id, order_item_id, org_id, qty)
      values ((pl->>'id')::uuid, (al->>'order_item_id')::uuid, p_dev.org_id, (al->>'qty')::numeric);
    end loop;
    -- uang sudah diterima: kegagalan pembukuan tidak boleh membatalkan pembayaran. Pekerjaan berkala mengulang.
    select status into v_status from orders where id = v_id;
    if v_status = 'paid' then
      begin perform pos.finalize_order(v_id);
      exception when others then
        insert into activity_logs(org_id, outlet_id, action, entity, entity_id, detail)
        values (p_dev.org_id, p_dev.outlet_id, 'order.finalize_failed', 'order', v_id, jsonb_build_object('error', sqlerrm));
      end;
    end if;
    return jsonb_build_object('order_status', v_status);

  -----------------------------------------------------------------------------------------------
  when 'order.void' then
    v_id := (pl->>'order_id')::uuid;
    select * into o from orders where id = v_id and org_id = p_dev.org_id for update;
    if not found then raise exception 'order not found'; end if;
    -- aturan CG POS: void hanya untuk order yang belum dibayar sama sekali
    if exists (select 1 from payments where order_id = v_id and status in ('succeeded','pending')) or o.status <> 'open' then
      raise exception 'only unpaid orders can be voided; use refund for paid orders';
    end if;
    update orders set status = 'void', closed_at = coalesce((pl->>'voided_at')::timestamptz, now()), version = version + 1 where id = v_id;
    update payments set status = 'cancelled' where order_id = v_id and status = 'pending';
    insert into order_voids(order_id, org_id, authorized_by, auth_method, approved_offline, reason, note, voided_by, voided_at)
    values (v_id, p_dev.org_id, (pl->>'authorized_by')::uuid, pl->>'auth_method', coalesce((pl->>'approved_offline')::boolean,false),
            pl->>'reason', pl->>'note', nullif(pl->>'voided_by','')::uuid, coalesce((pl->>'voided_at')::timestamptz, now()));
    return jsonb_build_object('order_status','void');

  -----------------------------------------------------------------------------------------------
  when 'cash.move' then
    insert into cash_movements(id, org_id, shift_id, kind, amount, reason, account_id, photo_path, employee_id, occurred_at)
    values ((pl->>'id')::uuid, p_dev.org_id, (pl->>'shift_id')::uuid, pl->>'kind', (pl->>'amount')::numeric, pl->>'reason',
            nullif(pl->>'account_id','')::uuid, pl->>'photo_path', nullif(pl->>'employee_id','')::uuid, (pl->>'occurred_at')::timestamptz);
    perform pos.post_cash_movement((pl->>'id')::uuid);
    return jsonb_build_object('id', pl->>'id');

  -----------------------------------------------------------------------------------------------
  when 'refund.add' then
    v_id := (pl->>'order_id')::uuid;
    select * into o from orders where id = v_id and org_id = p_dev.org_id for update;
    if not found then raise exception 'order not found'; end if;
    if o.status <> 'paid' then raise exception 'only paid orders can be refunded'; end if;
    select * into v_method from payment_methods where id = (pl->>'method_id')::uuid and org_id = p_dev.org_id;
    if not found then raise exception 'payment method not found'; end if;
    select coalesce(sum(total),0) into v_total from refunds where order_id = v_id and status <> 'failed';
    if v_total + (pl->>'total')::numeric > o.paid_total then
      raise exception 'refund % exceeds amount paid % (already refunded %)', pl->>'total', o.paid_total, v_total;
    end if;
    insert into refunds(id, org_id, outlet_id, order_id, shift_id, number, method_id, total, restock, refund_delivery,
                        authorized_by, auth_method, approved_offline, reason, note, status)
    values ((pl->>'id')::uuid, p_dev.org_id, p_dev.outlet_id, v_id, nullif(pl->>'shift_id','')::uuid, pl->>'number', v_method.id,
            (pl->>'total')::numeric, coalesce((pl->>'restock')::boolean,false), coalesce((pl->>'refund_delivery')::boolean,false),
            (pl->>'authorized_by')::uuid, pl->>'auth_method', coalesce((pl->>'approved_offline')::boolean,false),
            pl->>'reason', pl->>'note', case when v_method.kind = 'gateway' then 'pending_gateway' else 'completed' end);
    for it in select * from jsonb_array_elements(coalesce(pl->'items','[]')) loop
      insert into refund_items(refund_id, order_item_id, org_id, qty, amount)
      values ((pl->>'id')::uuid, (it->>'order_item_id')::uuid, p_dev.org_id, (it->>'qty')::numeric, (it->>'amount')::numeric);
    end loop;
    -- refund ke gateway diselesaikan server setelah DOKU menyetujui; sisanya dibukukan sekarang
    if v_method.kind <> 'gateway' then perform pos.post_refund((pl->>'id')::uuid); end if;
    return jsonb_build_object('id', pl->>'id');

  else
    raise exception 'unknown op type %', p_type;
  end case;
end $$;

-- Terima antrean operasi dari perangkat. Aman dikirim ulang (op_id unik). Urutan array = urutan penerapan.
create or replace function pos.sync_push(p_device uuid, p_ops jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare d devices%rowtype; op jsonb; v_op uuid; v_prev sync_ops%rowtype; v_res jsonb; v_out jsonb := '[]'::jsonb; v_inserted int;
begin
  select * into d from devices where id = p_device and is_active;
  if not found then raise exception 'unknown device'; end if;
  if auth.uid() is not null and d.user_id is distinct from auth.uid() then raise exception 'not your device'; end if;
  if jsonb_array_length(p_ops) > 200 then raise exception 'max 200 ops per push'; end if;

  for op in select * from jsonb_array_elements(p_ops) loop
    v_op := (op->>'op_id')::uuid;
    insert into sync_ops(op_id, org_id, device_id, op_type, entity_id, payload)
    values (v_op, d.org_id, d.id, op->>'type', nullif(op->>'entity_id','')::uuid, op->'payload')
    on conflict (op_id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      select * into v_prev from sync_ops where op_id = v_op;
      if v_prev.device_id <> d.id then raise exception 'op_id belongs to another device'; end if;
      if v_prev.status <> 'received' then   -- sudah pernah diproses: kembalikan hasil lama
        v_out := v_out || jsonb_build_object('op_id', v_op, 'status', v_prev.status, 'error', v_prev.error, 'duplicate', true);
        continue;
      end if;
    end if;
    begin
      v_res := pos._apply_op(d, op->>'type', op->'payload');
      update sync_ops set status = 'applied', applied_at = now(), error = null where op_id = v_op;
      v_out := v_out || jsonb_build_object('op_id', v_op, 'status', 'applied', 'result', v_res);
    exception when others then
      update sync_ops set status = 'rejected', applied_at = now(), error = sqlerrm where op_id = v_op;
      v_out := v_out || jsonb_build_object('op_id', v_op, 'status', 'rejected', 'error', sqlerrm);
    end;
  end loop;
  update devices set last_seen_at = now() where id = d.id;
  return v_out;
end $$;

-- Tarik perubahan katalog sejak kursor. Baris yang baru diubah <5 detik ditahan sampai putaran berikut,
-- supaya transaksi yang belum commit (nomor urut lebih kecil) tidak terlewat oleh kursor.
create or replace function pos.sync_pull(p_device uuid, p_since bigint, p_limit int default 500) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  d devices%rowtype; t text; v_rows jsonb; v_out jsonb := '{}'::jsonb; v_max bigint := p_since; v_more boolean := false;
  v_cut timestamptz := now() - interval '5 seconds'; v_tmax bigint; v_filter text; v_n int; v_cursor bigint := null;
  v_tables text[] := array['outlets','outlet_settings','units','departments','categories','products','product_units',
    'product_outlets','product_unit_outlet_prices','price_schedules','extra_groups','extra_options','product_extra_groups',
    'taxes','tax_outlets','product_taxes','payment_methods','customers','promotions','coupons','floors','tables','employees'];
begin
  select * into d from devices where id = p_device and is_active;
  if not found then raise exception 'unknown device'; end if;
  if auth.uid() is not null and d.user_id is distinct from auth.uid() then raise exception 'not your device'; end if;
  p_limit := least(greatest(p_limit, 50), 2000);

  foreach t in array v_tables loop
    v_filter := case t
      when 'outlets' then format('id = %L', d.outlet_id)
      when 'outlet_settings' then format('outlet_id = %L', d.outlet_id)
      when 'employees' then format('exists (select 1 from employee_outlets eo where eo.employee_id = %I.id and eo.outlet_id = %L)', t, d.outlet_id)
      else case when exists (select 1 from information_schema.columns c where c.table_schema = 'pos' and c.table_name=t and c.column_name='outlet_id')
                then format('(outlet_id = %L or outlet_id is null)', d.outlet_id) else 'true' end
    end;
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) order by x.sync_seq), ''[]''), count(*), max(x.sync_seq)
         from (select * from %I where org_id = %L and sync_seq > %L and updated_at <= %L and %s order by sync_seq limit %s) x',
      t, d.org_id, p_since, v_cut, v_filter, p_limit) into v_rows, v_n, v_tmax;
    if t = 'employees' then   -- hash PIN dikirim ke perangkat outlet untuk verifikasi offline; lihat risiko R3
      v_rows := (select coalesce(jsonb_agg(e - 'user_id' - 'qr_code'), '[]') from jsonb_array_elements(v_rows) e);
    end if;
    if v_n > 0 then
      v_out := v_out || jsonb_build_object(t, v_rows);
      if v_n >= p_limit then v_more := true; v_cursor := least(coalesce(v_cursor, v_tmax), v_tmax); end if;
      v_max := greatest(v_max, v_tmax);
    end if;
  end loop;

  -- bila ada tabel yang terpotong batas, kursor tidak boleh melewati titik potong terkecil
  if v_more then v_max := v_cursor; end if;

  -- penghapusan keras pada tabel penghubung
  select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'key', row_key) order by sync_seq), '[]'), max(sync_seq)
    into v_rows, v_tmax
    from (select * from sync_tombstones where org_id = d.org_id and sync_seq > p_since and created_at <= v_cut order by sync_seq limit p_limit) z;
  if jsonb_array_length(v_rows) > 0 then
    v_out := v_out || jsonb_build_object('_deleted', v_rows);
    if not v_more then v_max := greatest(v_max, v_tmax); end if;
  end if;

  -- order yang masih berjalan di outlet ini (tanpa kursor; jumlahnya kecil) agar perangkat lain melihat meja terisi
  v_out := v_out || jsonb_build_object('_open_orders',
    (select coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object('items',
        (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from order_items i where i.order_id = o.id and i.org_id = o.org_id)) ), '[]')
       from orders o where o.org_id = d.org_id and o.outlet_id = d.outlet_id and o.status in ('open','partially_paid')));

  update devices set last_pull_seq = greatest(last_pull_seq, v_max), last_seen_at = now() where id = d.id;
  return jsonb_build_object('data', v_out, 'next_cursor', v_max, 'has_more', v_more, 'server_time', now());
end $$;


commit;
