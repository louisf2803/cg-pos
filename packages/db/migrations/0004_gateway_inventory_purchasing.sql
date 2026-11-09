-- CG POS · 0004_gateway_inventory_purchasing
-- Semua objek ada di schema pos. Tidak menyentuh schema public.
begin;
set local search_path = pos, extensions, public;

-- ===== 06_gateway.sql =====
-- Bagian 06: DOKU. Semua rahasia hanya di server. Tabel ini tidak pernah dibaca oleh aplikasi POS.

create table payment_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  provider text not null default 'doku' check (provider in ('doku')),
  environment text not null default 'sandbox' check (environment in ('sandbox','production')),
  client_id text not null,
  merchant_id text,
  terminal_id text,
  -- nama rahasia di Supabase Vault (atau env server), BUKAN nilai rahasianya
  secret_key_ref text not null,
  private_key_ref text not null,
  public_key_registered boolean not null default false,
  notification_url text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider, environment),
  unique (id, org_id)
);

-- cache token B2B (berlaku 15 menit). Hanya server (service role) yang boleh membaca.
create table gateway_tokens (
  account_id uuid primary key references payment_provider_accounts(id) on delete cascade,
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table gateway_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid not null,
  account_id uuid not null,
  payment_id uuid not null unique,                  -- satu pembayaran = satu transaksi gateway
  provider text not null default 'doku',
  partner_reference_no text not null check (length(partner_reference_no) between 1 and 64),
  reference_no text,                                -- nomor dari DOKU
  amount numeric(18,2) not null check (amount > 0),
  qr_content text,
  status text not null default 'created'
    check (status in ('created','pending','paid','expired','failed','cancelled','refunded')),
  expires_at timestamptz not null,                  -- dihitung sendiri; DOKU tidak punya kode kedaluwarsa pada cek status umum
  paid_at timestamptz,
  rrn text,                                         -- untuk pelacakan sengketa
  fee_amount numeric(18,2),
  convenience_fee numeric(18,2),
  last_status_code text,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  notify_count int not null default 0,
  request_log jsonb,                                -- tanpa header otentikasi dan rahasia
  response_log jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, org_id) references payment_provider_accounts(id, org_id),
  foreign key (outlet_id, org_id) references outlets(id, org_id),
  foreign key (payment_id, org_id) references payments(id, org_id),
  unique (provider, partner_reference_no),
  unique (id, org_id)
);
create index on gateway_transactions (status, next_check_at) where status in ('created','pending');
create index on gateway_transactions (org_id, created_at desc);
create index on gateway_transactions (reference_no) where reference_no is not null;

alter table refunds add constraint refunds_gateway_fk
  foreign key (gateway_transaction_id) references gateway_transactions(id);

-- setiap notifikasi masuk dicatat dulu, baru diproses. dedupe_key membuat notifikasi ganda tidak diproses dua kali.
create table gateway_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id) on delete cascade,
  provider text not null default 'doku',
  dedupe_key text not null,                         -- X-EXTERNAL-ID + partner ref + status
  external_id text,
  partner_reference_no text,
  event_type text not null default 'payment_notify',
  latest_status text,
  headers jsonb not null default '{}',              -- tanpa rahasia
  body jsonb not null,
  signature_valid boolean,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, dedupe_key)
);
create index on gateway_events (partner_reference_no);
create index on gateway_events (status) where status = 'received';

-- laporan settlement dari DOKU (diimpor). Dasar pelunasan akun perantara non-tunai.
create table gateway_settlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  account_id uuid not null,
  reference text,
  settlement_date date not null,
  gross_amount numeric(18,2) not null,
  fee_total numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null,
  status text not null default 'processing' check (status in ('processing','pending','settled')),
  bank_account_id uuid,                              -- akun kas/bank tujuan
  journal_entry_id uuid,
  imported_at timestamptz not null default now(),
  foreign key (account_id, org_id) references payment_provider_accounts(id, org_id),
  foreign key (bank_account_id, org_id) references accounts(id, org_id),
  unique (id, org_id),
  check (net_amount = gross_amount - fee_total)
);
create unique index gateway_settlements_ref on gateway_settlements (account_id, reference) where reference is not null;
create table gateway_settlement_lines (
  settlement_id uuid not null,
  gateway_transaction_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  amount numeric(18,2) not null,
  fee numeric(18,2) not null default 0,
  primary key (settlement_id, gateway_transaction_id),
  foreign key (settlement_id, org_id) references gateway_settlements(id, org_id) on delete cascade,
  foreign key (gateway_transaction_id, org_id) references gateway_transactions(id, org_id)
);
create unique index gateway_settlement_lines_once on gateway_settlement_lines (gateway_transaction_id);

