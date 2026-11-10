-- CG POS · 0016_purchasing
-- Pembelian stok: pemesanan (PO), faktur pembelian dengan penerimaan sebagian, dan pembayaran faktur.
-- Faktur, penerimaan, dan pembayaran hanya bisa ditulis lewat fungsi (tulis langsung dari klien dicabut), supaya
-- stok, jurnal, dan saldo hutang selalu sejalan:
--   * pos.purchase_order_save    : buat atau ubah PO (draf/dipesan/batal); total dihitung server; nomor PO-000001
--   * pos.purchase_invoice_create: faktur + baris + (opsional) penerimaan awal; membukukan jurnal
--        Dr Persediaan (subtotal - diskon + biaya lain), Dr Pajak Masukan, Cr Utang Usaha
--      dan stok masuk 'purchase_receipt' per barang diterima (biaya per satuan dasar = nilai baris + bagian diskon/biaya lain)
--   * pos.purchase_receive       : penerimaan lanjutan untuk baris yang belum lengkap
--   * pos.purchase_pay           : bayar faktur (Dr Utang Usaha, Cr kas/bank); status open/partially_paid/paid
-- Tidak ada pembatalan faktur di versi ini: koreksi lewat stok keluar dan jurnal manual oleh pemilik.
begin;

-- tulis langsung dicabut untuk tabel yang diatur fungsi
do $$
declare t text;
begin
  foreach t in array array['purchase_invoices','purchase_invoice_lines','purchase_receipts','purchase_receipt_lines','purchase_payments'] loop
    execute format('drop policy if exists ins on pos.%I', t);
    execute format('drop policy if exists upd on pos.%I', t);
    execute format('drop policy if exists del on pos.%I', t);
  end loop;
end $$;

create or replace function pos.purchase_order_save(
  p_id uuid, p_location uuid, p_supplier uuid, p_date date, p_expected date,
  p_discount numeric, p_tax numeric, p_other numeric, p_note text, p_status text, p_lines jsonb) returns jsonb
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
  if coalesce(p_discount, 0) < 0 or coalesce(p_tax, 0) < 0 or coalesce(p_other, 0) < 0 then raise exception 'amounts must not be negative'; end if;
  if p_status <> 'cancelled' and jsonb_array_length(p_lines) = 0 then raise exception 'order has no lines'; end if;

  select * into o from purchase_orders where id = p_id for update;
  if found then
    if o.org_id <> l.org_id then raise exception 'order belongs to another organization'; end if;
    if o.status in ('partially_received','received') then raise exception 'order already received'; end if;
    if o.status = 'cancelled' then raise exception 'order is cancelled'; end if;
  end if;

  -- hitung lebih dulu: subtotal dari baris
  for ln in select * from jsonb_array_elements(p_lines) loop
    v_qty := (ln->>'qty')::numeric; v_price := (ln->>'unit_price')::numeric; v_disc := coalesce((ln->>'discount')::numeric, 0);
    if v_qty is null or v_qty <= 0 or v_qty > 1000000000 or v_qty <> round(v_qty, 4) then raise exception 'invalid line'; end if;
    if v_price is null or v_price < 0 or v_price > 1000000000000 or v_disc < 0 or v_disc > v_qty * v_price then raise exception 'invalid line'; end if;
    v_sub := v_sub + round(v_qty * v_price - v_disc, 2);
  end loop;
  v_total := v_sub - coalesce(p_discount, 0) + coalesce(p_tax, 0) + coalesce(p_other, 0);
  if v_total < 0 then raise exception 'discount is larger than the order'; end if;

  if o.id is null then
    v_num := pos.next_doc_number(l.org_id, 'PO', 0);
    insert into purchase_orders(id, org_id, location_id, supplier_id, number, status, order_date, expected_date, discount, tax_amount, other_cost, total, note, created_by)
    values (p_id, l.org_id, l.id, p_supplier, 'PO-' || lpad(v_num::text, 6, '0'), p_status, coalesce(p_date, current_date), p_expected,
            coalesce(p_discount, 0), coalesce(p_tax, 0), coalesce(p_other, 0), v_total, nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid())
    returning * into o;
  else
    update purchase_orders set supplier_id = p_supplier, status = p_status, order_date = coalesce(p_date, order_date), expected_date = p_expected,
           discount = coalesce(p_discount, 0), tax_amount = coalesce(p_tax, 0), other_cost = coalesce(p_other, 0), total = v_total,
           note = nullif(left(trim(coalesce(p_note, '')), 200), ''), updated_at = now()
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
revoke all on function pos.purchase_order_save(uuid, uuid, uuid, date, date, numeric, numeric, numeric, text, text, jsonb) from public, anon;
grant execute on function pos.purchase_order_save(uuid, uuid, uuid, date, date, numeric, numeric, numeric, text, text, jsonb) to authenticated, service_role;

