-- CG POS · 0126_purchase_request_ref_and_invoice_void
-- PO dengan referensi permintaan stok dan uang muka; faktur pembelian dengan uang muka, lampiran, dan pembatalan faktur (void).
-- Diterapkan ke database oleh reviewer (Claude); jangan terapkan langsung di cabang kerja.

begin;

-- Buang signature lama agar tidak ada dua fungsi bernama sama (pemanggilan dengan argumen lama jadi ambigu); versi baru punya argumen tambahan berawalan default.
drop function if exists pos.purchase_order_save(uuid, uuid, uuid, date, date, numeric, numeric, numeric, text, text, jsonb);
drop function if exists pos.purchase_invoice_create(uuid, uuid, uuid, uuid, text, date, int, numeric, numeric, numeric, text, jsonb);

-- Tambah kolom request_id dan down_payment pada purchase_orders jika belum ada
alter table pos.purchase_orders
  add column if not exists request_id uuid references pos.stock_requests(id);
alter table pos.purchase_orders
  add column if not exists down_payment numeric(18,2) not null default 0;

-- Update pos.purchase_order_save agar menerima referensi permintaan dan uang muka
create or replace function pos.purchase_order_save(
  p_id uuid, p_location uuid, p_supplier uuid, p_date date, p_expected date,
  p_discount numeric, p_tax numeric, p_other numeric, p_note text, p_status text, p_lines jsonb,
  p_request_id uuid default null, p_down_payment numeric default 0) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  l locations%rowtype; o purchase_orders%rowtype; ln jsonb; v_sub numeric := 0; v_pid uuid; v_unit uuid; v_qty numeric; v_price numeric; v_disc numeric;
  v_total numeric; v_num bigint; v_n int := 0;
begin
  if p_id is null then raise exception 'id required'; end if;
  if p_status not in ('draft','ordered','cancelled') then raise exception 'invalid status'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be an array'; end if;
  if jsonb_array_length(p_lines) > 500 then raise exception 'too many lines'; end if;
  select * into l from locations where id = p_location and is_active;
  if not found then raise exception 'location not found'; end if;
  if not pos.can_manage(l.org_id) then raise exception 'not allowed'; end if;
  if not exists (select 1 from suppliers where id = p_supplier and org_id = l.org_id and is_active) then raise exception 'supplier not found'; end if;
  if coalesce(p_discount, 0) < 0 or coalesce(p_tax, 0) < 0 or coalesce(p_other, 0) < 0 or coalesce(p_down_payment, 0) < 0 then
    raise exception 'amounts must not be negative';
  end if;
  if p_request_id is not null and not exists (select 1 from stock_requests where id = p_request_id and org_id = l.org_id) then
    raise exception 'stock request not found';
  end if;
  if p_status <> 'cancelled' and jsonb_array_length(p_lines) = 0 then raise exception 'order has no lines'; end if;

  select * into o from purchase_orders where id = p_id for update;
  if found then
    if o.org_id <> l.org_id then raise exception 'order belongs to another organization'; end if;
    if o.status in ('partially_received','received') then raise exception 'order already received'; end if;
    if o.status = 'cancelled' then raise exception 'order is cancelled'; end if;
  end if;

  for ln in select * from jsonb_array_elements(p_lines) loop
    v_qty := (ln->>'qty')::numeric; v_price := (ln->>'unit_price')::numeric; v_disc := coalesce((ln->>'discount')::numeric, 0);
    if v_qty is null or v_qty <= 0 or v_qty > 1000000000 or v_qty <> round(v_qty, 4) then raise exception 'invalid line'; end if;
    if v_price is null or v_price < 0 or v_price > 1000000000000 or v_disc < 0 or v_disc > v_qty * v_price then raise exception 'invalid line'; end if;
    v_sub := v_sub + round(v_qty * v_price - v_disc, 2);
  end loop;
  v_total := v_sub - coalesce(p_discount, 0) + coalesce(p_tax, 0) + coalesce(p_other, 0);
  if v_total < 0 then raise exception 'discount is larger than the order'; end if;
  if coalesce(p_down_payment, 0) > v_total then raise exception 'down payment exceeds order total'; end if;

  if o.id is null then
    v_num := pos.next_doc_number(l.org_id, 'PO', 0);
    insert into purchase_orders(id, org_id, location_id, supplier_id, number, status, order_date, expected_date,
                                discount, tax_amount, other_cost, down_payment, request_id, total, note, created_by)
    values (p_id, l.org_id, l.id, p_supplier, 'PO-' || lpad(v_num::text, 6, '0'), p_status, coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date), p_expected,
            coalesce(p_discount, 0), coalesce(p_tax, 0), coalesce(p_other, 0), coalesce(p_down_payment, 0), p_request_id,
            v_total, nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid())
    returning * into o;
  else
    update purchase_orders set supplier_id = p_supplier, status = p_status, order_date = coalesce(p_date, order_date), expected_date = p_expected,
           discount = coalesce(p_discount, 0), tax_amount = coalesce(p_tax, 0), other_cost = coalesce(p_other, 0),
           down_payment = coalesce(p_down_payment, down_payment), request_id = coalesce(p_request_id, request_id),
           total = v_total, note = nullif(left(trim(coalesce(p_note, '')), 200), ''), updated_at = now()
     where id = o.id returning * into o;
    delete from purchase_order_lines where order_id = o.id;
  end if;

  for ln in select * from jsonb_array_elements(p_lines) loop
    v_pid := (ln->>'product_id')::uuid; v_unit := (ln->>'unit_id')::uuid;
    if not exists (select 1 from products where id = v_pid and org_id = l.org_id and deleted_at is null and track_stock and kind in ('goods','ingredient')) then
      raise exception 'product does not track stock';
    end if;
    if not exists (select 1 from product_units where product_id = v_pid and unit_id = v_unit and org_id = l.org_id and deleted_at is null) then
      raise exception 'unit does not belong to product';
    end if;
    insert into purchase_order_lines(org_id, order_id, product_id, unit_id, qty, unit_price, discount)
    values (l.org_id, o.id, v_pid, v_unit, (ln->>'qty')::numeric, (ln->>'unit_price')::numeric, coalesce((ln->>'discount')::numeric, 0));
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('id', o.id, 'number', o.number, 'total', o.total, 'lines', v_n);
end $$;
revoke all on function pos.purchase_order_save(uuid, uuid, uuid, date, date, numeric, numeric, numeric, text, text, jsonb, uuid, numeric) from public, anon;
grant execute on function pos.purchase_order_save(uuid, uuid, uuid, date, date, numeric, numeric, numeric, text, text, jsonb, uuid, numeric) to authenticated, service_role;