-- ===== 07_inventory.sql =====
-- Bagian 07: stok per lokasi, pergerakan stok (append-only), opname, transfer

create table stock_balances (
  location_id uuid not null,
  product_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  qty numeric(18,4) not null default 0,             -- boleh negatif (keputusan 9 Nov 2026)
  avg_cost numeric(18,4) not null default 0 check (avg_cost >= 0),
  updated_at timestamptz not null default now(),
  primary key (location_id, product_id),
  foreign key (location_id, org_id) references locations(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references products(id, org_id)
);
create index on stock_balances (product_id);
create index on stock_balances (org_id, location_id) where qty <= 0;

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  location_id uuid not null,
  product_id uuid not null,
  kind text not null check (kind in (
    'sale','sale_void','refund_return','purchase_receipt','purchase_return',
    'transfer_out','transfer_in','waste','production_in','production_out','opname_adjust','opening')),
  qty_delta numeric(18,4) not null check (qty_delta <> 0),   -- dalam satuan dasar
  unit_cost numeric(18,4) not null default 0 check (unit_cost >= 0),  -- masuk: harga perolehan; keluar: diisi pemicu dari rata-rata
  total_cost numeric(18,4) not null default 0,               -- bertanda, = qty_delta * unit_cost (diisi pemicu)
  qty_after numeric(18,4),
  avg_cost_after numeric(18,4),
  ref_type text, ref_id uuid,
  source_key text,                                           -- idempotensi
  reason text,
  occurred_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (location_id, org_id) references locations(id, org_id),
  foreign key (product_id, org_id) references products(id, org_id),
  check (kind not in ('sale','waste','transfer_out','purchase_return','production_out') or qty_delta < 0),
  check (kind not in ('sale_void','refund_return','purchase_receipt','transfer_in','production_in') or qty_delta > 0)
);
create unique index stock_movements_source_key on stock_movements (org_id, source_key) where source_key is not null;
create index on stock_movements (location_id, product_id, occurred_at desc);
create index on stock_movements (ref_type, ref_id);

-- Biaya rata-rata bergerak. Pemicu mengunci baris saldo, menghitung ulang, dan mengisi biaya keluar.
create or replace function pos.stock_movement_apply() returns trigger
language plpgsql as $$
declare b stock_balances%rowtype; v_new_qty numeric; v_new_avg numeric;
begin
  -- kunci idempotensi dicek di sini, sebelum saldo disentuh (ON CONFLICT terlambat: pemicu BEFORE sudah jalan)
  if new.source_key is not null and exists (
       select 1 from stock_movements where org_id = new.org_id and source_key = new.source_key) then
    return null;
  end if;
  insert into stock_balances(location_id, product_id, org_id) values (new.location_id, new.product_id, new.org_id)
  on conflict do nothing;
  select * into b from stock_balances where location_id = new.location_id and product_id = new.product_id for update;

  if new.qty_delta > 0 then
    -- masuk. Bila saldo <= 0, harga rata-rata dimulai ulang dari biaya masuk.
    if b.qty <= 0 then v_new_avg := new.unit_cost;
    else v_new_avg := (b.qty * b.avg_cost + new.qty_delta * new.unit_cost) / (b.qty + new.qty_delta);
    end if;
  else
    -- keluar memakai rata-rata saat ini; rata-rata tidak berubah
    new.unit_cost := b.avg_cost;
    v_new_avg := b.avg_cost;
  end if;
  new.total_cost := round(new.qty_delta * new.unit_cost, 4);
  v_new_qty := b.qty + new.qty_delta;
  new.qty_after := v_new_qty;
  new.avg_cost_after := v_new_avg;
  update stock_balances set qty = v_new_qty, avg_cost = round(v_new_avg, 4), updated_at = now()
   where location_id = new.location_id and product_id = new.product_id;
  return new;
end $$;
create trigger stock_movements_apply before insert on stock_movements
  for each row execute function pos.stock_movement_apply();

create or replace function pos.stock_movements_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from orgs where id = old.org_id) then return old; end if;   -- hapus-org berantai
  raise exception 'stock movements are append-only; post a correcting movement';
end $$;
create trigger stock_movements_no_change before update or delete on stock_movements
  for each row execute function pos.stock_movements_immutable();