-- penerimaan: menulis satu penerimaan + gerakan stok untuk baris yang diterima
create or replace function pos.purchase_receive_lines(p_invoice uuid, p_receipt uuid, p_note text, p_items jsonb) returns int
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  inv purchase_invoices%rowtype; it jsonb; ln purchase_invoice_lines%rowtype; v_qty numeric; v_conv numeric; v_factor numeric; v_cost numeric; v_n int := 0;
begin
  select * into inv from purchase_invoices where id = p_invoice;
  if inv.subtotal > 0 then v_factor := (inv.subtotal - inv.discount + inv.other_cost) / inv.subtotal; else v_factor := 1; end if;
  insert into purchase_receipts(id, org_id, invoice_id, received_by, note)
  values (p_receipt, inv.org_id, inv.id, auth.uid(), nullif(left(trim(coalesce(p_note, '')), 200), ''));
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty <> round(v_qty, 4) then raise exception 'invalid receipt quantity'; end if;
    select * into ln from purchase_invoice_lines where id = (it->>'line_id')::uuid and invoice_id = inv.id for update;
    if not found then raise exception 'invoice line not found'; end if;
    if ln.received_qty + v_qty > ln.qty then raise exception 'received quantity exceeds invoice quantity'; end if;
    select conversion into v_conv from product_units where product_id = ln.product_id and unit_id = ln.unit_id and org_id = inv.org_id and deleted_at is null;
    v_conv := coalesce(v_conv, 1);
    -- biaya per satuan dasar: nilai baris per satuan beli, ditambah bagian diskon/biaya lain faktur, dibagi konversi
    v_cost := round((ln.line_total / ln.qty) * v_factor / v_conv, 4);
    insert into purchase_receipt_lines(receipt_id, invoice_line_id, org_id, qty) values (p_receipt, ln.id, inv.org_id, v_qty);
    update purchase_invoice_lines set received_qty = received_qty + v_qty where id = ln.id;
    insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, ref_type, ref_id, source_key, reason, created_by)
    values (inv.org_id, inv.location_id, ln.product_id, 'purchase_receipt', round(v_qty * v_conv, 4), v_cost, 'purchase_invoice', inv.id,
            'purchase:' || p_receipt || ':' || ln.id, 'Faktur ' || inv.number, auth.uid());
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function pos.purchase_receive_lines(uuid, uuid, text, jsonb) from public, anon, authenticated;

