-- CG POS · 0107_deposit_packages_and_ledger
-- Paket deposit dan riwayat saldo deposit pelanggan (A144):
-- 1. Tabel pos.deposit_packages (nama, nominal kredit, harga jual, bonus, sold_count)
-- 2. Tabel pos.customer_deposits (saldo aktif, total beli, pakai, refund)
-- 3. Tabel pos.customer_deposit_entries (riwayat transaksi deposit)
-- 4. RPC pos.buy_deposit_package (pencatatan pembelian & jurnal akuntansi Dr Kas/Bank, Cr Deposit Pelanggan)
begin;
set local search_path = pos, extensions, public;

create table pos.deposit_packages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  credit_amount bigint not null check (credit_amount >= 1000),
  sale_price bigint not null check (sale_price >= 1000 and sale_price <= credit_amount),
  is_active boolean not null default true,
  sold_count integer not null default 0 check (sold_count >= 0),
  note text,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deposit_packages_org_idx on pos.deposit_packages (org_id, is_active) where deleted_at is null;

create table pos.customer_deposits (
  customer_id uuid primary key references pos.customers(id) on delete cascade,
  org_id uuid not null references pos.orgs(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  total_purchased bigint not null default 0 check (total_purchased >= 0),
  total_used bigint not null default 0 check (total_used >= 0),
  total_refunded bigint not null default 0 check (total_refunded >= 0),
  last_transaction_at timestamptz,
  updated_at timestamptz not null default now()
);

create index customer_deposits_org_idx on pos.customer_deposits (org_id, balance);

create table pos.customer_deposit_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid not null references pos.outlets(id) on delete cascade,
  customer_id uuid not null references pos.customers(id) on delete cascade,
  package_id uuid references pos.deposit_packages(id) on delete set null,
  package_name text not null check (char_length(btrim(package_name)) between 1 and 120),
  kind text not null check (kind in ('purchase', 'usage', 'refund')),
  credit_amount bigint not null check (credit_amount > 0),
  sale_price bigint not null default 0 check (sale_price >= 0),
  payment_method text not null default 'Tunai',
  order_number text not null check (char_length(btrim(order_number)) between 1 and 60),
  reason text,
  processed_by text not null default 'Sistem',
  journal_entry_id uuid references pos.journal_entries(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index deposit_entries_org_occurred on pos.customer_deposit_entries (org_id, occurred_at desc);
create index deposit_entries_customer on pos.customer_deposit_entries (customer_id, occurred_at desc);

-- Trigger untuk memperbarui saldo customer_deposits dan sold_count paket
create or replace function pos.sync_customer_deposit_entry() returns trigger language plpgsql set search_path = pos, extensions, pg_temp as $$
begin
  -- Upsert ringkasan saldo pelanggan
  insert into pos.customer_deposits (
    customer_id, org_id, balance, total_purchased, total_used, total_refunded, last_transaction_at, updated_at
  ) values (
    new.customer_id,
    new.org_id,
    case when new.kind = 'purchase' then new.credit_amount else 0 end,
    case when new.kind = 'purchase' then new.credit_amount else 0 end,
    case when new.kind = 'usage' then new.credit_amount else 0 end,
    case when new.kind = 'refund' then new.credit_amount else 0 end,
    new.occurred_at,
    now()
  )
  on conflict (customer_id) do update set
    balance = case
      when new.kind = 'purchase' then pos.customer_deposits.balance + new.credit_amount
      when new.kind in ('usage', 'refund') then pos.customer_deposits.balance - new.credit_amount
      else pos.customer_deposits.balance
    end,
    total_purchased = pos.customer_deposits.total_purchased + case when new.kind = 'purchase' then new.credit_amount else 0 end,
    total_used = pos.customer_deposits.total_used + case when new.kind = 'usage' then new.credit_amount else 0 end,
    total_refunded = pos.customer_deposits.total_refunded + case when new.kind = 'refund' then new.credit_amount else 0 end,
    last_transaction_at = new.occurred_at,
    updated_at = now();

  -- Bila pembelian paket, tambah sold_count pada paket
  if new.kind = 'purchase' and new.package_id is not null then
    update pos.deposit_packages
    set sold_count = sold_count + 1,
        updated_at = now()
    where id = new.package_id;
  end if;

  return new;
end $$;

create trigger trg_deposit_entry_sync
after insert on pos.customer_deposit_entries
for each row execute function pos.sync_customer_deposit_entry();

create trigger trg_touch_deposit_packages before update on pos.deposit_packages for each row execute function pos.touch_updated_at();
create trigger trg_seq_deposit_packages before insert or update on pos.deposit_packages for each row execute function pos.set_sync_seq();
create trigger trg_log_deposit_packages after insert or update or delete on pos.deposit_packages for each row execute function pos.log_change('deposit_package');

-- RPC pembelian paket deposit: mencatat riwayat transaksi dan membukukan jurnal keuangan
create or replace function pos.buy_deposit_package(
  p_id uuid,
  p_org_id uuid,
  p_outlet_id uuid,
  p_customer_id uuid,
  p_package_id uuid,
  p_payment_method text,
  p_processed_by text,
  p_pay_account uuid default null
) returns jsonb language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  pkg pos.deposit_packages%rowtype;
  cust pos.customers%rowtype;
  v_order_num text;
  v_num bigint;
  v_cash_acc uuid;
  v_deposit_acc uuid;
  v_je_id uuid;
  v_entry_id uuid;
  v_occurred timestamptz := now();
begin
  if not pos.can_manage(p_org_id) then
    raise exception 'Hanya pemilik, admin, atau manajer yang dapat memproses pembelian paket deposit.';
  end if;

  select * into pkg from pos.deposit_packages where id = p_package_id and org_id = p_org_id and deleted_at is null;
  if pkg.id is null then
    raise exception 'Paket deposit tidak ditemukan.';
  end if;
  if not pkg.is_active then
    raise exception 'Paket deposit sedang dinonaktifkan.';
  end if;

  select * into cust from pos.customers where id = p_customer_id and org_id = p_org_id and deleted_at is null;
  if cust.id is null then
    raise exception 'Pelanggan tidak ditemukan.';
  end if;

  -- Akun jurnal
  if p_pay_account is not null then
    v_cash_acc := p_pay_account;
  else
    select id into v_cash_acc from pos.accounts where org_id = p_org_id and system_key = 'cash_main' and is_active limit 1;
    if v_cash_acc is null then
      select id into v_cash_acc from pos.accounts where org_id = p_org_id and code = '1-1100' limit 1;
    end if;
  end if;

  select id into v_deposit_acc from pos.accounts where org_id = p_org_id and (system_key = 'customer_deposit' or code = '2-1300') and is_active limit 1;

  v_num := pos.next_doc_number(p_org_id, 'DEP', 0);
  v_order_num := 'DEP/' || to_char(v_occurred, 'YYMM') || '/' || lpad(v_num::text, 4, '0');

  -- Posting jurnal bila kedua akun tersedia
  if v_cash_acc is not null and v_deposit_acc is not null then
    v_je_id := pos.post_journal(
      p_org_id,
      p_outlet_id,
      (v_occurred at time zone 'Asia/Jakarta')::date,
      'DEP',
      'Pembelian paket deposit ' || pkg.name || ' oleh ' || cust.name,
      'deposit',
      coalesce(p_id, gen_random_uuid()),
      'dep:' || coalesce(p_id, gen_random_uuid())::text,
      jsonb_build_array(
        jsonb_build_object('account_id', v_cash_acc, 'debit', pkg.sale_price, 'credit', 0, 'memo', 'Penerimaan kas deposit ' || cust.name),
        jsonb_build_object('account_id', v_deposit_acc, 'debit', 0, 'credit', pkg.sale_price, 'memo', 'Kewajiban deposit pelanggan ' || cust.name)
      )
    );
  end if;

  v_entry_id := coalesce(p_id, gen_random_uuid());

  insert into pos.customer_deposit_entries (
    id, org_id, outlet_id, customer_id, package_id, package_name,
    kind, credit_amount, sale_price, payment_method, order_number,
    processed_by, journal_entry_id, occurred_at
  ) values (
    v_entry_id, p_org_id, p_outlet_id, cust.id, pkg.id, pkg.name,
    'purchase', pkg.credit_amount, pkg.sale_price, coalesce(p_payment_method, 'Tunai'), v_order_num,
    coalesce(p_processed_by, 'Kasir'), v_je_id, v_occurred
  );

  return jsonb_build_object(
    'id', v_entry_id,
    'order_number', v_order_num,
    'customer_id', cust.id,
    'customer_name', cust.name,
    'package_id', pkg.id,
    'package_name', pkg.name,
    'credit_amount', pkg.credit_amount,
    'sale_price', pkg.sale_price,
    'occurred_at', v_occurred,
    'journal_entry_id', v_je_id
  );
end $$;

-- RLS
alter table pos.deposit_packages enable row level security;
create policy sel on pos.deposit_packages for select to authenticated using (org_id in (select pos.user_org_ids()));
create policy ins on pos.deposit_packages for insert to authenticated with check (pos.can_manage(org_id));
create policy upd on pos.deposit_packages for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id));
create policy del on pos.deposit_packages for delete to authenticated using (pos.can_manage(org_id));

alter table pos.customer_deposits enable row level security;
create policy sel on pos.customer_deposits for select to authenticated using (org_id in (select pos.user_org_ids()));
create policy ins on pos.customer_deposits for insert to authenticated with check (pos.can_manage(org_id));
create policy upd on pos.customer_deposits for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id));

alter table pos.customer_deposit_entries enable row level security;
create policy sel on pos.customer_deposit_entries for select to authenticated using (org_id in (select pos.user_org_ids()));
create policy ins on pos.customer_deposit_entries for insert to authenticated with check (pos.can_manage(org_id));

revoke all on pos.deposit_packages from anon;
revoke all on pos.customer_deposits from anon;
revoke all on pos.customer_deposit_entries from anon;

grant select, insert, update, delete on pos.deposit_packages to authenticated, service_role;
grant select, insert, update on pos.customer_deposits to authenticated, service_role;
grant select, insert on pos.customer_deposit_entries to authenticated, service_role;

commit;