-- Update pos.purchase_invoice_create dengan uang muka dan lampiran
create or replace function pos.purchase_invoice_create(
  p_id uuid, p_location uuid, p_supplier uuid, p_order uuid, p_supplier_no text, p_date date, p_term int,
  p_discount numeric, p_tax numeric, p_other numeric, p_note text, p_lines jsonb,
  p_down_payment numeric default 0, p_attachment text default null) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  l locations%rowtype; inv purchase_invoices%rowtype; ln jsonb; v_sub numeric := 0; v_total numeric; v_num bigint; v_pid uuid; v_unit uuid;
  v_qty numeric; v_price numeric; v_disc numeric; v_recv numeric; v_line uuid; v_lt numeric; v_items jsonb := '[]'; v_date date; v_je uuid;
  v_inv_acc uuid; v_ap_acc uuid; v_tax_acc uuid; v_jl jsonb := '[]'; v_stock_value numeric; v_n int := 0; v_term int; v_dp numeric;
begin
  if p_id is null then raise exception 'id required'; end if;
  select * into inv from purchase_invoices where id = p_id;
  if found then
    if not pos.can_manage(inv.org_id) then raise exception 'not allowed'; end if;
    return jsonb_build_object('id', inv.id, 'number', inv.number, 'total', inv.total, 'already', true);
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'invoice has no lines'; end if;
  if jsonb_array_length(p_lines) > 500 then raise exception 'too many lines'; end if;
  select * into l from locations where id = p_location and is_active;
  if not found then raise exception 'location not found'; end if;
  if not pos.can_manage(l.org_id) then raise exception 'not allowed'; end if;
  if p_supplier is not null and not exists (select 1 from suppliers where id = p_supplier and org_id = l.org_id and is_active) then raise exception 'supplier not found'; end if;
  if coalesce(p_discount, 0) < 0 or coalesce(p_tax, 0) < 0 or coalesce(p_other, 0) < 0 or coalesce(p_down_payment, 0) < 0 then
    raise exception 'amounts must not be negative';
  end if;
  if p_order is not null and not exists (select 1 from purchase_orders where id = p_order and org_id = l.org_id and status in ('ordered','partially_received')) then
    raise exception 'order is not open';
  end if;
  v_term := coalesce(p_term, (select term_days from suppliers where id = p_supplier), 0);
  if v_term < 0 or v_term > 3650 then raise exception 'invalid term'; end if;
  v_date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);

  for ln in select * from jsonb_array_elements(p_lines) loop
    v_qty := (ln->>'qty')::numeric; v_price := (ln->>'unit_price')::numeric; v_disc := coalesce((ln->>'discount')::numeric, 0);
    v_recv := coalesce((ln->>'received_qty')::numeric, v_qty);
    if v_qty is null or v_qty <= 0 or v_qty > 1000000000 or v_qty <> round(v_qty, 4) then raise exception 'invalid line'; end if;
    if v_price is null or v_price < 0 or v_price > 1000000000000 or v_disc < 0 or v_disc > v_qty * v_price then raise exception 'invalid line'; end if;
    if v_recv < 0 or v_recv > v_qty or v_recv <> round(v_recv, 4) then raise exception 'invalid received quantity'; end if;
    v_sub := v_sub + round(v_qty * v_price - v_disc, 2);
  end loop;
  v_total := v_sub - coalesce(p_discount, 0) + coalesce(p_tax, 0) + coalesce(p_other, 0);
  if v_total < 0 or coalesce(p_discount, 0) > v_sub then raise exception 'discount is larger than the invoice'; end if;
  v_dp := coalesce(p_down_payment, 0);
  if v_dp > v_total then raise exception 'down payment exceeds invoice total'; end if;

  v_num := pos.next_doc_number(l.org_id, 'PINV', 0);
  insert into purchase_invoices(id, org_id, location_id, supplier_id, order_id, number, supplier_invoice_no, invoice_date, term_days, due_date,
                                subtotal, discount, tax_amount, other_cost, down_payment_applied, attachment_path, total, note, created_by)
  values (p_id, l.org_id, l.id, p_supplier, p_order, 'FPB-' || lpad(v_num::text, 6, '0'), nullif(left(trim(coalesce(p_supplier_no, '')), 60), ''),
          v_date, v_term, v_date + v_term, v_sub, coalesce(p_discount, 0), coalesce(p_tax, 0), coalesce(p_other, 0), v_dp,
          nullif(trim(coalesce(p_attachment, '')), ''), v_total, nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid())
  returning * into inv;

  for ln in select * from jsonb_array_elements(p_lines) loop
    v_pid := (ln->>'product_id')::uuid; v_unit := (ln->>'unit_id')::uuid;
    v_qty := (ln->>'qty')::numeric; v_price := (ln->>'unit_price')::numeric; v_disc := coalesce((ln->>'discount')::numeric, 0);
    v_recv := coalesce((ln->>'received_qty')::numeric, v_qty);
    if not exists (select 1 from products where id = v_pid and org_id = l.org_id and deleted_at is null and track_stock and kind in ('goods','ingredient')) then
      raise exception 'product does not track stock';
    end if;
    if not exists (select 1 from product_units where product_id = v_pid and unit_id = v_unit and org_id = l.org_id and deleted_at is null) then
      raise exception 'unit does not belong to product';
    end if;
    v_lt := round(v_qty * v_price - v_disc, 2);
    insert into purchase_invoice_lines(org_id, invoice_id, product_id, unit_id, qty, received_qty, unit_price, discount, line_total)
    values (l.org_id, inv.id, v_pid, v_unit, v_qty, 0, v_price, v_disc, v_lt) returning id into v_line;
    if v_recv > 0 then v_items := v_items || jsonb_build_array(jsonb_build_object('line_id', v_line, 'qty', v_recv)); end if;
    v_n := v_n + 1;
  end loop;
  if jsonb_array_length(v_items) > 0 then
    perform pos.purchase_receive_lines(inv.id, gen_random_uuid(), 'Penerimaan awal', v_items);
  end if;

  -- jurnal
  v_inv_acc := pos.account_id(l.org_id, 'inventory');
  v_ap_acc := pos.account_id(l.org_id, 'accounts_payable');
  v_tax_acc := pos.account_id(l.org_id, 'purchase_tax_input');
  v_stock_value := v_sub - coalesce(p_discount, 0) + coalesce(p_other, 0);
  if v_stock_value > 0 then v_jl := v_jl || jsonb_build_array(jsonb_build_object('account_id', v_inv_acc, 'debit', v_stock_value, 'memo', 'Persediaan ' || inv.number)); end if;
  if coalesce(p_tax, 0) > 0 then v_jl := v_jl || jsonb_build_array(jsonb_build_object('account_id', v_tax_acc, 'debit', p_tax, 'memo', 'Pajak masukan')); end if;
  if v_total > 0 then
    v_jl := v_jl || jsonb_build_array(jsonb_build_object('account_id', v_ap_acc, 'credit', v_total, 'memo', 'Utang ' || inv.number));
    v_je := pos.post_journal(l.org_id, null, pos.open_book_date(l.org_id, v_date), 'PUR', 'Pembelian ' || inv.number, 'purchase_invoice', inv.id, 'purchase:' || inv.id, v_jl);
  end if;
  if v_total = 0 then update purchase_invoices set status = 'paid' where id = inv.id; end if;
  if p_order is not null then
    update purchase_orders set status = 'received', updated_at = now() where id = p_order;
  end if;
  return jsonb_build_object('id', inv.id, 'number', inv.number, 'total', v_total, 'lines', v_n, 'journal', v_je);
