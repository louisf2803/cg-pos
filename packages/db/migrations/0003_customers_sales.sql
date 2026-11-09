-- CG POS · 0003_customers_sales
-- Semua objek ada di schema pos. Tidak menyentuh schema public.
begin;
set local search_path = pos, extensions, public;

-- ===== 04_customers_floor.sql =====
-- Bagian 04: pelanggan, promo, loyalti, denah meja

create table customer_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  code text,
  name text not null,
  phone text, email text,
  gender text check (gender in ('female','male','other')),
  birth_date date,
  group_id uuid references customer_groups(id) on delete set null,
  city text, address text, note text, photo_path text,
  points_balance bigint not null default 0,      -- cache dari loyalty_ledger
  deposit_balance numeric(18,2) not null default 0,   -- T3, cache dari deposit_ledger
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create unique index customers_code on customers (org_id, code) where code is not null and deleted_at is null;
create index on customers (org_id, phone) where phone is not null;
create index on customers (org_id, lower(name));

create table promotions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('percent_order','amount_order','percent_item','amount_item','free_item')),
  value numeric(18,2) not null default 0 check (value >= 0),
  min_spend numeric(18,2) not null default 0,
  product_ids uuid[] not null default '{}',
  free_product_id uuid,
  order_types text[] not null default '{dine_in,takeaway,delivery,service}',
  outlet_ids uuid[] not null default '{}',        -- kosong = semua outlet
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create table coupons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  promotion_id uuid not null,
  code text not null,
  usage_limit int,
  used_count int not null default 0,
  valid_from timestamptz, valid_to timestamptz,
  is_active boolean not null default true,
  sync_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (promotion_id, org_id) references promotions(id, org_id) on delete cascade,
  unique (org_id, code)
);
create table loyalty_rules (
  org_id uuid primary key references orgs(id) on delete cascade,
  earn_amount numeric(18,2) not null default 10000,    -- setiap kelipatan ini
  earn_points int not null default 1,                  -- dapat sekian poin
  redeem_value_per_point numeric(18,2) not null default 100,
  birthday_bonus_points int not null default 0,
  is_active boolean not null default false,
  updated_at timestamptz not null default now()
);
create table loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  customer_id uuid not null,
  order_id uuid,
  points_delta int not null check (points_delta <> 0),
  kind text not null check (kind in ('earn','redeem','adjust','birthday','refund_reverse')),
  note text,
  created_at timestamptz not null default now(),
  foreign key (customer_id, org_id) references customers(id, org_id) on delete cascade
);
create index on loyalty_ledger (customer_id, created_at desc);

create table floors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid not null,
  name text not null,
  layout_type text not null default 'grid' check (layout_type in ('grid','custom')),
  image_path text,
  sort int not null default 0,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade,
  unique (id, org_id)
);
create table tables (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid not null,
  floor_id uuid,
  name text not null,
  kind text,
  seat_limit_minutes int check (seat_limit_minutes is null or seat_limit_minutes > 0),
  reminder_minutes int check (reminder_minutes is null or reminder_minutes > 0),
  pos_x int, pos_y int, width int, height int,      -- hanya untuk denah kustom
  sort int not null default 0,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade,
  foreign key (floor_id, org_id) references floors(id, org_id) on delete set null (floor_id),
  unique (id, org_id)
);
create unique index tables_name on tables (outlet_id, name) where deleted_at is null;

-- ===== 05_sales.sql =====
-- Bagian 05: metode bayar, shift, order, pembayaran, void, refund, antrean sinkron

create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null check (kind in ('cash','noncash','gateway','complimentary','deposit')),
  account_id uuid not null,                       -- akun yang di-debit saat pembayaran ini diterima
  requires_online boolean not null default false,
  is_active boolean not null default true,
  sort int not null default 0,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, org_id) references accounts(id, org_id),
  unique (org_id, code),
  unique (id, org_id)
);

