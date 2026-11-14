-- CG POS · 0139_product_unit_sell_price
-- Satuan ganda untuk PENJUALAN (A147): harga jual per satuan lain + pemeriksaan di server.
--  * pos.product_unit_set_price: atur harga jual satuan lain (bukan dasar); 0 = tidak dijual di kasir. Harga satuan dasar tetap harga produk.
--  * pos._apply_op (order.upsert): satuan baris harus milik produknya; batas stok (bila stok minus dilarang) memakai jumlah x isi satuan.
--    Definisi diambil dari 0127 lalu disisipi dua blok saja. Posting stok/HPP sudah mengalikan isi satuan (0006).

create or replace function pos.product_unit_set_price(p_product uuid, p_unit uuid, p_price numeric) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; r pos.product_units;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select org_id into v_org from pos.products where id = p_product and deleted_at is null;
  if not found then raise exception 'product not found'; end if;
  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  if p_price is null or p_price < 0 or p_price > 1000000000 or p_price <> round(p_price) then raise exception 'price must be a whole amount of zero or more'; end if;
  select * into r from pos.product_units where product_id = p_product and unit_id = p_unit and deleted_at is null;
  if not found then raise exception 'unit not found'; end if;
  if r.is_base then raise exception 'base unit price is the product price'; end if;
  update pos.product_units set price = p_price where id = r.id;
end $$;
revoke all on function pos.product_unit_set_price(uuid, uuid, numeric) from public, anon;
grant execute on function pos.product_unit_set_price(uuid, uuid, numeric) to authenticated, service_role;

