-- CG POS · 0148_invoice_stock_out
-- Keputusan Louis (15 Nov 2026): stok baru berkurang setelah DIBAYAR; pesanan belum dibayar tidak memotong stok. Invoice dari kasir (0147) adalah
-- pesanan yang ditagih nanti, jadi stoknya keluar ketika faktur LUNAS (bukan saat dibuat). Hanya faktur yang berasal dari pesanan kasir (punya outlet)
-- yang memotong stok; faktur B2B dari dashboard tidak punya outlet dan tidak berubah. Gerakan stok dan jurnal HPP idempoten (kunci sumber).

alter table pos.sales_invoices
  add column if not exists outlet_id uuid references pos.outlets(id) on delete set null,
  add column if not exists source_order_id uuid references pos.orders(id) on delete set null,
  add column if not exists stock_out_at timestamptz;

create or replace function pos._invoice_stock_out(p_invoice uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare inv sales_invoices%rowtype; v_loc uuid; v_date date; r record; v_cogs numeric := 0;
begin
  select * into inv from sales_invoices where id = p_invoice for update;
  if not found or inv.outlet_id is null or inv.stock_out_at is not null or inv.status <> 'paid' then return; end if;
  v_loc := pos.outlet_location(inv.outlet_id);
  v_date := pos.open_book_date(inv.org_id, pos.book_date(inv.outlet_id, now()));
  for r in
    select comp.component_id as pid, sum(comp.component_qty) as q
      from sales_invoice_lines l
      cross join lateral pos.sale_components(l.product_id, l.qty) comp
     where l.invoice_id = inv.id and l.product_id is not null
     group by comp.component_id having sum(comp.component_qty) > 0
  loop
    insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, ref_type, ref_id, source_key, occurred_at)
    values (inv.org_id, v_loc, r.pid, 'sale', -r.q, 'sales_invoice', inv.id, 'sinv:' || inv.id || ':' || r.pid, now());
  end loop;
  select coalesce(-sum(total_cost), 0) into v_cogs from stock_movements where ref_type = 'sales_invoice' and ref_id = inv.id and kind = 'sale';
  if v_cogs > 0 then
    perform pos.post_journal(inv.org_id, inv.outlet_id, v_date, 'SINV', 'HPP ' || inv.number, 'sales_invoice_stock', inv.id, 'sinv-stock:' || inv.id,
      jsonb_build_array(jsonb_build_object('account_id', pos.account_id(inv.org_id, 'cogs'), 'debit', v_cogs, 'memo', 'HPP ' || inv.number),
                        jsonb_build_object('account_id', pos.account_id(inv.org_id, 'inventory'), 'credit', v_cogs, 'memo', 'HPP ' || inv.number)));
  end if;
  update sales_invoices set stock_out_at = now() where id = inv.id;
end $$;
revoke all on function pos._invoice_stock_out(uuid) from public, anon, authenticated;

create or replace function pos.sales_invoice_pay(
  p_id uuid, p_invoice uuid, p_account uuid, p_date date, p_amount numeric, p_note text) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  inv sales_invoices%rowtype; v_paid numeric; v_date date; v_status text; v_ar uuid; v_je uuid;
begin
  if p_id is null then raise exception 'id required'; end if;
  select * into inv from sales_invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found'; end if;
  if not pos.can_manage(inv.org_id) then raise exception 'not allowed'; end if;
  if exists (select 1 from sales_invoice_payments where id = p_id) then
    return jsonb_build_object('id', inv.id, 'status', inv.status, 'paid_total', inv.paid_total, 'already', true);
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'invalid amount'; end if;
  if p_amount > inv.total - inv.paid_total then raise exception 'amount exceeds outstanding'; end if;
  if not exists (select 1 from accounts where id = p_account and org_id = inv.org_id and kind = 'detail' and is_active and category = 'cash_bank') then
    raise exception 'account not found or not postable';
  end if;
  v_date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  insert into sales_invoice_payments(id, org_id, invoice_id, paid_on, account_id, amount, is_down_payment, note, created_by)
  values (p_id, inv.org_id, inv.id, v_date, p_account, p_amount, false, nullif(left(btrim(coalesce(p_note, '')), 200), ''), auth.uid());
  v_paid := inv.paid_total + p_amount;
  v_status := case when v_paid >= inv.total then 'paid' else 'partially_paid' end;
  update sales_invoices set paid_total = v_paid, status = v_status where id = inv.id;
  v_ar := pos.account_id(inv.org_id, 'accounts_receivable');
  v_je := pos.post_journal(inv.org_id, null, pos.open_book_date(inv.org_id, v_date), 'SPAY', 'Pembayaran ' || inv.number, 'sales_invoice_payment', p_id, 'spay:' || p_id,
    jsonb_build_array(jsonb_build_object('account_id', p_account, 'debit', p_amount, 'memo', 'Terima ' || inv.number),
                      jsonb_build_object('account_id', v_ar, 'credit', p_amount, 'memo', 'Pelunasan ' || inv.number)));
  if v_status = 'paid' then perform pos._invoice_stock_out(inv.id); end if;
  return jsonb_build_object('id', inv.id, 'status', v_status, 'paid_total', v_paid, 'journal_id', v_je);
end $$;

-- order_invoice_create (0147) sekarang juga mencatat outlet dan pesanan asal agar stok bisa keluar saat faktur lunas.
create or replace function pos.order_invoice_create(
  p_id uuid, p_order uuid, p_term int, p_discount numeric, p_tax numeric, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare o orders%rowtype; v_sum numeric := 0; ln jsonb; r jsonb;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select * into o from orders where id = p_order;
  if not found then raise exception 'order not found'; end if;
  if o.org_id not in (select pos.user_org_ids()) then raise exception 'not allowed'; end if;
  if exists (select 1 from sales_invoices where id = p_id) then
    return pos._sales_invoice_create_core(p_id, o.org_id, o.customer_id, null, p_term, p_discount, p_tax, 0, null, p_note, p_lines);
  end if;
  if o.status <> 'open' or o.paid_total > 0 then raise exception 'order is not open'; end if;
  if o.customer_id is null then raise exception 'order has no customer'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'invoice has no lines'; end if;
  for ln in select * from jsonb_array_elements(p_lines) loop
    v_sum := v_sum + round((ln->>'qty')::numeric * (ln->>'unit_price')::numeric, 2);
  end loop;
  if v_sum - coalesce(p_discount, 0) + coalesce(p_tax, 0) <> o.total then raise exception 'invoice total does not match order'; end if;
  r := pos._sales_invoice_create_core(p_id, o.org_id, o.customer_id, null, p_term, p_discount, p_tax, 0, null, p_note, p_lines);
  update sales_invoices set outlet_id = o.outlet_id, source_order_id = o.id where id = p_id;
  return r;
end $$;
revoke all on function pos.order_invoice_create(uuid, uuid, int, numeric, numeric, text, jsonb) from public, anon;
grant execute on function pos.order_invoice_create(uuid, uuid, int, numeric, numeric, text, jsonb) to authenticated, service_role;