end $$;
revoke all on function pos.purchase_invoice_create(uuid, uuid, uuid, uuid, text, date, int, numeric, numeric, numeric, text, jsonb, numeric, text) from public, anon;
grant execute on function pos.purchase_invoice_create(uuid, uuid, uuid, uuid, text, date, int, numeric, numeric, numeric, text, jsonb, numeric, text) to authenticated, service_role;

-- Pembatalan faktur (void invoice)
create or replace function pos.purchase_invoice_void(p_invoice uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  inv purchase_invoices%rowtype;
  ln purchase_invoice_lines%rowtype;
  v_conv numeric;
  v_rev_jl jsonb := '[]';
  v_inv_acc uuid; v_ap_acc uuid; v_tax_acc uuid;
  v_stock_value numeric;
begin
  if p_invoice is null then raise exception 'invoice required'; end if;
  select * into inv from purchase_invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found'; end if;
  if not pos.can_manage(inv.org_id) then raise exception 'not allowed'; end if;
  if inv.status = 'void' then return jsonb_build_object('id', inv.id, 'status', 'void', 'already', true); end if;
  if exists (select 1 from purchase_payments where invoice_id = inv.id) then
    raise exception 'cannot void invoice with payments';
  end if;

  -- Balikkan stok yang pernah diterima dari faktur ini
  for ln in select * from purchase_invoice_lines where invoice_id = inv.id and received_qty > 0 loop
    select conversion into v_conv from product_units where product_id = ln.product_id and unit_id = ln.unit_id and org_id = inv.org_id and deleted_at is null;
    v_conv := coalesce(v_conv, 1);
    insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, ref_type, ref_id, source_key, reason, created_by)
    values (inv.org_id, inv.location_id, ln.product_id, 'adjust_out', -round(ln.received_qty * v_conv, 4), 0, 'purchase_invoice', inv.id,
            'purchase_void:' || inv.id || ':' || ln.id, 'Batal ' || inv.number || coalesce(' - ' || p_reason, ''), auth.uid());
    update purchase_invoice_lines set received_qty = 0 where id = ln.id;
  end loop;

  -- Jurnal pembalik
  v_inv_acc := pos.account_id(inv.org_id, 'inventory');
  v_ap_acc := pos.account_id(inv.org_id, 'accounts_payable');
  v_tax_acc := pos.account_id(inv.org_id, 'purchase_tax_input');
  v_stock_value := inv.subtotal - inv.discount + inv.other_cost;
  if v_stock_value > 0 then
    v_rev_jl := v_rev_jl || jsonb_build_array(jsonb_build_object('account_id', v_inv_acc, 'credit', v_stock_value, 'memo', 'Batal persediaan ' || inv.number));
  end if;
  if inv.tax_amount > 0 then
    v_rev_jl := v_rev_jl || jsonb_build_array(jsonb_build_object('account_id', v_tax_acc, 'credit', inv.tax_amount, 'memo', 'Batal pajak masukan'));
  end if;
  if inv.total > 0 then
    v_rev_jl := v_rev_jl || jsonb_build_array(jsonb_build_object('account_id', v_ap_acc, 'debit', inv.total, 'memo', 'Batal utang ' || inv.number));
    perform pos.post_journal(inv.org_id, null, pos.open_book_date(inv.org_id, (now() at time zone 'Asia/Jakarta')::date), 'REV', 'Batal ' || inv.number || coalesce(' - ' || p_reason, ''), 'purchase_invoice', inv.id, 'purchase_void:' || inv.id, v_rev_jl);
  end if;

  update purchase_invoices
     set status = 'void',
         note = case when p_reason is not null and p_reason <> '' then coalesce(note || ' ', '') || '[Batal: ' || p_reason || ']' else note end,
         updated_at = now()
   where id = inv.id;

  -- Bila ada PO terhubung, buka kembali PO-nya
  if inv.order_id is not null then
    update purchase_orders set status = 'ordered', updated_at = now() where id = inv.order_id and status = 'received';
  end if;

  return jsonb_build_object('id', inv.id, 'status', 'void');
end $$;
revoke all on function pos.purchase_invoice_void(uuid, text) from public, anon;
grant execute on function pos.purchase_invoice_void(uuid, text) to authenticated, service_role;

commit;
