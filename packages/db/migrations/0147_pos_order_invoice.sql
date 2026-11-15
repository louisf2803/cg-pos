-- CG POS · 0147_pos_order_invoice
-- "Jadikan Invoice" dari layar bayar kasir. sales_invoice_create (0129) hanya untuk pengelola (pos.can_manage), jadi perangkat kasir (peran cashier)
-- ditolak server, dan setelah membuat faktur kasir juga tidak boleh MEMBACA faktur. Perbaikan: isi fungsi dipisah menjadi _sales_invoice_create_core
-- (tanpa pemeriksaan peran, tidak bisa dipanggil klien), sales_invoice_create tetap memeriksa pengelola lalu memanggilnya, dan fungsi baru
-- order_invoice_create boleh dipanggil semua anggota organisasi TETAPI hanya untuk pesanan terbuka tanpa pembayaran yang punya pelanggan, dan
-- totalnya harus persis sama dengan total pesanan (klien tidak bisa mengarang nominal). Stok TIDAK dikurangi (faktur B2B; keputusan menunggu Louis).

create or replace function pos._sales_invoice_create_core(
  p_id uuid, p_org uuid, p_customer uuid, p_date date, p_term int, p_discount numeric, p_tax numeric,
  p_down_payment numeric, p_account uuid, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  inv sales_invoices%rowtype; ln jsonb; v_sub numeric := 0; v_total numeric; v_dp numeric := coalesce(p_down_payment, 0); v_date date;
  v_term int := coalesce(p_term, 0); v_qty numeric; v_price numeric; v_name text; v_pid uuid; v_lt numeric; v_num bigint;
  v_ar uuid; v_rev uuid; v_tax uuid; v_jl jsonb := '[]'; v_status text; v_n int := 0; v_je uuid;
begin
  if p_id is null then raise exception 'id required'; end if;
  select * into inv from sales_invoices where id = p_id;
  if found then
    if inv.org_id <> p_org then raise exception 'not allowed'; end if;
    return jsonb_build_object('id', inv.id, 'number', inv.number, 'total', inv.total, 'already', true);
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'invoice has no lines'; end if;
  if jsonb_array_length(p_lines) > 300 then raise exception 'too many lines'; end if;
  if p_customer is not null and not exists (select 1 from customers where id = p_customer and org_id = p_org and deleted_at is null) then raise exception 'customer not found'; end if;
  if v_term < 0 or v_term > 3650 then raise exception 'invalid term'; end if;
  if coalesce(p_discount, 0) < 0 or coalesce(p_tax, 0) < 0 or v_dp < 0 then raise exception 'amounts must not be negative'; end if;
  v_date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);

  for ln in select * from jsonb_array_elements(p_lines) loop
    v_qty := (ln->>'qty')::numeric; v_price := (ln->>'unit_price')::numeric; v_name := btrim(coalesce(ln->>'name', ''));
    if v_qty is null or v_qty <= 0 or v_qty > 1000000000 or v_qty <> round(v_qty, 4) then raise exception 'invalid line'; end if;
    if v_price is null or v_price < 0 or v_price > 1000000000000 or v_price <> round(v_price, 2) then raise exception 'invalid line'; end if;
    if char_length(v_name) < 1 or char_length(v_name) > 120 then raise exception 'invalid line'; end if;
    v_sub := v_sub + round(v_qty * v_price, 2);
  end loop;
  if coalesce(p_discount, 0) > v_sub then raise exception 'discount is larger than the invoice'; end if;
  v_total := v_sub - coalesce(p_discount, 0) + coalesce(p_tax, 0);
  if v_dp > v_total then raise exception 'down payment exceeds invoice total'; end if;
  if v_dp > 0 and (p_account is null or not exists (select 1 from accounts where id = p_account and org_id = p_org and kind = 'detail' and is_active and category = 'cash_bank')) then
    raise exception 'down payment account required';
  end if;
  v_status := case when v_dp >= v_total and v_total > 0 then 'paid' when v_dp > 0 then 'partially_paid' when v_total = 0 then 'paid' else 'open' end;

  v_num := pos.next_doc_number(p_org, 'SINV', 0);
  insert into sales_invoices(id, org_id, number, customer_id, invoice_date, term_days, due_date, subtotal, discount, tax_amount, total,
                             down_payment, paid_total, status, note, created_by)
  values (p_id, p_org, 'FJ-' || lpad(v_num::text, 6, '0'), p_customer, v_date, v_term, v_date + v_term, v_sub, coalesce(p_discount, 0), coalesce(p_tax, 0), v_total,
          v_dp, v_dp, v_status, nullif(left(btrim(coalesce(p_note, '')), 300), ''), auth.uid())
  returning * into inv;

  for ln in select * from jsonb_array_elements(p_lines) loop
    v_pid := nullif(ln->>'product_id', '')::uuid;
    if v_pid is not null and not exists (select 1 from products where id = v_pid and org_id = p_org and deleted_at is null) then raise exception 'product not found'; end if;
    v_qty := (ln->>'qty')::numeric; v_price := (ln->>'unit_price')::numeric; v_lt := round(v_qty * v_price, 2);
    insert into sales_invoice_lines(org_id, invoice_id, product_id, name, qty, unit_price, line_total)
    values (p_org, inv.id, v_pid, btrim(ln->>'name'), v_qty, v_price, v_lt);
    v_n := v_n + 1;
  end loop;

  if v_dp > 0 then
    insert into sales_invoice_payments(org_id, invoice_id, paid_on, account_id, amount, is_down_payment, note, created_by)
    values (p_org, inv.id, v_date, p_account, v_dp, true, 'Uang muka', auth.uid());
  end if;

  if v_total > 0 then
    v_ar := pos.account_id(p_org, 'accounts_receivable'); v_rev := pos.account_id(p_org, 'sales_revenue'); v_tax := pos.account_id(p_org, 'tax_payable');
    if v_total - v_dp > 0 then v_jl := v_jl || jsonb_build_array(jsonb_build_object('account_id', v_ar, 'debit', v_total - v_dp, 'memo', 'Piutang ' || inv.number)); end if;
    if v_dp > 0 then v_jl := v_jl || jsonb_build_array(jsonb_build_object('account_id', p_account, 'debit', v_dp, 'memo', 'Uang muka ' || inv.number)); end if;
    if v_sub - coalesce(p_discount, 0) > 0 then v_jl := v_jl || jsonb_build_array(jsonb_build_object('account_id', v_rev, 'credit', v_sub - coalesce(p_discount, 0), 'memo', 'Penjualan ' || inv.number)); end if;
    if coalesce(p_tax, 0) > 0 then v_jl := v_jl || jsonb_build_array(jsonb_build_object('account_id', v_tax, 'credit', p_tax, 'memo', 'Pajak keluaran ' || inv.number)); end if;
    v_je := pos.post_journal(p_org, null, pos.open_book_date(p_org, v_date), 'SINV', 'Faktur penjualan ' || inv.number, 'sales_invoice', inv.id, 'sinv:' || inv.id, v_jl);
  end if;
  return jsonb_build_object('id', inv.id, 'number', inv.number, 'total', v_total, 'lines', v_n, 'journal_id', v_je);
end $$;

create or replace function pos.sales_invoice_create(
  p_id uuid, p_org uuid, p_customer uuid, p_date date, p_term int, p_discount numeric, p_tax numeric,
  p_down_payment numeric, p_account uuid, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  return pos._sales_invoice_create_core(p_id, p_org, p_customer, p_date, p_term, p_discount, p_tax, p_down_payment, p_account, p_note, p_lines);
end $$;

revoke all on function pos._sales_invoice_create_core(uuid, uuid, uuid, date, int, numeric, numeric, numeric, uuid, text, jsonb) from public, anon, authenticated;

create or replace function pos.order_invoice_create(
  p_id uuid, p_order uuid, p_term int, p_discount numeric, p_tax numeric, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare o orders%rowtype; v_sum numeric := 0; ln jsonb;
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
  return pos._sales_invoice_create_core(p_id, o.org_id, o.customer_id, null, p_term, p_discount, p_tax, 0, null, p_note, p_lines);
end $$;

revoke all on function pos.order_invoice_create(uuid, uuid, int, numeric, numeric, text, jsonb) from public, anon;
grant execute on function pos.order_invoice_create(uuid, uuid, int, numeric, numeric, text, jsonb) to authenticated, service_role;