create table stock_opnames (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  location_id uuid not null,
  number text not null,
  status text not null default 'draft' check (status in ('draft','final')),
  counted_at timestamptz not null default now(),
  note text,
  created_by uuid,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (location_id, org_id) references locations(id, org_id),
  unique (org_id, number),
  unique (id, org_id)
);
create table stock_opname_lines (
  opname_id uuid not null,
  product_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  system_qty numeric(18,4) not null,
  counted_qty numeric(18,4) not null check (counted_qty >= 0),
  difference numeric(18,4) generated always as (counted_qty - system_qty) stored,
  primary key (opname_id, product_id),
  foreign key (opname_id, org_id) references stock_opnames(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references products(id, org_id)
);

create table stock_transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  from_location_id uuid not null,
  to_location_id uuid not null,
  number text not null,
  status text not null default 'draft' check (status in ('draft','in_transit','received','cancelled')),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (from_location_id, org_id) references locations(id, org_id),
  foreign key (to_location_id, org_id) references locations(id, org_id),
  unique (org_id, number),
  unique (id, org_id),
  check (from_location_id <> to_location_id)
);
create table stock_transfer_lines (
  transfer_id uuid not null,
  product_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  qty numeric(18,4) not null check (qty > 0),
  received_qty numeric(18,4) not null default 0 check (received_qty >= 0),
  primary key (transfer_id, product_id),
  foreign key (transfer_id, org_id) references stock_transfers(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references products(id, org_id)
);

-- ===== 08_purchasing.sql =====
-- Bagian 08: pembelian (rantai dokumen dengan referensi opsional). Permintaan Barang ditunda ke T3.

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  code text, name text not null, phone text, email text, address text,
  term_days int not null default 0 check (term_days >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index on suppliers (org_id, lower(name));

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  location_id uuid not null,
  supplier_id uuid not null,
  number text not null,
  status text not null default 'draft' check (status in ('draft','ordered','partially_received','received','cancelled')),
  order_date date not null default current_date,
  expected_date date,
  discount numeric(18,2) not null default 0 check (discount >= 0),
  tax_amount numeric(18,2) not null default 0 check (tax_amount >= 0),
  other_cost numeric(18,2) not null default 0 check (other_cost >= 0),
  down_payment numeric(18,2) not null default 0 check (down_payment >= 0),
  down_payment_account_id uuid,
  total numeric(18,2) not null default 0,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (location_id, org_id) references locations(id, org_id),
  foreign key (supplier_id, org_id) references suppliers(id, org_id),
  foreign key (down_payment_account_id, org_id) references accounts(id, org_id),
  unique (org_id, number),
  unique (id, org_id)
);
create table purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  order_id uuid not null,
  product_id uuid not null,
  unit_id uuid not null,
  qty numeric(18,4) not null check (qty > 0),
  unit_price numeric(18,4) not null check (unit_price >= 0),
  discount numeric(18,2) not null default 0 check (discount >= 0),
  foreign key (order_id, org_id) references purchase_orders(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references products(id, org_id),
  foreign key (unit_id, org_id) references units(id, org_id),
  unique (id, org_id)
);
create index on purchase_order_lines (order_id);

create table purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  location_id uuid not null,
  supplier_id uuid,                                  -- kosong = "tanpa pemasok"
  order_id uuid,                                     -- referensi opsional ke PO
  number text not null,
  supplier_invoice_no text,
  invoice_date date not null default current_date,
  term_days int not null default 0 check (term_days >= 0),
  due_date date,
  status text not null default 'open' check (status in ('open','partially_paid','paid','void')),
  subtotal numeric(18,2) not null default 0,
  discount numeric(18,2) not null default 0 check (discount >= 0),
  tax_amount numeric(18,2) not null default 0 check (tax_amount >= 0),
  other_cost numeric(18,2) not null default 0 check (other_cost >= 0),
  down_payment_applied numeric(18,2) not null default 0 check (down_payment_applied >= 0),
  total numeric(18,2) not null default 0,
  paid_total numeric(18,2) not null default 0 check (paid_total >= 0),
  attachment_path text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (location_id, org_id) references locations(id, org_id),
  foreign key (supplier_id, org_id) references suppliers(id, org_id),
  foreign key (order_id, org_id) references purchase_orders(id, org_id),
  unique (org_id, number),
  unique (id, org_id)
);
create index on purchase_invoices (org_id, supplier_id, status);
create index on purchase_invoices (org_id, due_date) where status in ('open','partially_paid');
create table purchase_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  invoice_id uuid not null,
  product_id uuid not null,
  unit_id uuid not null,
  qty numeric(18,4) not null check (qty > 0),
  received_qty numeric(18,4) not null default 0 check (received_qty >= 0),   -- diterima sebagian = kurang dari qty
  unit_price numeric(18,4) not null check (unit_price >= 0),
  discount numeric(18,2) not null default 0 check (discount >= 0),
  line_total numeric(18,2) not null,
  foreign key (invoice_id, org_id) references purchase_invoices(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references products(id, org_id),
  foreign key (unit_id, org_id) references units(id, org_id),
  unique (id, org_id),
  check (received_qty <= qty)
);
create index on purchase_invoice_lines (invoice_id);