create or replace function pos.purchase_invoice_create(
  p_id uuid, p_location uuid, p_supplier uuid, p_order uuid, p_supplier_no text, p_date date, p_term int,
  p_discount numeric, p_tax numeric, p_other numeric, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  l locations%rowtype; inv purchase_invoices%rowtype; ln jsonb; v_sub numeric := 0; v_total numeric; v_num bigint; v_pid uuid; v_unit uuid;
  v_qty numeric; v_price numeric; v_disc numeric; v_recv numeric; v_line uuid; v_lt numeric; v_items jsonb := '[]'; v_date date; v_je uuid;
  v_inv_acc uuid; v_ap_acc uuid; v_tax_acc uuid; v_jl jsonb := '[]'; v_stock_value numeric; v_n int := 0; v_term int;
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
  if coalesce(p_discount, 0) < 0 or coalesce(p_tax, 0) < 0 or coalesce(p_other, 0) < 0 then raise exception 'amounts must not be negative'; end if;
  if p_order is not null and not exists (select 1 from purchase_orders where id = p_order and org_id = l.org_id and status in ('ordered','partially_received')) then
    raise exception 'order is not open';
  end if;
  v_term := coalesce(p_term, (select term_days from suppliers where id = p_supplier), 0);
  if v_term < 0 or v_term > 3650 then raise exception 'invalid term'; end if;
  v_date := coalesce(p_date, current_date);

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

  v_num := pos.next_doc_number(l.org_id, 'PINV', 0);
  insert into purchase_invoices(id, org_id, location_id, supplier_id, order_id, number, supplier_invoice_no, invoice_date, term_days, due_date,
                                subtotal, discount, tax_amount, other_cost, total, note, created_by)
  values (p_id, l.org_id, l.id, p_supplier, p_order, 'FPB-' || lpad(v_num::text, 6, '0'), nullif(left(trim(coalesce(p_supplier_no, '')), 60), ''),
          v_date, v_term, v_date + v_term, v_sub, coalesce(p_discount, 0), coalesce(p_tax, 0), coalesce(p_other, 0), v_total,
          nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid())
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
revoke all on function pos.purchase_invoice_create(uuid, uuid, uuid, uuid, text, date, int, numeric, numeric, numeric, text, jsonb) from public, anon;
grant execute on function pos.purchase_invoice_create(uuid, uuid, uuid, uuid, text, date, int, numeric, numeric, numeric, text, jsonb) to authenticated, service_role;

create or replace function pos.purchase_receive(p_invoice uuid, p_receipt uuid, p_note text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare inv purchase_invoices%rowtype; v_n int;
begin
  select * into inv from purchase_invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found'; end if;
  if not pos.can_manage(inv.org_id) then raise exception 'not allowed'; end if;
  if inv.status = 'void' then raise exception 'invoice is void'; end if;
  if p_receipt is null then raise exception 'receipt id required'; end if;
  if exists (select 1 from purchase_receipts where id = p_receipt) then return jsonb_build_object('id', p_receipt, 'already', true); end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'nothing to receive'; end if;
  v_n := pos.purchase_receive_lines(inv.id, p_receipt, p_note, p_items);
  return jsonb_build_object('id', p_receipt, 'lines', v_n);
end $$;
revoke all on function pos.purchase_receive(uuid, uuid, text, jsonb) from public, anon;
grant execute on function pos.purchase_receive(uuid, uuid, text, jsonb) to authenticated, service_role;

create or replace function pos.purchase_pay(p_id uuid, p_invoice uuid, p_account uuid, p_amount numeric, p_date date, p_note text) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare inv purchase_invoices%rowtype; pay purchase_payments%rowtype; a accounts%rowtype; v_num bigint; v_paid numeric; v_date date;
begin
  if p_id is null then raise exception 'id required'; end if;
  select * into inv from purchase_invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found'; end if;
  if not pos.can_manage(inv.org_id) then raise exception 'not allowed'; end if;
  select * into pay from purchase_payments where id = p_id;
  if found then return jsonb_build_object('id', pay.id, 'number', pay.number, 'already', true); end if;
  if inv.status not in ('open','partially_paid') then raise exception 'invoice is not open'; end if;
  select * into a from accounts where id = p_account and org_id = inv.org_id and is_active and kind = 'detail' and category = 'cash_bank';
  if not found then raise exception 'payment account must be a cash or bank account'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'invalid amount'; end if;
  if p_amount > inv.total - inv.paid_total then raise exception 'payment exceeds outstanding balance'; end if;
  v_date := coalesce(p_date, current_date);
  v_num := pos.next_doc_number(inv.org_id, 'PPAY', 0);
  insert into purchase_payments(id, org_id, invoice_id, number, paid_at, account_id, amount, note, created_by)
  values (p_id, inv.org_id, inv.id, 'BYR-' || lpad(v_num::text, 6, '0'), v_date, a.id, p_amount, nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid())
  returning * into pay;
  v_paid := inv.paid_total + p_amount;
  update purchase_invoices set paid_total = v_paid, status = case when v_paid >= total then 'paid' else 'partially_paid' end, updated_at = now() where id = inv.id;
  perform pos.post_journal(inv.org_id, null, pos.open_book_date(inv.org_id, v_date), 'PAY', 'Bayar ' || inv.number, 'purchase_payment', pay.id, 'purchasepay:' || pay.id,
    jsonb_build_array(jsonb_build_object('account_id', pos.account_id(inv.org_id, 'accounts_payable'), 'debit', p_amount, 'memo', pay.number),
                      jsonb_build_object('account_id', a.id, 'credit', p_amount, 'memo', pay.number)));
  return jsonb_build_object('id', pay.id, 'number', pay.number, 'paid_total', v_paid);
end $$;
revoke all on function pos.purchase_pay(uuid, uuid, uuid, numeric, date, text) from public, anon;
grant execute on function pos.purchase_pay(uuid, uuid, uuid, numeric, date, text) to authenticated, service_role;

commit;