create table shifts (
  id uuid primary key,                            -- dibuat di perangkat (UUID v7 disarankan)
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid not null,
  device_id uuid not null,
  cashier_id uuid not null,
  opened_at timestamptz not null,
  opening_cash numeric(18,2) not null default 0 check (opening_cash >= 0),
  closed_at timestamptz,
  closed_by uuid,
  closing_cash_counted numeric(18,2) check (closing_cash_counted is null or closing_cash_counted >= 0),
  expected_cash numeric(18,2),
  cash_variance numeric(18,2),                    -- counted - expected
  status text not null default 'open' check (status in ('open','closed')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references outlets(id, org_id),
  foreign key (device_id, org_id) references devices(id, org_id),
  foreign key (cashier_id, org_id) references employees(id, org_id),
  unique (id, org_id),
  check ((status = 'closed') = (closed_at is not null))
);
create unique index shifts_one_open_per_device on shifts (device_id) where status = 'open';
create index on shifts (outlet_id, opened_at desc);

create table cash_movements (
  id uuid primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  shift_id uuid not null,
  kind text not null check (kind in ('in','out')),
  amount numeric(18,2) not null check (amount > 0),
  reason text not null,
  account_id uuid,                                -- akun lawan (beban untuk kas keluar); kosong = akun bawaan
  photo_path text,
  employee_id uuid,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (shift_id, org_id) references shifts(id, org_id) on delete cascade,
  foreign key (account_id, org_id) references accounts(id, org_id)
);
create index on cash_movements (shift_id);

create table orders (
  id uuid primary key,                            -- dibuat di perangkat
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid not null,
  device_id uuid not null,
  shift_id uuid,
  cashier_id uuid not null,
  number text not null,                           -- {kode outlet}/{kode perangkat}/{yymmdd}/{urut}, unik per outlet
  queue_no int,
  order_type text not null check (order_type in ('dine_in','takeaway','delivery','service')),
  table_id uuid,
  customer_id uuid,
  guest_count int check (guest_count is null or guest_count >= 0),
  label text,                                     -- nama order
  note text,
  status text not null default 'open' check (status in ('open','partially_paid','paid','void')),
  -- subtotal selalu tanpa pajak. total = subtotal - discount_total + service_charge + tax_total + rounding
  subtotal numeric(18,2) not null default 0,
  discount_total numeric(18,2) not null default 0 check (discount_total >= 0),
  service_charge numeric(18,2) not null default 0 check (service_charge >= 0),
  tax_total numeric(18,2) not null default 0 check (tax_total >= 0),
  rounding numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0 check (total >= 0),
  paid_total numeric(18,2) not null default 0 check (paid_total >= 0),
  balance numeric(18,2) generated always as (total - paid_total) stored,
  version int not null default 1,                 -- naik tiap perubahan, untuk deteksi konflik antar perangkat
  opened_at timestamptz not null,
  closed_at timestamptz,
  finalized_at timestamptz,                       -- jurnal dan stok sudah diposting
  client_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references outlets(id, org_id),
  foreign key (device_id, org_id) references devices(id, org_id),
  foreign key (shift_id, org_id) references shifts(id, org_id),
  foreign key (cashier_id, org_id) references employees(id, org_id),
  foreign key (table_id, org_id) references tables(id, org_id),
  foreign key (customer_id, org_id) references customers(id, org_id),
  unique (outlet_id, number),
  unique (id, org_id),
  check (total = subtotal - discount_total + service_charge + tax_total + rounding)
);
-- satu meja hanya boleh punya satu order yang masih berjalan
create unique index orders_one_open_per_table on orders (table_id) where table_id is not null and status in ('open','partially_paid');
create index on orders (outlet_id, opened_at desc);
create index on orders (outlet_id, status) where status in ('open','partially_paid');
create index on orders (shift_id);
create index on orders (customer_id) where customer_id is not null;
create index on orders (org_id, finalized_at) where finalized_at is null and status = 'paid';

create table order_items (
  id uuid primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  order_id uuid not null,
  product_id uuid not null,
  product_unit_id uuid not null,
  name text not null,                              -- salinan nama dan SKU saat dijual
  sku text,
  qty numeric(18,4) not null check (qty > 0),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  extras_total numeric(18,2) not null default 0 check (extras_total >= 0),   -- total ekstra untuk seluruh qty baris
  discount numeric(18,2) not null default 0 check (discount >= 0),
  tax_amount numeric(18,2) not null default 0 check (tax_amount >= 0),
  line_total numeric(18,2) not null,               -- qty*unit_price + extras_total - discount (tanpa pajak)
  note text,
  is_free boolean not null default false,
  kitchen_status text not null default 'new' check (kitchen_status in ('new','preparing','ready','served')),
  sent_to_kitchen_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (order_id, org_id) references orders(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references products(id, org_id),
  foreign key (product_unit_id, org_id) references product_units(id, org_id),
  unique (id, org_id)
);
create index on order_items (order_id);
create index on order_items (product_id);

create table order_item_extras (
  id uuid primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  order_item_id uuid not null,
  option_id uuid not null,
  name text not null,
  price numeric(18,2) not null check (price >= 0),
  qty numeric(18,4) not null check (qty > 0),      -- total jumlah opsi pada baris (qty baris x jumlah per unit)
  foreign key (order_item_id, org_id) references order_items(id, org_id) on delete cascade,
  foreign key (option_id, org_id) references extra_options(id, org_id)
);
create index on order_item_extras (order_item_id);

create table order_discounts (
  id uuid primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  order_id uuid not null,
  order_item_id uuid,
  source text not null check (source in ('promo','coupon','points','manual')),
  promotion_id uuid,
  coupon_id uuid,
  points_used int,
  amount numeric(18,2) not null check (amount > 0),
  authorized_by uuid,
  foreign key (order_id, org_id) references orders(id, org_id) on delete cascade
);
create index on order_discounts (order_id);

create table order_tax_lines (
  order_id uuid not null,
  tax_id uuid,
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  rate numeric(7,4) not null,
  base_amount numeric(18,2) not null,
  amount numeric(18,2) not null,
  foreign key (order_id, org_id) references orders(id, org_id) on delete cascade
);
create index on order_tax_lines (order_id);

create table payments (
  id uuid primary key,                             -- dibuat di perangkat; untuk gateway dibuat server
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid not null,
  order_id uuid not null,
  shift_id uuid,
  method_id uuid not null,
  amount numeric(18,2) not null check (amount > 0),   -- jumlah yang dikenakan ke order (tanpa kembalian)
  tendered numeric(18,2),                              -- uang yang diterima (tunai)
  change_given numeric(18,2) not null default 0 check (change_given >= 0),
  status text not null default 'succeeded' check (status in ('pending','succeeded','failed','cancelled')),
  paid_at timestamptz,
  reference text,
  failure_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (order_id, org_id) references orders(id, org_id) on delete cascade,
  foreign key (outlet_id, org_id) references outlets(id, org_id),
  foreign key (shift_id, org_id) references shifts(id, org_id),
  foreign key (method_id, org_id) references payment_methods(id, org_id),
  unique (id, org_id),
  check (status <> 'succeeded' or paid_at is not null)
);
create index on payments (order_id);
create index on payments (shift_id, method_id) where status = 'succeeded';
create index on payments (outlet_id, paid_at desc);

-- pisah bayar per produk: bagian item yang dibayar oleh satu pembayaran
create table payment_allocations (
  payment_id uuid not null,
  order_item_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  qty numeric(18,4) not null check (qty > 0),
  primary key (payment_id, order_item_id),
  foreign key (payment_id, org_id) references payments(id, org_id) on delete cascade,
  foreign key (order_item_id, org_id) references order_items(id, org_id) on delete cascade
);

-- Aturan CG POS: void hanya untuk order yang belum lunas. Order lunas dikoreksi lewat refund.
create table order_voids (
  order_id uuid primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  authorized_by uuid not null,
  auth_method text not null check (auth_method in ('pin','code','email_token')),
  approved_offline boolean not null default false,   -- disetujui saat offline, perlu ditinjau
  reason text not null,
  note text,
  voided_by uuid,
  voided_at timestamptz not null,
  foreign key (order_id, org_id) references orders(id, org_id) on delete cascade
);

create table refunds (
  id uuid primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid not null,
  order_id uuid not null,
  shift_id uuid,
  number text not null,
  method_id uuid not null,
  total numeric(18,2) not null check (total > 0),
  restock boolean not null default false,
  refund_delivery boolean not null default false,
  authorized_by uuid not null,
  auth_method text not null check (auth_method in ('pin','code','email_token')),
  approved_offline boolean not null default false,
  reason text not null,
  note text,
  status text not null default 'completed' check (status in ('completed','pending_gateway','failed')),
  gateway_transaction_id uuid,
  created_at timestamptz not null default now(),
  foreign key (order_id, org_id) references orders(id, org_id),
  foreign key (outlet_id, org_id) references outlets(id, org_id),
  foreign key (method_id, org_id) references payment_methods(id, org_id),
  unique (outlet_id, number),
  unique (id, org_id)
);
create index on refunds (order_id);
create table refund_items (
  refund_id uuid not null,
  order_item_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  qty numeric(18,4) not null check (qty > 0),
  amount numeric(18,2) not null check (amount >= 0),
  primary key (refund_id, order_item_id),
  foreign key (refund_id, org_id) references refunds(id, org_id) on delete cascade,
  foreign key (order_item_id, org_id) references order_items(id, org_id)
);

-- catatan tiap operasi dari perangkat. op_id unik menjadikan kirim ulang aman (idempoten).
create table sync_ops (
  op_id uuid primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  device_id uuid not null,
  op_type text not null,
  entity_id uuid,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received','applied','rejected')),
  error text,
  received_at timestamptz not null default now(),
  applied_at timestamptz
);
create index on sync_ops (device_id, received_at desc);
create index on sync_ops (status) where status <> 'applied';


commit;