create table purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  invoice_id uuid not null,
  received_at timestamptz not null default now(),
  received_by uuid,
  note text,
  foreign key (invoice_id, org_id) references purchase_invoices(id, org_id) on delete cascade,
  unique (id, org_id)
);
create table purchase_receipt_lines (
  receipt_id uuid not null,
  invoice_line_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  qty numeric(18,4) not null check (qty > 0),
  primary key (receipt_id, invoice_line_id),
  foreign key (receipt_id, org_id) references purchase_receipts(id, org_id) on delete cascade,
  foreign key (invoice_line_id, org_id) references purchase_invoice_lines(id, org_id)
);

create table purchase_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  invoice_id uuid not null,
  number text not null,
  paid_at date not null default current_date,
  account_id uuid not null,                          -- akun kas atau bank yang dikredit
  amount numeric(18,2) not null check (amount > 0),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, org_id) references purchase_invoices(id, org_id),
  foreign key (account_id, org_id) references accounts(id, org_id),
  unique (org_id, number)
);
create index on purchase_payments (invoice_id);

-- ===== 09_finance_extra.sql =====
-- Bagian 09: kas dan bank, rekonsiliasi non-tunai, aset tetap

-- Buku Kas: penerimaan (BKM), pengeluaran (BKK), transfer (BTU). Tiap baris menghasilkan jurnal.
create table cash_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid,
  kind text not null check (kind in ('receipt','expense','transfer')),
  number text not null,
  txn_date date not null default current_date,
  cash_account_id uuid not null,                     -- akun kas/bank utama
  to_account_id uuid,                                -- untuk transfer
  amount numeric(18,2) not null check (amount > 0),
  description text,
  attachment_path text,
  journal_entry_id uuid,
  status text not null default 'posted' check (status in ('draft','posted','voided')),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references outlets(id, org_id),
  foreign key (cash_account_id, org_id) references accounts(id, org_id),
  foreign key (to_account_id, org_id) references accounts(id, org_id),
  unique (org_id, number),
  check ((kind = 'transfer') = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> cash_account_id)
);
create table cash_transaction_lines (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  account_id uuid not null,                          -- akun beban atau pendapatan lawan
  amount numeric(18,2) not null check (amount > 0),
  memo text,
  foreign key (transaction_id) references cash_transactions(id) on delete cascade,
  foreign key (account_id, org_id) references accounts(id, org_id)
);

-- Rekonsiliasi penerimaan non-tunai: satuannya satu shift per metode bayar.
create table reconciliations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid not null,
  shift_id uuid not null,
  method_id uuid not null,
  number text not null,
  expected_amount numeric(18,2) not null,            -- jumlah pembayaran sukses pada shift itu
  actual_amount numeric(18,2),                       -- uang yang benar-benar masuk (dari bank/settlement)
  fee_amount numeric(18,2) not null default 0,
  difference numeric(18,2),
  status text not null default 'unreconciled' check (status in ('unreconciled','reconciled')),
  bank_account_id uuid,
  settlement_id uuid,
  journal_entry_id uuid,
  reconciled_at timestamptz,
  reconciled_by uuid,
  created_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references outlets(id, org_id),
  foreign key (shift_id, org_id) references shifts(id, org_id),
  foreign key (method_id, org_id) references payment_methods(id, org_id),
  foreign key (bank_account_id, org_id) references accounts(id, org_id),
  foreign key (settlement_id, org_id) references gateway_settlements(id, org_id),
  unique (org_id, number),
  unique (shift_id, method_id),
  check (status <> 'reconciled' or (actual_amount is not null and bank_account_id is not null))
);
create index on reconciliations (outlet_id, status);

create table fixed_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid,
  name text not null,
  acquired_on date not null,
  cost numeric(18,2) not null check (cost > 0),
  salvage_value numeric(18,2) not null default 0 check (salvage_value >= 0),
  useful_life_months int check (useful_life_months is null or useful_life_months > 0),
  asset_account_id uuid not null,
  accumulated_account_id uuid,
  expense_account_id uuid,
  status text not null default 'active' check (status in ('active','disposed')),
  created_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references outlets(id, org_id),
  foreign key (asset_account_id, org_id) references accounts(id, org_id),
  foreign key (accumulated_account_id, org_id) references accounts(id, org_id),
  foreign key (expense_account_id, org_id) references accounts(id, org_id),
  check (salvage_value < cost)
);
create table asset_depreciations (
  asset_id uuid not null references fixed_assets(id) on delete cascade,
  period date not null,                              -- tanggal pertama bulan
  amount numeric(18,2) not null check (amount > 0),
  journal_entry_id uuid,
  primary key (asset_id, period)
);


commit;