CREATE OR REPLACE FUNCTION pos._apply_op(p_dev pos.devices, p_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pos', 'extensions', 'pg_temp'
AS $function$
declare
  pl jsonb := p_payload; v_id uuid; o orders%rowtype; it jsonb; ex jsonb; d jsonb; tl jsonb; al jsonb;
  v_sum numeric; v_prefix text; v_outlet_code text; v_new_ver int; v_method payment_methods%rowtype;
  v_paid numeric; v_shift shifts%rowtype; v_item_id uuid; v_status text; v_pay uuid; v_change numeric;
  v_total numeric; v_prod products%rowtype; v_allow_neg boolean := true; v_loc uuid; v_bal numeric;
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
      -- satuan yang dijual harus milik produk itu (satuan ganda, A147)
      if nullif(it->>'product_unit_id','') is not null and not exists (
           select 1 from product_units pu where pu.id = (it->>'product_unit_id')::uuid and pu.product_id = (it->>'product_id')::uuid and pu.org_id = p_dev.org_id and pu.deleted_at is null) then
        raise exception 'unit_not_of_product: %', it->>'name';
      end if;
      if abs((it->>'qty')::numeric * (it->>'unit_price')::numeric + coalesce((it->>'extras_total')::numeric,0)
             - coalesce((it->>'discount')::numeric,0)
             - case when coalesce((pl->>'tax_inclusive')::boolean, false) then coalesce((it->>'tax_amount')::numeric,0) else 0 end
             - (it->>'line_total')::numeric) > 0.01 then
        raise exception 'line % total is inconsistent', it->>'id';
      end if;
      -- Harga diubah kasir: klien mengirim base_price (harga sebelum diubah). Harus diizinkan produk dan dalam batas persen.
      if nullif(it->>'base_price', '') is not null and not coalesce((it->>'is_free')::boolean, false)
         and (it->>'base_price')::numeric <> (it->>'unit_price')::numeric then
        select * into v_prod from products where id = (it->>'product_id')::uuid and org_id = p_dev.org_id;
        if not found or not v_prod.allow_price_override then
          raise exception 'price_override_not_allowed: %', it->>'name';
        end if;
        if (it->>'base_price')::numeric <= 0
           or abs((it->>'unit_price')::numeric - (it->>'base_price')::numeric) * 100
              > (it->>'base_price')::numeric * v_prod.max_price_override_pct + 0.01 then
          raise exception 'price_override_exceeds_limit: %', it->>'name';
        end if;
      end if;
    end loop;

    -- Batasi penjualan saat stok habis bila outlet melarang stok minus (pengaturan outlet_settings.allow_negative_stock)
    select coalesce(allow_negative_stock, true) into v_allow_neg from outlet_settings where outlet_id = p_dev.outlet_id;
    if not v_allow_neg then
      v_loc := pos.outlet_location(p_dev.outlet_id);
      for it in select * from jsonb_array_elements(coalesce(pl->'items','[]')) loop
        if nullif(it->>'voided_at','') is null then
          select * into v_prod from products where id = (it->>'product_id')::uuid and org_id = p_dev.org_id;
          if v_prod.track_stock then
            select coalesce(qty, 0) into v_bal from stock_balances where location_id = v_loc and product_id = v_prod.id;
            if (it->>'qty')::numeric * coalesce((select pu.conversion from product_units pu where pu.id = nullif(it->>'product_unit_id','')::uuid and pu.product_id = v_prod.id), 1) > coalesce(v_bal, 0) then
              raise exception 'insufficient_stock: % (tersedia %)', it->>'name', coalesce(v_bal, 0);
            end if;
          end if;
        end if;
      end loop;
    end if;

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
             rounding = (pl->>'rounding')::numeric, total = (pl->>'total')::numeric,
             tax_inclusive = coalesce((pl->>'tax_inclusive')::boolean, false), version = version + 1
       where id = o.id returning version into v_new_ver;
    else
      insert into orders(id, org_id, outlet_id, device_id, shift_id, cashier_id, number, queue_no, order_type, table_id,
                         customer_id, guest_count, label, note, subtotal, discount_total, service_charge, tax_total,
                         rounding, total, tax_inclusive, opened_at, client_created_at)
      values (v_id, p_dev.org_id, p_dev.outlet_id, p_dev.id, nullif(pl->>'shift_id','')::uuid, (pl->>'cashier_id')::uuid,
              pl->>'number', (pl->>'queue_no')::int, pl->>'order_type', nullif(pl->>'table_id','')::uuid,
              nullif(pl->>'customer_id','')::uuid, (pl->>'guest_count')::int, pl->>'label', pl->>'note',
              (pl->>'subtotal')::numeric, (pl->>'discount_total')::numeric, (pl->>'service_charge')::numeric,
              (pl->>'tax_total')::numeric, (pl->>'rounding')::numeric, (pl->>'total')::numeric,
              coalesce((pl->>'tax_inclusive')::boolean, false), (pl->>'opened_at')::timestamptz, (pl->>'client_created_at')::timestamptz);
      v_new_ver := 1;
    end if;

    for it in select * from jsonb_array_elements(coalesce(pl->'items','[]')) loop
      insert into order_items(id, org_id, order_id, product_id, product_unit_id, name, sku, qty, unit_price, extras_total,
                              discount, tax_amount, line_total, note, is_free, sort, voided_at, void_reason, base_price)
      values ((it->>'id')::uuid, p_dev.org_id, v_id, (it->>'product_id')::uuid, (it->>'product_unit_id')::uuid,
              it->>'name', it->>'sku', (it->>'qty')::numeric, (it->>'unit_price')::numeric,
              coalesce((it->>'extras_total')::numeric,0), coalesce((it->>'discount')::numeric,0),
              coalesce((it->>'tax_amount')::numeric,0), (it->>'line_total')::numeric, it->>'note',
              coalesce((it->>'is_free')::boolean,false), coalesce((it->>'sort')::int,0),
              nullif(it->>'voided_at','')::timestamptz, it->>'void_reason', nullif(it->>'base_price','')::numeric);
      for ex in select * from jsonb_array_elements(coalesce(it->'extras','[]')) loop
        insert into order_item_extras(id, org_id, order_item_id, option_id, name, price, qty)
        values ((ex->>'id')::uuid, p_dev.org_id, (it->>'id')::uuid, (ex->>'option_id')::uuid, ex->>'name',
                (ex->>'price')::numeric, (ex->>'qty')::numeric);
      end loop;
    end loop;
    for d in select * from jsonb_array_elements(coalesce(pl->'discounts','[]')) loop
      insert into order_discounts(id, org_id, order_id, order_item_id, source, promotion_id, coupon_id, points_used, amount, authorized_by, reference)
      values ((d->>'id')::uuid, p_dev.org_id, v_id, nullif(d->>'order_item_id','')::uuid, d->>'source',
              nullif(d->>'promotion_id','')::uuid, nullif(d->>'coupon_id','')::uuid, (d->>'points_used')::int,
              (d->>'amount')::numeric, nullif(d->>'authorized_by','')::uuid, nullif(left(btrim(coalesce(d->>'reference','')), 60), ''));
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
end $function$;
