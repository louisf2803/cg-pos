-- CG POS · 0129_sales_invoices
-- Faktur penjualan (B2B) dengan termin, uang muka, dan pembayaran bertahap (A129).
-- Jurnal saat faktur dibuat: Dr Piutang Usaha (sisa tagihan) + Dr Kas/Bank (uang muka) ; Cr Penjualan (setelah diskon) + Cr Pajak keluaran.
-- Jurnal tiap pembayaran: Dr Kas/Bank, Cr Piutang Usaha. Tabel hanya berubah lewat fungsi; pengelola (pos.can_manage) boleh membaca.
-- Asumsi alur yang belum dicek ke Majoo: uang muka dicatat sebagai pembayaran pertama (kolom is_down_payment), tanpa stok keluar otomatis.

create table pos.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  number text not null,
  customer_id uuid,
  invoice_date date not null,
  term_days int not null default 0 check (term_days between 0 and 3650),
  due_date date not null,
  subtotal numeric(18,2) not null check (subtotal >= 0),
  discount numeric(18,2) not null default 0 check (discount >= 0),
  tax_amount numeric(18,2) not null default 0 check (tax_amount >= 0),
  total numeric(18,2) not null check (total >= 0),
  down_payment numeric(18,2) not null default 0 check (down_payment >= 0),
  paid_total numeric(18,2) not null default 0 check (paid_total >= 0),
  status text not null default 'open' check (status in ('open', 'partially_paid', 'paid')),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (customer_id, org_id) references pos.customers(id, org_id),
  unique (org_id, number),
  unique (id, org_id),
  check (down_payment <= total and paid_total <= total)
);
create index sales_invoices_org on pos.sales_invoices (org_id, invoice_date desc);

create table pos.sales_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  invoice_id uuid not null,
  product_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  qty numeric(18,4) not null check (qty > 0 and qty <= 1000000000),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  line_total numeric(18,2) not null check (line_total >= 0),
  foreign key (invoice_id, org_id) references pos.sales_invoices(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references pos.products(id, org_id)
);
create index sales_invoice_lines_invoice on pos.sales_invoice_lines (invoice_id);

create table pos.sales_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  invoice_id uuid not null,
  paid_on date not null,
  account_id uuid not null,
  amount numeric(18,2) not null check (amount > 0),
  is_down_payment boolean not null default false,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, org_id) references pos.sales_invoices(id, org_id) on delete cascade,
  foreign key (account_id, org_id) references pos.accounts(id, org_id)
);
create index sales_invoice_payments_invoice on pos.sales_invoice_payments (invoice_id);

alter table pos.sales_invoices enable row level security;
alter table pos.sales_invoice_lines enable row level security;
alter table pos.sales_invoice_payments enable row level security;
create policy sel on pos.sales_invoices for select to authenticated using (pos.can_manage(org_id));
create policy sel on pos.sales_invoice_lines for select to authenticated using (pos.can_manage(org_id));
create policy sel on pos.sales_invoice_payments for select to authenticated using (pos.can_manage(org_id));
revoke all on pos.sales_invoices, pos.sales_invoice_lines, pos.sales_invoice_payments from anon;
grant select on pos.sales_invoices, pos.sales_invoice_lines, pos.sales_invoice_payments to authenticated;

-- Buat faktur. p_lines = [{product_id?, name, qty, unit_price}]. Idempoten menurut p_id.
-- p_down_payment > 0 wajib punya p_account (akun kas/bank yang menerima uang muka).
create or replace function pos.sales_invoice_create(
  p_id uuid, p_org uuid, p_customer uuid, p_date date, p_term int, p_discount numeric, p_tax numeric,
  p_down_payment numeric, p_account uuid, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  inv sales_invoices%rowtype; ln jsonb; v_sub numeric := 0; v_total numeric; v_dp numeric := coalesce(p_down_payment, 0); v_date date;
  v_term int := coalesce(p_term, 0); v_qty numeric; v_price numeric; v_name text; v_pid uuid; v_lt numeric; v_num bigint;
  v_ar uuid; v_rev uuid; v_tax uuid; v_jl jsonb := '[]'; v_status text; v_n int := 0; v_je uuid;
begin
  if p_id is null then raise exception 'id required'; end if;
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
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

-- Terima pembayaran faktur (sebagian atau lunas). Idempoten menurut p_id (id pembayaran).
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
  return jsonb_build_object('id', inv.id, 'status', v_status, 'paid_total', v_paid, 'journal_id', v_je);
end $$;

revoke all on function pos.sales_invoice_create(uuid, uuid, uuid, date, int, numeric, numeric, numeric, uuid, text, jsonb),
  pos.sales_invoice_pay(uuid, uuid, uuid, date, numeric, text) from public, anon;
grant execute on function pos.sales_invoice_create(uuid, uuid, uuid, date, int, numeric, numeric, numeric, uuid, text, jsonb),
  pos.sales_invoice_pay(uuid, uuid, uuid, date, numeric, text) to authenticated, service_role;
