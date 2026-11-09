-- CG POS schema v1. Dihasilkan dari db/*.sql oleh build.sh. Jangan diedit langsung.
-- Butuh skema 'auth' Supabase (auth.users, auth.uid()). Untuk Postgres lokal, muat tests/00_auth_stub.sql dulu.

-- ===== db/00_base.sql =====
-- CG POS schema v1 (PostgreSQL 15+, dirancang untuk Supabase)
-- Bagian 00: ekstensi, fungsi dasar, penomoran dokumen
-- Aturan umum: uang numeric(18,2), kuantitas dan harga modal numeric(18,4), waktu timestamptz (UTC),
-- org_id selalu 'on delete cascade' ke orgs. FK antar tabel memakai NO ACTION dan dijadikan DEFERRABLE (lihat 15_security.sql) agar app.delete_org bisa menghapus seluruh data satu org.

create extension if not exists pgcrypto;
create schema if not exists app;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- nomor urut global untuk sinkronisasi tarik (pull). Satu aliran berurut untuk semua tabel katalog.
create sequence if not exists app.sync_seq;
create or replace function app.set_sync_seq() returns trigger
language plpgsql as $$
begin new.sync_seq := nextval('app.sync_seq'); return new; end $$;

-- ===== db/01_tenancy.sql =====
-- Bagian 01: organisasi, outlet, akses, perangkat

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  currency char(3) not null default 'IDR',
  timezone text not null default 'Asia/Jakarta',
  books_start_date date,              -- mulai pencatatan keuangan (Saldo Awal sudah diatur)
  books_locked_through date,          -- jurnal bertanggal <= ini ditolak
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- nomor dokumen berurut tanpa lompat (jurnal, faktur pembelian, dst). Satu baris per org+jenis+tahun.
create table doc_sequences (
  org_id uuid not null references orgs(id) on delete cascade,
  scope text not null,
  period int not null default 0,
  last_value bigint not null default 0,
  primary key (org_id, scope, period)
);

create or replace function app.next_doc_number(p_org uuid, p_scope text, p_period int default 0)
returns bigint language plpgsql as $$
declare v bigint;
begin
  insert into doc_sequences(org_id, scope, period, last_value) values (p_org, p_scope, p_period, 1)
  on conflict (org_id, scope, period) do update set last_value = doc_sequences.last_value + 1
  returning last_value into v;
  return v;
end $$;

create table outlets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{2,6}$'),   -- dipakai di nomor transaksi
  name text not null,
  address text,
  phone text,
  timezone text not null default 'Asia/Jakarta',
  is_active boolean not null default true,
  auto_reconcile_noncash boolean not null default false,  -- true: baris rekonsiliasi non-tunai langsung dianggap cocok saat tutup kasir
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code),
  unique (id, org_id)
);

-- pengaturan per outlet. Satu baris per outlet, dibuat otomatis.
create table outlet_settings (
  outlet_id uuid primary key references outlets(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  tax_calc text not null default 'after_discount' check (tax_calc in ('before_discount','after_discount','inclusive')),
  tax_mode text not null default 'per_order' check (tax_mode in ('per_order','per_product')),
  service_charge_pct numeric(5,2) not null default 0 check (service_charge_pct between 0 and 100),
  service_charge_taxable boolean not null default false,
  service_charge_order_types text[] not null default '{dine_in}',
  rounding_cash_step int not null default 0 check (rounding_cash_step >= 0),      -- 0 = tanpa pembulatan; contoh 100
  rounding_noncash_step int not null default 0 check (rounding_noncash_step >= 0),
  require_open_shift boolean not null default true,
  allow_negative_stock boolean not null default true,     -- keputusan Louis 9 Nov 2026
  qris_expiry_minutes int not null default 5 check (qris_expiry_minutes between 1 and 60),
  cash_out_daily_limit numeric(18,2),
  require_cash_photo boolean not null default false,
  receipt_footer text,
  sync_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- akun login (Supabase Auth) yang boleh membuka dashboard atau menjadi akun perangkat
create table org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','cashier','device')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on org_members (user_id);

-- batas outlet untuk anggota non-admin
create table member_outlets (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null,
  outlet_id uuid not null,
  primary key (user_id, outlet_id),
  foreign key (org_id, user_id) references org_members(org_id, user_id) on delete cascade,
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade
);

-- staf yang memakai PIN di POS. Boleh punya user_id bila juga membuka dashboard.
create table employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  role text not null default 'cashier' check (role in ('owner','manager','cashier','kitchen','warehouse')),
  permissions text[] not null default '{}',     -- izin tambahan di atas bawaan peran, contoh 'void.approve'
  pin_hash text,                                 -- bcrypt, tidak pernah dikirim ke dashboard
  pin_failed_count int not null default 0,
  pin_locked_until timestamptz,
  qr_code text,
  is_active boolean not null default true,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create unique index employees_qr on employees (org_id, qr_code) where qr_code is not null;

create table employee_outlets (
  employee_id uuid not null,
  outlet_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (employee_id, outlet_id),
  foreign key (employee_id, org_id) references employees(id, org_id) on delete cascade,
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade
);

-- satu tablet = satu perangkat. user_id = akun login perangkat (role 'device'), bukan akun pemilik.
create table devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  code text not null check (code ~ '^[A-Z0-9]{1,3}$'),    -- dipakai di nomor transaksi supaya nomor offline tidak bentrok
  name text not null,
  platform text,
  app_version text,
  orientation text not null default 'tablet' check (orientation in ('tablet','phone')),
  last_seen_at timestamptz,
  last_pull_seq bigint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade,
  unique (outlet_id, code),
  unique (id, org_id)
);
create index on devices (user_id);

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid,
  actor_user_id uuid,
  actor_employee_id uuid,
  action text not null,            -- contoh 'product.price_changed'
  entity text not null,
  entity_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on activity_logs (org_id, created_at desc);
create index on activity_logs (entity, entity_id);

-- lokasi stok: tiap outlet punya satu lokasi bawaan, plus gudang bebas
create table locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid,
  name text not null,
  kind text not null default 'outlet' check (kind in ('outlet','warehouse')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade,
  unique (id, org_id),
  check ((kind = 'outlet') = (outlet_id is not null))
);
create unique index locations_one_per_outlet on locations (outlet_id) where kind = 'outlet';

create or replace function app.on_outlet_insert() returns trigger
language plpgsql as $$
begin
  insert into outlet_settings(outlet_id, org_id) values (new.id, new.org_id);
  insert into locations(org_id, outlet_id, name, kind) values (new.org_id, new.id, new.name, 'outlet');
  return new;
end $$;
create trigger outlets_after_insert after insert on outlets
  for each row execute function app.on_outlet_insert();

create or replace function app.outlet_location(p_outlet uuid) returns uuid
language sql stable as $$ select id from locations where outlet_id = p_outlet and kind = 'outlet' $$;

-- ===== db/02_accounts.sql =====
-- Bagian 02: daftar akun dan jurnal (buku besar). Semua laporan keuangan diturunkan dari sini.
-- Daftar akun bawaan dibuat sendiri (lihat app.seed_org_defaults), bukan salinan daftar akun Majoo.

create table accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  code text not null check (code ~ '^[1-8]-[0-9]{4}$'),
  name text not null,
  kind text not null default 'detail' check (kind in ('header','detail')),   -- header tidak boleh menerima jurnal
  category text not null check (category in (
    'cash_bank','receivable','inventory','other_current_asset','fixed_asset','accumulated_depreciation',
    'payable','short_term_liability','long_term_liability','equity',
    'revenue','cogs','expense','other_income','other_expense')),
  parent_id uuid references accounts(id) on delete set null,
  system_key text,                       -- akun sistem terkunci, dipakai oleh fungsi posting
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code),
  unique (id, org_id),
  -- digit pertama kode harus cocok dengan kelas akun
  check (left(code, 1)::int = case
    when category in ('cash_bank','receivable','inventory','other_current_asset','fixed_asset','accumulated_depreciation') then 1
    when category in ('payable','short_term_liability','long_term_liability') then 2
    when category = 'equity' then 3
    when category = 'revenue' then 4
    when category = 'cogs' then 5
    when category = 'expense' then 6
    when category = 'other_income' then 7
    else 8 end)
);
create unique index accounts_system_key on accounts (org_id, system_key) where system_key is not null;

create or replace function app.is_debit_normal(p_category text) returns boolean
language sql immutable as $$
  select p_category in ('cash_bank','receivable','inventory','other_current_asset','fixed_asset','cogs','expense','other_expense')
$$;

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  outlet_id uuid,
  number text not null,                        -- awalan jenis + urutan, contoh SAL-000123
  entry_date date not null,
  description text not null,
  source_type text not null default 'manual',  -- sale, shift_open, shift_close, cash, purchase, settlement, manual, ...
  source_id uuid,
  source_key text,                             -- kunci idempotensi, contoh order:<uuid>:sale
  status text not null default 'draft' check (status in ('draft','posted','voided')),
  reverses_entry_id uuid references journal_entries(id),
  created_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references outlets(id, org_id),
  unique (org_id, number),
  unique (id, org_id)
);
create unique index journal_source_key on journal_entries (org_id, source_key) where source_key is not null;
create index on journal_entries (org_id, entry_date);
create index on journal_entries (org_id, outlet_id, entry_date);
create index on journal_entries (source_type, source_id);

create table journal_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  entry_id uuid not null,
  account_id uuid not null,
  debit numeric(18,2) not null default 0 check (debit >= 0),
  credit numeric(18,2) not null default 0 check (credit >= 0),
  memo text,
  line_no int not null default 0,
  foreign key (entry_id, org_id) references journal_entries(id, org_id) on delete cascade,
  foreign key (account_id, org_id) references accounts(id, org_id),
  check ((debit > 0) <> (credit > 0))          -- tepat satu sisi terisi
);
create index on journal_lines (entry_id);
create index on journal_lines (account_id, entry_id);
create index on journal_lines (org_id, account_id);

-- jurnal terposting tidak boleh diubah. Koreksi = jurnal pembalik, lalu jurnal asli berstatus voided.
create or replace function app.journal_entries_guard() returns trigger
language plpgsql as $$
declare v_debit numeric; v_credit numeric; v_lines int; v_lock date;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'journal must be created as draft, then posted'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    -- hapus-org berantai (permintaan hapus data): baris induk org sudah hilang, jadi boleh
    if not exists (select 1 from orgs where id = old.org_id) then return old; end if;
    if old.status <> 'draft' then raise exception 'posted journal cannot be deleted; reverse it instead'; end if;
    return old;
  end if;
  -- UPDATE
  if old.status = 'posted' and new.status = 'posted' then
    raise exception 'posted journal is immutable';
  end if;
  if old.status = 'voided' then raise exception 'voided journal is immutable'; end if;
  if old.status = 'draft' and new.status = 'posted' then
    select coalesce(sum(debit),0), coalesce(sum(credit),0), count(*) into v_debit, v_credit, v_lines
      from journal_lines where entry_id = new.id;
    if v_lines < 2 then raise exception 'journal % needs at least 2 lines', new.number; end if;
    if v_debit <> v_credit then
      raise exception 'journal % not balanced: debit % credit %', new.number, v_debit, v_credit;
    end if;
    select books_locked_through into v_lock from orgs where id = new.org_id;
    if v_lock is not null and new.entry_date <= v_lock then
      raise exception 'books are locked through %', v_lock;
    end if;
    new.posted_at := now();
  elsif old.status = 'posted' and new.status = 'voided' then
    if new.reverses_entry_id is not null then raise exception 'a reversal entry cannot itself be voided'; end if;
    if not exists (select 1 from journal_entries r where r.reverses_entry_id = new.id and r.status = 'posted') then
      raise exception 'post the reversing entry before voiding journal %', new.number;
    end if;
  end if;
  return new;
end $$;
create trigger journal_entries_guard before insert or update or delete on journal_entries
  for each row execute function app.journal_entries_guard();

create or replace function app.journal_lines_guard() returns trigger
language plpgsql as $$
declare v_status text; v_kind text; v_active boolean; v_entry uuid;
begin
  v_entry := case when tg_op = 'DELETE' then old.entry_id else new.entry_id end;
  if tg_op = 'DELETE' and not exists (select 1 from orgs where id = old.org_id) then return old; end if;
  select status into v_status from journal_entries where id = v_entry;
  -- baris hilang bersamaan dengan induknya (cascade) boleh; selain itu hanya saat draft
  if v_status is not null and v_status <> 'draft' then
    raise exception 'lines of a posted journal are immutable';
  end if;
  if tg_op <> 'DELETE' then
    select kind, is_active into v_kind, v_active from accounts where id = new.account_id;
    if v_kind <> 'detail' then raise exception 'header account cannot receive journal lines'; end if;
    if not v_active then raise exception 'inactive account cannot receive journal lines'; end if;
    return new;
  end if;
  return old;
end $$;
create trigger journal_lines_guard before insert or update or delete on journal_lines
  for each row execute function app.journal_lines_guard();

create or replace function app.account_id(p_org uuid, p_key text) returns uuid
language plpgsql stable as $$
declare v uuid;
begin
  select id into v from accounts where org_id = p_org and system_key = p_key;
  if v is null then raise exception 'system account % missing for org %', p_key, p_org; end if;
  return v;
end $$;

-- helper posting: p_lines = [{"account_id": "...", "debit": 10, "credit": 0, "memo": "..."}]
-- Idempoten lewat p_source_key: bila sudah ada, mengembalikan id jurnal lama.
create or replace function app.post_journal(
  p_org uuid, p_outlet uuid, p_date date, p_prefix text, p_desc text,
  p_source_type text, p_source_id uuid, p_source_key text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_id uuid; v_num bigint; l jsonb; i int := 0;
begin
  if p_source_key is not null then
    select id into v_id from journal_entries where org_id = p_org and source_key = p_source_key;
    if v_id is not null then return v_id; end if;
  end if;
  v_num := app.next_doc_number(p_org, 'JRN:' || p_prefix, 0);
  insert into journal_entries(org_id, outlet_id, number, entry_date, description, source_type, source_id, source_key)
  values (p_org, p_outlet, p_prefix || '-' || lpad(v_num::text, 6, '0'), p_date, p_desc, p_source_type, p_source_id, p_source_key)
  returning id into v_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    insert into journal_lines(org_id, entry_id, account_id, debit, credit, memo, line_no)
    values (p_org, v_id, (l->>'account_id')::uuid,
            coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0), l->>'memo', i);
  end loop;
  update journal_entries set status = 'posted' where id = v_id;
  return v_id;
end $$;

-- ===== db/03_catalog.sql =====
-- Bagian 03: katalog produk. Satu tabel products untuk barang jual, bahan baku, jasa, dan paket.

create table units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id)
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,
  name text not null,
  sort int not null default 0,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id)
);
create index on categories (department_id);

create table products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  parent_id uuid references products(id) on delete set null,     -- induk grup varian
  kind text not null default 'goods' check (kind in ('goods','ingredient','service','bundle')),
  name text not null,
  description text,
  category_id uuid references categories(id) on delete set null,
  base_unit_id uuid,
  photo_path text,
  is_sellable boolean not null default true,
  show_in_menu boolean not null default true,
  is_favorite boolean not null default false,
  track_stock boolean not null default true,
  stock_alert_min numeric(18,4),                                   -- batas stok minimum untuk notifikasi
  allow_price_override boolean not null default false,
  max_price_override_pct numeric(5,2) not null default 0 check (max_price_override_pct between 0 and 100),
  allow_cashier_unavailable boolean not null default false,
  default_buy_price numeric(18,4) not null default 0,
  is_active boolean not null default true,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (base_unit_id, org_id) references units(id, org_id),
  check (kind <> 'ingredient' or is_sellable = false)
);
create index on products (org_id, category_id);
create index on products (org_id, kind) where deleted_at is null;
create index on products (parent_id);
create index on products (org_id, sync_seq);

-- satuan jual. Satuan dasar punya konversi 1; satuan lain mengonversi ke satuan dasar.
create table product_units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  product_id uuid not null,
  unit_id uuid not null,
  sku text,
  barcode text,
  conversion numeric(18,6) not null default 1 check (conversion > 0),
  is_base boolean not null default false,
  price numeric(18,2) not null default 0 check (price >= 0),
  buy_price numeric(18,4) not null default 0 check (buy_price >= 0),
  min_purchase numeric(18,4) not null default 1 check (min_purchase > 0),
  weight_g int, length_cm numeric(8,2), width_cm numeric(8,2), height_cm numeric(8,2),
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id, org_id) references products(id, org_id) on delete cascade,
  foreign key (unit_id, org_id) references units(id, org_id),
  unique (id, org_id),
  unique (product_id, unit_id),
  check (not is_base or conversion = 1)
);
create unique index product_units_one_base on product_units (product_id) where is_base and deleted_at is null;
create unique index product_units_sku on product_units (org_id, sku) where sku is not null and deleted_at is null;
create index on product_units (org_id, barcode) where barcode is not null;

-- atur per outlet: tersedia atau tidak, tampil di menu, harga khusus outlet
create table product_outlets (
  product_id uuid not null,
  outlet_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  is_available boolean not null default true,
  show_in_menu boolean,
  sync_seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (product_id, outlet_id),
  foreign key (product_id, org_id) references products(id, org_id) on delete cascade,
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade
);
create index on product_outlets (outlet_id);

create table product_unit_outlet_prices (
  product_unit_id uuid not null,
  outlet_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  price numeric(18,2) not null check (price >= 0),
  sync_seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (product_unit_id, outlet_id),
  foreign key (product_unit_id, org_id) references product_units(id, org_id) on delete cascade,
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade
);

-- jadwal harga: harga berlaku pada rentang tanggal, hari, dan jam
create table price_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  product_unit_id uuid not null,
  outlet_id uuid,
  price numeric(18,2) not null check (price >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  days_of_week smallint[] check (days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]),
  time_from time,
  time_to time,
  is_active boolean not null default true,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_unit_id, org_id) references product_units(id, org_id) on delete cascade,
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade,
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index on price_schedules (product_unit_id) where is_active;

-- resep (BOM): bahan baku yang dipakai per satu satuan dasar produk jual
create table recipe_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  product_id uuid not null,
  ingredient_id uuid not null,
  qty numeric(18,4) not null check (qty > 0),
  unit_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id, org_id) references products(id, org_id) on delete cascade,
  foreign key (ingredient_id, org_id) references products(id, org_id),
  foreign key (unit_id, org_id) references units(id, org_id),
  unique (product_id, ingredient_id),
  check (product_id <> ingredient_id)
);
create index on recipe_lines (ingredient_id);

create table bundle_items (
  bundle_id uuid not null,
  product_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  qty numeric(18,4) not null default 1 check (qty > 0),
  primary key (bundle_id, product_id),
  foreign key (bundle_id, org_id) references products(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references products(id, org_id),
  check (bundle_id <> product_id)
);

-- Produk Ekstra (modifier)
create table extra_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  is_required boolean not null default false,
  select_mode text not null default 'single' check (select_mode in ('single','multiple')),
  max_select int check (max_select is null or max_select > 0),
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create table extra_options (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  group_id uuid not null,
  name text not null,
  price numeric(18,2) not null default 0 check (price >= 0),
  sort int not null default 0,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_id, org_id) references extra_groups(id, org_id) on delete cascade,
  unique (id, org_id)
);
create index on extra_options (group_id);
create table extra_option_ingredients (
  option_id uuid not null,
  ingredient_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  qty numeric(18,4) not null check (qty > 0),
  unit_id uuid not null,
  primary key (option_id, ingredient_id),
  foreign key (option_id, org_id) references extra_options(id, org_id) on delete cascade,
  foreign key (ingredient_id, org_id) references products(id, org_id),
  foreign key (unit_id, org_id) references units(id, org_id)
);
create table product_extra_groups (
  product_id uuid not null,
  group_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  sort int not null default 0,
  sync_seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (product_id, group_id),
  foreign key (product_id, org_id) references products(id, org_id) on delete cascade,
  foreign key (group_id, org_id) references extra_groups(id, org_id) on delete cascade
);

-- pajak. mode per_order memakai pajak bawaan outlet; per_product memakai product_taxes.
create table taxes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  rate numeric(7,4) not null check (rate between 0 and 100),
  order_types text[] not null default '{dine_in,takeaway,delivery,service}',
  is_default boolean not null default false,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create table tax_outlets (
  tax_id uuid not null,
  outlet_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  sync_seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tax_id, outlet_id),
  foreign key (tax_id, org_id) references taxes(id, org_id) on delete cascade,
  foreign key (outlet_id, org_id) references outlets(id, org_id) on delete cascade
);
create table product_taxes (
  product_id uuid not null,
  tax_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  sync_seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (product_id, tax_id),
  foreign key (product_id, org_id) references products(id, org_id) on delete cascade,
  foreign key (tax_id, org_id) references taxes(id, org_id) on delete cascade
);

-- ===== db/04_customers_floor.sql =====
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

-- ===== db/05_sales.sql =====
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

-- ===== db/06_gateway.sql =====
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

-- ===== db/07_inventory.sql =====
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
create or replace function app.stock_movement_apply() returns trigger
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
  for each row execute function app.stock_movement_apply();

create or replace function app.stock_movements_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from orgs where id = old.org_id) then return old; end if;   -- hapus-org berantai
  raise exception 'stock movements are append-only; post a correcting movement';
end $$;
create trigger stock_movements_no_change before update or delete on stock_movements
  for each row execute function app.stock_movements_immutable();

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

-- ===== db/08_purchasing.sql =====
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

-- ===== db/09_finance_extra.sql =====
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

-- ===== db/10_helpers.sql =====
-- Bagian 10: fungsi bantu, pemicu pembayaran, pembuatan org beserta data bawaan

-- faktor konversi satuan penjualan ke satuan dasar
create or replace function app.unit_factor(p_product_unit uuid) returns numeric
language sql stable as $$ select conversion from product_units where id = p_product_unit $$;

-- faktor konversi satuan resep/bahan ke satuan dasar bahan
create or replace function app.ingredient_factor(p_product uuid, p_unit uuid) returns numeric
language plpgsql stable as $$
declare v numeric; v_base uuid;
begin
  select conversion into v from product_units where product_id = p_product and unit_id = p_unit and deleted_at is null;
  if v is not null then return v; end if;
  select base_unit_id into v_base from products where id = p_product;
  if v_base = p_unit then return 1; end if;
  raise exception 'unit % has no conversion for product %', p_unit, p_product;
end $$;

-- Daftar bahan/barang yang berkurang saat satu produk terjual (satuan dasar masing-masing).
-- Aturan: paket -> komponen; punya resep -> bahan resep; barang lacak stok -> dirinya sendiri; selain itu tidak ada.
create or replace function app.sale_components(p_product uuid, p_qty numeric, p_depth int default 0)
returns table(component_id uuid, component_qty numeric)
language plpgsql stable as $$
declare p products%rowtype; b record;
begin
  if p_depth > 3 then raise exception 'bundle nesting too deep'; end if;
  select * into p from products where id = p_product;
  if not found then return; end if;
  if p.kind = 'bundle' then
    for b in select bi.product_id as pid, bi.qty as q from bundle_items bi where bi.bundle_id = p.id loop
      return query select * from app.sale_components(b.pid, p_qty * b.q, p_depth + 1);
    end loop;
  elsif exists (select 1 from recipe_lines rl where rl.product_id = p.id) then
    return query
      select rl.ingredient_id, p_qty * rl.qty * app.ingredient_factor(rl.ingredient_id, rl.unit_id)
        from recipe_lines rl join products ing on ing.id = rl.ingredient_id and ing.track_stock
       where rl.product_id = p.id;
  elsif p.kind = 'goods' and p.track_stock then
    return query select p.id, p_qty;
  end if;
end $$;

-- Setiap perubahan pembayaran menghitung ulang total bayar dan status order.
create or replace function app.recalc_order_payments() returns trigger
language plpgsql as $$
declare v_order uuid; v_paid numeric; v_total numeric; v_status text;
begin
  v_order := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  select total, status into v_total, v_status from orders where id = v_order for update;
  if not found then return null; end if;           -- order sedang dihapus (hapus-org berantai)
  select coalesce(sum(amount), 0) into v_paid from payments where order_id = v_order and status = 'succeeded';
  if v_status = 'void' then
    if v_paid > 0 then raise exception 'void order cannot hold payments'; end if;
    return null;
  end if;
  if v_paid > v_total then raise exception 'payments % exceed order total %', v_paid, v_total; end if;
  update orders set
    paid_total = v_paid,
    status = case when v_paid = 0 then 'open' when v_paid >= v_total then 'paid' else 'partially_paid' end,
    closed_at = case when v_paid > 0 and v_paid >= v_total then coalesce(closed_at, now()) else null end,
    version = version + 1
  where id = v_order;
  return null;
end $$;
create trigger payments_recalc after insert or update or delete on payments
  for each row execute function app.recalc_order_payments();

-- akun kas utama org = akun dari metode bayar tunai pertama yang aktif
create or replace function app.cash_account(p_org uuid) returns uuid
language sql stable as $$
  select account_id from payment_methods where org_id = p_org and kind = 'cash' and is_active and deleted_at is null
  order by sort, created_at limit 1 $$;

-- tanggal pembukuan dari waktu kejadian, memakai zona waktu outlet
create or replace function app.book_date(p_outlet uuid, p_at timestamptz) returns date
language sql stable as $$
  select (p_at at time zone coalesce((select timezone from outlets where id = p_outlet), 'Asia/Jakarta'))::date $$;

-- bila periode sudah dikunci, transaksi terlambat dibukukan pada hari pertama yang masih terbuka
create or replace function app.open_book_date(p_org uuid, p_date date) returns date
language sql stable as $$
  select case when o.books_locked_through is not null and p_date <= o.books_locked_through
              then o.books_locked_through + 1 else p_date end
    from orgs o where o.id = p_org $$;

---------------------------------------------------------------------------------------------------
-- Data bawaan org baru: daftar akun sendiri (bukan salinan), metode bayar, satuan, pajak
---------------------------------------------------------------------------------------------------
create or replace function app.seed_org_defaults(p_org uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare a record; v_cash uuid; v_clr uuid; v_nclr uuid; v_comp uuid; v_dep uuid;
begin
  for a in select * from (values
    ('1-1000','Aset Lancar','header','other_current_asset',null),
    ('1-1100','Kas','detail','cash_bank','cash_main'),
    ('1-1200','Bank','detail','cash_bank','bank_main'),
    ('1-1300','Piutang Gateway (DOKU)','detail','receivable','gateway_clearing'),
    ('1-1310','Piutang Non-tunai (EDC/Transfer)','detail','receivable','noncash_clearing'),
    ('1-1400','Piutang Usaha','detail','receivable','accounts_receivable'),
    ('1-1500','Persediaan','detail','inventory','inventory'),
    ('1-1600','Uang Muka Pemasok','detail','other_current_asset','supplier_advance'),
    ('1-1700','Pajak Masukan','detail','other_current_asset','purchase_tax_input'),
    ('1-2000','Aset Tetap','header','fixed_asset',null),
    ('1-2100','Peralatan','detail','fixed_asset','fixed_asset_equipment'),
    ('1-2900','Akumulasi Penyusutan','detail','accumulated_depreciation','accumulated_depreciation'),
    ('2-1000','Kewajiban Jangka Pendek','header','short_term_liability',null),
    ('2-1100','Utang Usaha','detail','payable','accounts_payable'),
    ('2-1200','Pajak Penjualan Terutang','detail','short_term_liability','tax_payable'),
    ('2-1300','Deposit Pelanggan','detail','short_term_liability','customer_deposit'),
    ('3-1000','Modal Disetor','detail','equity','paid_in_capital'),
    ('3-2000','Saldo Awal Ekuitas','detail','equity','opening_balance_equity'),
    ('4-1000','Penjualan','detail','revenue','sales_revenue'),
    ('4-1100','Biaya Layanan','detail','revenue','service_revenue'),
    ('4-1900','Diskon Penjualan','detail','revenue','sales_discount'),
    ('4-1950','Retur Penjualan','detail','revenue','sales_returns'),
    ('5-1000','Harga Pokok Penjualan','detail','cogs','cogs'),
    ('5-2000','Selisih Persediaan','detail','cogs','inventory_adjustment'),
    ('6-1000','Beban Gaji','detail','expense',null),
    ('6-1100','Beban Sewa','detail','expense',null),
    ('6-1900','Beban Kas Keluar Lainnya','detail','expense','cash_out_expense'),
    ('6-2000','Beban Penyusutan','detail','expense','depreciation_expense'),
    ('6-2100','Biaya Gateway','detail','expense','gateway_fee_expense'),
    ('6-2200','Beban Gratis/Complimentary','detail','expense','complimentary_expense'),
    ('6-2300','Selisih Kas','detail','expense','cash_over_short'),
    ('6-2400','Selisih Rekonsiliasi','detail','expense','reconciliation_diff'),
    ('7-1000','Pendapatan Lain-lain','detail','other_income',null),
    ('7-1100','Pembulatan','detail','other_income','rounding'),
    ('7-1200','Kas Masuk Lainnya','detail','other_income','cash_in_other'),
    ('8-1000','Beban Lain-lain','detail','other_expense',null)
  ) as t(code, name, kind, category, system_key)
  loop
    insert into accounts(org_id, code, name, kind, category, system_key)
    values (p_org, a.code, a.name, a.kind, a.category, a.system_key);
  end loop;

  v_cash := app.account_id(p_org, 'cash_main');
  v_clr  := app.account_id(p_org, 'gateway_clearing');
  v_nclr := app.account_id(p_org, 'noncash_clearing');
  v_comp := app.account_id(p_org, 'complimentary_expense');
  v_dep  := app.account_id(p_org, 'customer_deposit');
  insert into payment_methods(org_id, code, name, kind, account_id, requires_online, sort) values
    (p_org, 'CASH',  'Tunai',            'cash',          v_cash, false, 1),
    (p_org, 'QRIS',  'QRIS (DOKU)',      'gateway',       v_clr,  true,  2),
    (p_org, 'EDC',   'Kartu (EDC)',      'noncash',       v_nclr, false, 3),
    (p_org, 'TRF',   'Transfer Bank',    'noncash',       v_nclr, false, 4),
    (p_org, 'FREE',  'Gratis',           'complimentary', v_comp, false, 5),
    (p_org, 'DEP',   'Deposit Pelanggan','deposit',       v_dep,  false, 6);

  insert into units(org_id, name) values (p_org,'pcs'),(p_org,'porsi'),(p_org,'gram'),(p_org,'ml'),(p_org,'kg'),(p_org,'liter');
  insert into taxes(org_id, name, rate, is_default) values (p_org, 'PB1 Restoran', 10, false);
end $$;

-- Buat org baru lengkap: org, pemilik, outlet pertama, data bawaan. Dipanggil dari rute pendaftaran (service role).
create or replace function app.create_org(p_name text, p_owner uuid, p_outlet_name text, p_outlet_code text)
returns uuid language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_org uuid; v_outlet uuid;
begin
  insert into orgs(name) values (p_name) returning id into v_org;
  insert into org_members(org_id, user_id, role) values (v_org, p_owner, 'owner');
  perform app.seed_org_defaults(v_org);
  insert into outlets(org_id, code, name) values (v_org, upper(p_outlet_code), p_outlet_name) returning id into v_outlet;
  insert into employees(org_id, user_id, name, role) values (v_org, p_owner, 'Pemilik', 'owner');
  insert into employee_outlets(employee_id, outlet_id, org_id)
    select id, v_outlet, v_org from employees where org_id = v_org and role = 'owner';
  return v_org;
end $$;

---------------------------------------------------------------------------------------------------
-- PIN karyawan (bcrypt lewat pgcrypto). Gagal beruntun mengunci akun sementara.
---------------------------------------------------------------------------------------------------
create or replace function app.set_employee_pin(p_employee uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN must be exactly 6 digits'; end if;
  update employees set pin_hash = crypt(p_pin, gen_salt('bf', 10)), pin_failed_count = 0, pin_locked_until = null
   where id = p_employee;
  if not found then raise exception 'employee not found'; end if;
end $$;

-- mengembalikan true/false; tidak melempar galat saat salah, supaya penghitung gagal tetap tersimpan
create or replace function app.verify_employee_pin(p_employee uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare e employees%rowtype; ok boolean;
begin
  select * into e from employees where id = p_employee and is_active and deleted_at is null for update;
  if not found or e.pin_hash is null then return false; end if;
  if e.pin_locked_until is not null and e.pin_locked_until > now() then return false; end if;
  ok := (e.pin_hash = crypt(p_pin, e.pin_hash));
  if ok then
    update employees set pin_failed_count = 0, pin_locked_until = null where id = e.id;
  else
    update employees set pin_failed_count = pin_failed_count + 1,
      pin_locked_until = case when pin_failed_count + 1 >= 5 then now() + interval '5 minutes' else null end
     where id = e.id;
  end if;
  return ok;
end $$;

-- Hapus seluruh data satu org (permintaan hapus data / penghentian akun). Pemeriksaan FK ditunda ke akhir
-- transaksi karena urutan penghapusan berantai antar tabel tidak ditentukan.
create or replace function app.delete_org(p_org uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  set constraints all deferred;
  delete from orgs where id = p_org;
  delete from sync_tombstones where org_id = p_org;
  delete from gateway_events where org_id = p_org;
end $$;

-- ===== db/11_posting.sql =====
-- Bagian 11: pembukuan otomatis. Semua fungsi idempoten (kunci sumber) dan hanya dipanggil dari fungsi lain / server.

-- Selesaikan order yang sudah lunas: stok keluar, HPP, dan satu jurnal penjualan.
create or replace function app.finalize_order(p_order uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  o orders%rowtype; v_loc uuid; v_date date; r record; v_cogs numeric := 0;
  v_lines jsonb := '[]'::jsonb; v_closed timestamptz;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.finalized_at is not null then return; end if;
  if o.status <> 'paid' then raise exception 'order % is not paid', o.number; end if;
  v_loc := app.outlet_location(o.outlet_id);
  v_closed := coalesce(o.closed_at, now());
  v_date := app.open_book_date(o.org_id, app.book_date(o.outlet_id, v_closed));

  -- stok keluar: satu gerakan per bahan per order
  for r in
    select c.pid, sum(c.q) as q from (
      select comp.component_id as pid, comp.component_qty as q
        from order_items oi
        join product_units pu on pu.id = oi.product_unit_id
        cross join lateral app.sale_components(oi.product_id, oi.qty * pu.conversion) comp
       where oi.order_id = p_order and oi.voided_at is null
      union all
      select eoi.ingredient_id, e.qty * eoi.qty * app.ingredient_factor(eoi.ingredient_id, eoi.unit_id)
        from order_item_extras e
        join order_items oi on oi.id = e.order_item_id and oi.org_id = e.org_id
        join extra_option_ingredients eoi on eoi.option_id = e.option_id
        join products ip on ip.id = eoi.ingredient_id and ip.track_stock
       where oi.order_id = p_order and oi.voided_at is null
    ) c group by c.pid having sum(c.q) > 0
  loop
    insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, ref_type, ref_id, source_key, occurred_at)
    values (o.org_id, v_loc, r.pid, 'sale', -r.q, 'order', o.id, 'order:' || o.id || ':' || r.pid, v_closed);
  end loop;

  select coalesce(-sum(total_cost), 0) into v_cogs
    from stock_movements where ref_type = 'order' and ref_id = o.id and kind = 'sale';

  -- debit: tiap akun metode bayar
  for r in
    select pm.account_id, sum(p.amount) as amt
      from payments p join payment_methods pm on pm.id = p.method_id and pm.org_id = p.org_id
     where p.order_id = o.id and p.status = 'succeeded' group by pm.account_id
  loop
    v_lines := v_lines || jsonb_build_object('account_id', r.account_id, 'debit', r.amt, 'memo', 'Pembayaran ' || o.number);
  end loop;
  if o.discount_total > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', app.account_id(o.org_id,'sales_discount'), 'debit', o.discount_total);
  end if;
  if o.rounding < 0 then
    v_lines := v_lines || jsonb_build_object('account_id', app.account_id(o.org_id,'rounding'), 'debit', -o.rounding);
  end if;
  -- kredit
  if o.subtotal > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', app.account_id(o.org_id,'sales_revenue'), 'credit', o.subtotal, 'memo', o.number);
  end if;
  if o.service_charge > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', app.account_id(o.org_id,'service_revenue'), 'credit', o.service_charge);
  end if;
  if o.tax_total > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', app.account_id(o.org_id,'tax_payable'), 'credit', o.tax_total);
  end if;
  if o.rounding > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', app.account_id(o.org_id,'rounding'), 'credit', o.rounding);
  end if;
  -- HPP
  if v_cogs > 0 then
    v_lines := v_lines
      || jsonb_build_object('account_id', app.account_id(o.org_id,'cogs'), 'debit', v_cogs, 'memo', 'HPP ' || o.number)
      || jsonb_build_object('account_id', app.account_id(o.org_id,'inventory'), 'credit', v_cogs, 'memo', 'HPP ' || o.number);
  end if;

  if jsonb_array_length(v_lines) >= 2 then
    perform app.post_journal(o.org_id, o.outlet_id, v_date, 'SAL', 'Penjualan ' || o.number,
                             'sale', o.id, 'order:' || o.id || ':sale', v_lines);
  end if;
  update orders set finalized_at = now() where id = o.id;
end $$;

-- Pekerjaan berkala: order lunas yang belum terbukukan (misal periode terkunci sempat menolak)
create or replace function app.finalize_pending_orders(p_limit int default 200) returns int
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare r record; n int := 0;
begin
  for r in select id from orders where status = 'paid' and finalized_at is null order by closed_at limit p_limit loop
    begin
      perform app.finalize_order(r.id); n := n + 1;
    exception when others then
      insert into activity_logs(org_id, action, entity, entity_id, detail)
      select org_id, 'order.finalize_failed', 'order', id, jsonb_build_object('error', sqlerrm) from orders where id = r.id;
    end;
  end loop;
  return n;
end $$;

-- Kas masuk/keluar di laci kasir
create or replace function app.post_cash_movement(p_id uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare m cash_movements%rowtype; s shifts%rowtype; st outlet_settings%rowtype;
        v_cash uuid; v_other uuid; v_day_out numeric; v_date date;
begin
  select * into m from cash_movements where id = p_id;
  select * into s from shifts where id = m.shift_id and org_id = m.org_id;
  select * into st from outlet_settings where outlet_id = s.outlet_id;
  v_cash := app.cash_account(m.org_id);
  if v_cash is null then raise exception 'no active cash payment method'; end if;
  if st.require_cash_photo and m.photo_path is null then raise exception 'cash movement needs a photo'; end if;
  v_date := app.open_book_date(m.org_id, app.book_date(s.outlet_id, m.occurred_at));
  if m.kind = 'out' and st.cash_out_daily_limit is not null then
    select coalesce(sum(cm.amount), 0) into v_day_out
      from cash_movements cm join shifts sh on sh.id = cm.shift_id and sh.org_id = cm.org_id
     where sh.outlet_id = s.outlet_id and cm.kind = 'out'
       and app.book_date(s.outlet_id, cm.occurred_at) = app.book_date(s.outlet_id, m.occurred_at);
    if v_day_out > st.cash_out_daily_limit then
      raise exception 'daily cash-out limit % exceeded (% so far)', st.cash_out_daily_limit, v_day_out;
    end if;
  end if;
  if m.kind = 'in' then
    v_other := coalesce(m.account_id, app.account_id(m.org_id, 'cash_in_other'));
    perform app.post_journal(m.org_id, s.outlet_id, v_date, 'CSH', 'Kas masuk: ' || m.reason, 'cash_movement', m.id, 'cashmove:' || m.id,
      jsonb_build_array(jsonb_build_object('account_id', v_cash, 'debit', m.amount),
                        jsonb_build_object('account_id', v_other, 'credit', m.amount)));
  else
    v_other := coalesce(m.account_id, app.account_id(m.org_id, 'cash_out_expense'));
    perform app.post_journal(m.org_id, s.outlet_id, v_date, 'CSH', 'Kas keluar: ' || m.reason, 'cash_movement', m.id, 'cashmove:' || m.id,
      jsonb_build_array(jsonb_build_object('account_id', v_other, 'debit', m.amount),
                        jsonb_build_object('account_id', v_cash, 'credit', m.amount)));
  end if;
end $$;

-- Rekonsiliasi satu baris: uang masuk sebenarnya vs yang dicatat. Selisih masuk akun selisih rekonsiliasi.
create or replace function app.reconcile(p_recon uuid, p_actual numeric, p_fee numeric, p_bank uuid, p_by uuid, p_settlement uuid default null)
returns uuid language plpgsql security definer set search_path = public, app, pg_temp as $$
declare r reconciliations%rowtype; v_clear uuid; v_diff numeric; v_lines jsonb; v_je uuid; v_date date;
begin
  select * into r from reconciliations where id = p_recon for update;
  if not found then raise exception 'reconciliation not found'; end if;
  if r.status = 'reconciled' then return r.journal_entry_id; end if;
  select account_id into v_clear from payment_methods where id = r.method_id;
  v_diff := r.expected_amount - p_actual - coalesce(p_fee, 0);       -- >0 : uang kurang (rugi)
  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', p_bank, 'debit', p_actual),
    jsonb_build_object('account_id', v_clear, 'credit', r.expected_amount));
  if coalesce(p_fee, 0) > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', app.account_id(r.org_id,'gateway_fee_expense'), 'debit', p_fee);
  end if;
  if v_diff > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', app.account_id(r.org_id,'reconciliation_diff'), 'debit', v_diff);
  elsif v_diff < 0 then
    v_lines := v_lines || jsonb_build_object('account_id', app.account_id(r.org_id,'reconciliation_diff'), 'credit', -v_diff);
  end if;
  -- baris dengan debit 0 dibuang
  v_lines := (select coalesce(jsonb_agg(e), '[]') from jsonb_array_elements(v_lines) e
               where coalesce((e->>'debit')::numeric,0) + coalesce((e->>'credit')::numeric,0) > 0);
  v_date := app.open_book_date(r.org_id, app.book_date(r.outlet_id, now()));
  v_je := app.post_journal(r.org_id, r.outlet_id, v_date, 'REC', 'Rekonsiliasi ' || r.number,
                           'reconciliation', r.id, 'recon:' || r.id, v_lines);
  update reconciliations set actual_amount = p_actual, fee_amount = coalesce(p_fee,0), difference = v_diff,
         status = 'reconciled', bank_account_id = p_bank, settlement_id = p_settlement,
         journal_entry_id = v_je, reconciled_at = now(), reconciled_by = p_by
   where id = r.id;
  return v_je;
end $$;

-- Tutup kasir: hitung kas seharusnya, catat selisih, buat baris rekonsiliasi non-tunai.
create or replace function app.close_shift(p_shift uuid, p_closed_by uuid, p_counted numeric, p_closed_at timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = public, app, pg_temp as $$
declare s shifts%rowtype; v_cash_pay numeric; v_in numeric; v_out numeric; v_ref numeric; v_expected numeric;
        v_var numeric; v_cash uuid; v_date date; m record; v_num bigint; v_rec uuid; st outlets%rowtype;
begin
  select * into s from shifts where id = p_shift for update;
  if not found then raise exception 'shift not found'; end if;
  if s.status = 'closed' then return; end if;
  select * into st from outlets where id = s.outlet_id;

  select coalesce(sum(p.amount),0) into v_cash_pay
    from payments p join payment_methods pm on pm.id = p.method_id and pm.org_id = p.org_id
   where p.shift_id = s.id and p.status = 'succeeded' and pm.kind = 'cash';
  select coalesce(sum(amount) filter (where kind = 'in'),0), coalesce(sum(amount) filter (where kind = 'out'),0)
    into v_in, v_out from cash_movements where shift_id = s.id;
  select coalesce(sum(rf.total),0) into v_ref
    from refunds rf join payment_methods pm on pm.id = rf.method_id and pm.org_id = rf.org_id
   where rf.shift_id = s.id and pm.kind = 'cash' and rf.status = 'completed';

  v_expected := s.opening_cash + v_cash_pay + v_in - v_out - v_ref;
  v_var := p_counted - v_expected;
  update shifts set status = 'closed', closed_at = p_closed_at, closed_by = p_closed_by,
         closing_cash_counted = p_counted, expected_cash = v_expected, cash_variance = v_var,
         note = coalesce(p_note, note)
   where id = s.id;

  if v_var <> 0 then
    v_cash := app.cash_account(s.org_id);
    v_date := app.open_book_date(s.org_id, app.book_date(s.outlet_id, p_closed_at));
    perform app.post_journal(s.org_id, s.outlet_id, v_date, 'SHF', 'Selisih kas shift',
      'shift_close', s.id, 'shift:' || s.id || ':variance',
      case when v_var < 0
        then jsonb_build_array(jsonb_build_object('account_id', app.account_id(s.org_id,'cash_over_short'), 'debit', -v_var),
                               jsonb_build_object('account_id', v_cash, 'credit', -v_var))
        else jsonb_build_array(jsonb_build_object('account_id', v_cash, 'debit', v_var),
                               jsonb_build_object('account_id', app.account_id(s.org_id,'cash_over_short'), 'credit', v_var))
      end);
  end if;

  -- baris rekonsiliasi per metode non-tunai
  for m in
    select pm.id as method_id, pm.kind, sum(p.amount) as amt
      from payments p join payment_methods pm on pm.id = p.method_id and pm.org_id = p.org_id
     where p.shift_id = s.id and p.status = 'succeeded' and pm.kind in ('noncash','gateway')
     group by pm.id, pm.kind
  loop
    v_num := app.next_doc_number(s.org_id, 'REC', 0);
    insert into reconciliations(org_id, outlet_id, shift_id, method_id, number, expected_amount)
    values (s.org_id, s.outlet_id, s.id, m.method_id, 'REC-' || lpad(v_num::text, 6, '0'), m.amt)
    returning id into v_rec;
    -- metode gateway hanya direkonsiliasi lewat laporan settlement DOKU
    if st.auto_reconcile_noncash and m.kind = 'noncash' then
      perform app.reconcile(v_rec, m.amt, 0, app.account_id(s.org_id,'bank_main'), p_closed_by);
    end if;
  end loop;
end $$;

-- Refund: jurnal balik pendapatan + (opsional) barang kembali ke stok
create or replace function app.post_refund(p_refund uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare rf refunds%rowtype; o orders%rowtype; pm payment_methods%rowtype; v_tax numeric; v_date date; v_lines jsonb;
        ri record; c record; v_loc uuid; v_cost numeric := 0; v_avg numeric;
begin
  select * into rf from refunds where id = p_refund for update;
  select * into o from orders where id = rf.order_id;
  select * into pm from payment_methods where id = rf.method_id;
  if o.finalized_at is null then perform app.finalize_order(o.id); end if;
  v_date := app.open_book_date(rf.org_id, app.book_date(rf.outlet_id, rf.created_at));
  v_tax := case when o.total > 0 then round(rf.total * o.tax_total / o.total, 2) else 0 end;
  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', app.account_id(rf.org_id,'sales_returns'), 'debit', rf.total - v_tax),
    jsonb_build_object('account_id', pm.account_id, 'credit', rf.total));
  if v_tax > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', app.account_id(rf.org_id,'tax_payable'), 'debit', v_tax);
  end if;

  if rf.restock then
    v_loc := app.outlet_location(rf.outlet_id);
    for ri in
      select oi.product_id as pid, r2.qty * pu.conversion as base_qty
        from refund_items r2
        join order_items oi on oi.id = r2.order_item_id and oi.org_id = r2.org_id
        join product_units pu on pu.id = oi.product_unit_id
       where r2.refund_id = rf.id
    loop
      for c in select * from app.sale_components(ri.pid, ri.base_qty) loop
        select coalesce(avg_cost, 0) into v_avg from stock_balances where location_id = v_loc and product_id = c.component_id;
        insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, ref_type, ref_id, source_key)
        values (rf.org_id, v_loc, c.component_id, 'refund_return', c.component_qty, coalesce(v_avg,0), 'refund', rf.id,
                'refund:' || rf.id || ':' || c.component_id || ':' || ri.pid)
        on conflict do nothing;
      end loop;
    end loop;
    select coalesce(sum(total_cost),0) into v_cost from stock_movements where ref_type = 'refund' and ref_id = rf.id;
    if v_cost > 0 then
      v_lines := v_lines
        || jsonb_build_object('account_id', app.account_id(rf.org_id,'inventory'), 'debit', v_cost)
        || jsonb_build_object('account_id', app.account_id(rf.org_id,'cogs'), 'credit', v_cost);
    end if;
  end if;
  perform app.post_journal(rf.org_id, rf.outlet_id, v_date, 'RFN', 'Refund ' || rf.number, 'refund', rf.id, 'refund:' || rf.id, v_lines);
  update refunds set status = 'completed' where id = rf.id;
end $$;

---------------------------------------------------------------------------------------------------
-- DOKU: dipanggil oleh rute server (service role). Tidak pernah oleh aplikasi POS.
---------------------------------------------------------------------------------------------------
-- Catat notifikasi masuk. Mengembalikan id baru, atau null bila notifikasi sama sudah pernah diterima.
create or replace function app.record_gateway_event(
  p_provider text, p_dedupe text, p_external_id text, p_partner_ref text, p_latest_status text,
  p_headers jsonb, p_body jsonb, p_sig_valid boolean) returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v uuid; v_org uuid;
begin
  select org_id into v_org from gateway_transactions where provider = p_provider and partner_reference_no = p_partner_ref;
  insert into gateway_events(org_id, provider, dedupe_key, external_id, partner_reference_no, latest_status, headers, body, signature_valid)
  values (v_org, p_provider, p_dedupe, p_external_id, p_partner_ref, p_latest_status, coalesce(p_headers,'{}'), p_body, p_sig_valid)
  on conflict (provider, dedupe_key) do nothing returning id into v;
  return v;
end $$;

-- Tandai transaksi gateway lunas (setelah server memastikan lewat query status DOKU).
-- Hasil: 'paid' | 'already_paid' | 'amount_mismatch' | 'late_payment_needs_review'
create or replace function app.gateway_mark_paid(
  p_partner_ref text, p_reference_no text, p_rrn text, p_amount numeric, p_paid_at timestamptz, p_fee numeric default null)
returns text language plpgsql security definer set search_path = public, app, pg_temp as $$
declare g gateway_transactions%rowtype; pay payments%rowtype; o orders%rowtype;
begin
  select * into g from gateway_transactions where partner_reference_no = p_partner_ref for update;
  if not found then raise exception 'unknown partner reference %', p_partner_ref; end if;
  if g.status = 'paid' then return 'already_paid'; end if;
  if p_amount <> g.amount then
    insert into activity_logs(org_id, outlet_id, action, entity, entity_id, detail)
    values (g.org_id, g.outlet_id, 'gateway.amount_mismatch', 'gateway_transaction', g.id,
            jsonb_build_object('expected', g.amount, 'reported', p_amount));
    return 'amount_mismatch';
  end if;
  select * into pay from payments where id = g.payment_id for update;
  select * into o from orders where id = pay.order_id for update;

  update gateway_transactions set status = 'paid', paid_at = p_paid_at, reference_no = coalesce(p_reference_no, reference_no),
         rrn = p_rrn, fee_amount = coalesce(p_fee, fee_amount), next_check_at = null where id = g.id;

  -- pembayaran terlambat: QR sudah kami batalkan, tetapi uang tetap masuk
  if pay.status in ('cancelled','failed') or o.status = 'void' or (o.total - o.paid_total) < pay.amount then
    insert into activity_logs(org_id, outlet_id, action, entity, entity_id, detail)
    values (g.org_id, g.outlet_id, 'gateway.late_payment', 'gateway_transaction', g.id,
            jsonb_build_object('order_id', o.id, 'amount', g.amount, 'payment_status', pay.status, 'order_status', o.status));
    return 'late_payment_needs_review';
  end if;

  update payments set status = 'succeeded', paid_at = p_paid_at, reference = coalesce(p_reference_no, reference) where id = pay.id;
  if (select status from orders where id = o.id) = 'paid' then
    begin perform app.finalize_order(o.id);
    exception when others then
      insert into activity_logs(org_id, outlet_id, action, entity, entity_id, detail)
      values (o.org_id, o.outlet_id, 'order.finalize_failed', 'order', o.id, jsonb_build_object('error', sqlerrm));
    end;
  end if;
  return 'paid';
end $$;

-- Kedaluwarsakan transaksi QR hanya bila status sudah diperiksa SETELAH waktu kedaluwarsa dan masih belum lunas.
create or replace function app.gateway_expire_due() returns int
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare r record; n int := 0;
begin
  for r in select id, payment_id from gateway_transactions
            where status in ('created','pending') and expires_at < now() and last_checked_at > expires_at for update skip locked
  loop
    update gateway_transactions set status = 'expired', next_check_at = null where id = r.id;
    update payments set status = 'cancelled', failure_reason = 'qr_expired' where id = r.payment_id and status = 'pending';
    n := n + 1;
  end loop;
  return n;
end $$;

-- Terapkan laporan settlement: pindahkan saldo perantara ke bank, catat biaya, tutup baris rekonsiliasi gateway.
create or replace function app.apply_settlement(p_settlement uuid) returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare s gateway_settlements%rowtype; v_lines jsonb := '[]'::jsonb; r record; v_je uuid; v_date date; v_sum numeric := 0;
begin
  select * into s from gateway_settlements where id = p_settlement for update;
  if not found then raise exception 'settlement not found'; end if;
  if s.journal_entry_id is not null then return s.journal_entry_id; end if;
  if s.bank_account_id is null then raise exception 'settlement needs a bank account'; end if;
  for r in
    select pm.account_id, sum(l.amount) as amt
      from gateway_settlement_lines l
      join gateway_transactions g on g.id = l.gateway_transaction_id and g.org_id = l.org_id
      join payments p on p.id = g.payment_id and p.org_id = g.org_id
      join payment_methods pm on pm.id = p.method_id and pm.org_id = p.org_id
     where l.settlement_id = s.id group by pm.account_id
  loop
    v_lines := v_lines || jsonb_build_object('account_id', r.account_id, 'credit', r.amt);
    v_sum := v_sum + r.amt;
  end loop;
  if v_sum <> s.gross_amount then
    raise exception 'settlement lines (%) do not add up to gross (%)', v_sum, s.gross_amount;
  end if;
  v_lines := v_lines || jsonb_build_object('account_id', s.bank_account_id, 'debit', s.net_amount);
  if s.fee_total > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', app.account_id(s.org_id,'gateway_fee_expense'), 'debit', s.fee_total);
  end if;
  v_date := app.open_book_date(s.org_id, s.settlement_date);
  v_je := app.post_journal(s.org_id, null, v_date, 'STL', 'Settlement DOKU ' || coalesce(s.reference,''),
                           'settlement', s.id, 'settlement:' || s.id, v_lines);
  update gateway_settlements set status = 'settled', journal_entry_id = v_je where id = s.id;

  -- baris rekonsiliasi gateway yang seluruh transaksinya sudah ter-settle
  update reconciliations rc set status = 'reconciled', actual_amount = rc.expected_amount, difference = 0,
         bank_account_id = s.bank_account_id, settlement_id = s.id, journal_entry_id = v_je, reconciled_at = now()
   where rc.org_id = s.org_id and rc.status = 'unreconciled'
     and exists (select 1 from payment_methods pm where pm.id = rc.method_id and pm.kind = 'gateway')
     and exists (select 1 from gateway_settlement_lines l
                  join gateway_transactions g on g.id = l.gateway_transaction_id
                  join payments p on p.id = g.payment_id
                 where l.settlement_id = s.id and p.shift_id = rc.shift_id and p.method_id = rc.method_id)
     and not exists (select 1 from payments p
                      join gateway_transactions g on g.payment_id = p.id and p.status = 'succeeded'
                     where p.shift_id = rc.shift_id and p.method_id = rc.method_id
                       and not exists (select 1 from gateway_settlement_lines l2 where l2.gateway_transaction_id = g.id));
  return v_je;
end $$;

-- ===== db/12_access.sql =====
-- Bagian 12: fungsi akses. Dipakai oleh kebijakan RLS dan laporan. Akun perangkat (role 'device') sengaja
-- tidak muncul di sini: perangkat hanya boleh memanggil fungsi sinkronisasi, tidak boleh membaca tabel langsung.

create or replace function app.user_org_ids() returns setof uuid
language sql stable security definer set search_path = public, app, pg_temp as $$
  select org_id from org_members where user_id = auth.uid() and role <> 'device' $$;

create or replace function app.member_role(p_org uuid) returns text
language sql stable security definer set search_path = public, app, pg_temp as $$
  select role from org_members where org_id = p_org and user_id = auth.uid() $$;

create or replace function app.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce(app.member_role(p_org) in ('owner','admin'), false) $$;

create or replace function app.can_manage(p_org uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce(app.member_role(p_org) in ('owner','admin','manager'), false) $$;

-- boleh melihat outlet ini? pemilik/admin: semua outlet org; lainnya: hanya outlet yang ditugaskan
create or replace function app.can_see_outlet(p_org uuid, p_outlet uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case
    when app.member_role(p_org) is null or app.member_role(p_org) = 'device' then false
    when app.member_role(p_org) in ('owner','admin') then true
    else exists (select 1 from member_outlets mo where mo.org_id = p_org and mo.user_id = auth.uid() and mo.outlet_id = p_outlet)
  end $$;

-- pemanggil tepercaya = rute server dengan service role (tidak ada auth.uid())
create or replace function app.require_report_access(p_org uuid, p_outlet uuid) returns void
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  if auth.uid() is null then return; end if;
  if p_outlet is null then
    if not app.can_manage(p_org) or app.member_role(p_org) = 'manager' then
      raise exception 'org-wide reports need owner or admin';
    end if;
  elsif not app.can_see_outlet(p_org, p_outlet) or not app.can_manage(p_org) then
    raise exception 'no access to this outlet report';
  end if;
end $$;

-- ===== db/13_reports.sql =====
-- Bagian 13: laporan keuangan, semuanya turunan dari journal_lines (jurnal terposting dan yang di-void; keduanya saling meniadakan)

create or replace function app.report_trial_balance(p_org uuid, p_from date, p_to date, p_outlet uuid default null)
returns table(account_id uuid, code text, name text, category text,
              opening numeric, debit numeric, credit numeric, closing numeric)
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  perform app.require_report_access(p_org, p_outlet);
  return query
  with mv as (
    select jl.account_id,
           coalesce(sum(jl.debit - jl.credit) filter (where je.entry_date < p_from), 0) as open_net,
           coalesce(sum(jl.debit)  filter (where je.entry_date between p_from and p_to), 0) as dr,
           coalesce(sum(jl.credit) filter (where je.entry_date between p_from and p_to), 0) as cr
      from journal_lines jl join journal_entries je on je.id = jl.entry_id and je.org_id = jl.org_id
     where jl.org_id = p_org and je.status in ('posted','voided') and je.entry_date <= p_to
       and (p_outlet is null or je.outlet_id = p_outlet)
     group by jl.account_id)
  select a.id, a.code, a.name, a.category,
         case when app.is_debit_normal(a.category) then mv.open_net else -mv.open_net end,
         mv.dr, mv.cr,
         case when app.is_debit_normal(a.category) then mv.open_net + mv.dr - mv.cr else -(mv.open_net + mv.dr - mv.cr) end
    from mv join accounts a on a.id = mv.account_id
   order by a.code;
end $$;

create or replace function app.report_income_statement(p_org uuid, p_from date, p_to date, p_outlet uuid default null)
returns table(section text, code text, name text, amount numeric)
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  perform app.require_report_access(p_org, p_outlet);
  return query
  with mv as (
    select a.code, a.name, a.category,
           case when app.is_debit_normal(a.category) then sum(jl.debit - jl.credit) else sum(jl.credit - jl.debit) end as amt
      from journal_lines jl
      join journal_entries je on je.id = jl.entry_id and je.org_id = jl.org_id
      join accounts a on a.id = jl.account_id
     where jl.org_id = p_org and je.status in ('posted','voided') and je.entry_date between p_from and p_to
       and (p_outlet is null or je.outlet_id = p_outlet)
       and a.category in ('revenue','cogs','expense','other_income','other_expense')
     group by a.code, a.name, a.category),
  tot as (
    select coalesce(sum(amt) filter (where category = 'revenue'), 0) rev,
           coalesce(sum(amt) filter (where category = 'cogs'), 0) cg,
           coalesce(sum(amt) filter (where category = 'expense'), 0) ex,
           coalesce(sum(amt) filter (where category = 'other_income'), 0) oi,
           coalesce(sum(amt) filter (where category = 'other_expense'), 0) oe
      from mv)
  select s, c, n, v from (
    select 1 o, 'revenue' s, mv.code c, mv.name n, mv.amt v from mv where category = 'revenue'
    union all select 2, 'cogs', mv.code, mv.name, mv.amt from mv where category = 'cogs'
    union all select 3, 'gross_profit', null, 'Laba Kotor', rev - cg from tot
    union all select 4, 'expense', mv.code, mv.name, mv.amt from mv where category = 'expense'
    union all select 5, 'operating_profit', null, 'Laba Operasional', rev - cg - ex from tot
    union all select 6, 'other_income', mv.code, mv.name, mv.amt from mv where category = 'other_income'
    union all select 7, 'other_expense', mv.code, mv.name, mv.amt from mv where category = 'other_expense'
    union all select 8, 'net_profit', null, 'Laba Bersih', rev - cg - ex + oi - oe from tot
  ) x order by o, c;
end $$;

-- Neraca per tanggal. Laba berjalan kumulatif dimasukkan sebagai baris ekuitas (belum ada tutup buku tahunan).
create or replace function app.report_balance_sheet(p_org uuid, p_as_of date, p_outlet uuid default null)
returns table(section text, code text, name text, amount numeric)
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  perform app.require_report_access(p_org, p_outlet);
  return query
  with mv as (
    select a.code, a.name, a.category, sum(jl.debit - jl.credit) as net
      from journal_lines jl
      join journal_entries je on je.id = jl.entry_id and je.org_id = jl.org_id
      join accounts a on a.id = jl.account_id
     where jl.org_id = p_org and je.status in ('posted','voided') and je.entry_date <= p_as_of
       and (p_outlet is null or je.outlet_id = p_outlet)
     group by a.code, a.name, a.category),
  earn as (
    select coalesce(-sum(net), 0) as profit   -- net = debit - credit; laba = kredit - debit seluruh akun laba-rugi
      from mv where category in ('revenue','cogs','expense','other_income','other_expense'))
  select s, c, n, v from (
    select 1 o, 'asset' s, mv.code c, mv.name n, mv.net v from mv
     where category in ('cash_bank','receivable','inventory','other_current_asset','fixed_asset','accumulated_depreciation')
    union all select 2, 'liability', mv.code, mv.name, -mv.net from mv
     where category in ('payable','short_term_liability','long_term_liability')
    union all select 3, 'equity', mv.code, mv.name, -mv.net from mv where category = 'equity'
    union all select 3, 'equity', '3-9999', 'Laba Berjalan (kumulatif)', profit from earn
  ) x order by o, c;
end $$;

-- Utang/piutang: umur faktur pembelian yang belum lunas
create or replace function app.report_payables_aging(p_org uuid, p_as_of date)
returns table(supplier_id uuid, supplier_name text, invoice_id uuid, number text, due_date date,
              outstanding numeric, days_overdue int)
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  perform app.require_report_access(p_org, null);
  return query
  select pi.supplier_id, coalesce(s.name, '(tanpa pemasok)'), pi.id, pi.number, pi.due_date,
         pi.total - pi.paid_total, greatest(0, p_as_of - pi.due_date)
    from purchase_invoices pi left join suppliers s on s.id = pi.supplier_id and s.org_id = pi.org_id
   where pi.org_id = p_org and pi.status in ('open','partially_paid') and pi.invoice_date <= p_as_of
   order by pi.due_date nulls last;
end $$;

-- Ringkasan penjualan harian per outlet (laporan dasar T1)
create or replace function app.report_sales_daily(p_org uuid, p_from date, p_to date, p_outlet uuid default null)
returns table(day date, outlet_id uuid, orders bigint, gross_sales numeric, discounts numeric, service_charge numeric,
              tax numeric, rounding numeric, net_total numeric)
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  perform app.require_report_access(p_org, p_outlet);
  return query
  select app.book_date(o.outlet_id, o.closed_at), o.outlet_id, count(*), sum(o.subtotal), sum(o.discount_total),
         sum(o.service_charge), sum(o.tax_total), sum(o.rounding), sum(o.total)
    from orders o
   where o.org_id = p_org and o.status = 'paid'
     and app.book_date(o.outlet_id, o.closed_at) between p_from and p_to
     and (p_outlet is null or o.outlet_id = p_outlet)
   group by 1, 2 order by 1, 2;
end $$;

-- ===== db/14_sync.sql =====
-- Bagian 14: sinkronisasi POS <-> server. Perangkat hanya memanggil dua fungsi ini (dan fungsi PIN/DOKU lewat rute server).

-- Catatan penghapusan untuk tabel penghubung yang tidak punya deleted_at
create table sync_tombstones (
  sync_seq bigint primary key default nextval('app.sync_seq'),
  org_id uuid not null,
  table_name text not null,
  row_key jsonb not null,
  created_at timestamptz not null default now()
);
create index on sync_tombstones (org_id, sync_seq);

create or replace function app.record_tombstone() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  insert into sync_tombstones(org_id, table_name, row_key) values (old.org_id, tg_table_name, to_jsonb(old));
  return old;
end $$;

-- Terapkan satu operasi dari perangkat. Dipanggil hanya oleh sync_push, di dalam sub-transaksi.
create or replace function app._apply_op(p_dev devices, p_type text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
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
    perform app.close_shift(v_shift.id, (pl->>'closed_by')::uuid, (pl->>'counted')::numeric,
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
      begin perform app.finalize_order(v_id);
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
    perform app.post_cash_movement((pl->>'id')::uuid);
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
    if v_method.kind <> 'gateway' then perform app.post_refund((pl->>'id')::uuid); end if;
    return jsonb_build_object('id', pl->>'id');

  else
    raise exception 'unknown op type %', p_type;
  end case;
end $$;

-- Terima antrean operasi dari perangkat. Aman dikirim ulang (op_id unik). Urutan array = urutan penerapan.
create or replace function app.sync_push(p_device uuid, p_ops jsonb) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
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
      v_res := app._apply_op(d, op->>'type', op->'payload');
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
create or replace function app.sync_pull(p_device uuid, p_since bigint, p_limit int default 500) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
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
      else case when exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=t and c.column_name='outlet_id')
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

-- ===== db/15_security.sql =====
-- Bagian 15: pemicu otomatis, RLS, hak akses

-- 1) updated_at otomatis pada semua tabel yang punya kolomnya; sync_seq pada tabel yang punya kolomnya
do $$
declare r record;
begin
  for r in select distinct c.table_name from information_schema.columns c
            join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
           where c.table_schema = 'public' and c.column_name = 'updated_at' loop
    execute format('create trigger %I before update on %I for each row execute function app.touch_updated_at()', 'trg_touch_' || r.table_name, r.table_name);
  end loop;
  for r in select distinct c.table_name from information_schema.columns c
            join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
           where c.table_schema = 'public' and c.column_name = 'sync_seq' and c.table_name <> 'sync_tombstones' loop
    execute format('create trigger %I before insert or update on %I for each row execute function app.set_sync_seq()', 'trg_seq_' || r.table_name, r.table_name);
    -- tabel penghubung tanpa deleted_at: catat penghapusan keras
    if not exists (select 1 from information_schema.columns c2 where c2.table_schema='public' and c2.table_name=r.table_name and c2.column_name='deleted_at')
       and r.table_name <> 'outlet_settings' then
      execute format('create trigger %I after delete on %I for each row execute function app.record_tombstone()', 'trg_tomb_' || r.table_name, r.table_name);
    end if;
  end loop;
end $$;

-- 2) RLS
-- Kelompok:
--   no_access  : hanya service role (rahasia gateway)
--   read_only  : staf boleh baca; tulis hanya lewat fungsi (data transaksi dan pembukuan)
--   managed    : staf boleh baca; pemilik/admin/manager boleh tulis langsung (katalog, pengaturan)
do $$
declare
  t text;
  no_access text[] := array['payment_provider_accounts','gateway_tokens','gateway_events','sync_tombstones'];
  read_only text[] := array['orders','order_items','order_item_extras','order_discounts','order_tax_lines','payments','payment_allocations',
    'order_voids','refunds','refund_items','shifts','cash_movements','sync_ops','journal_entries','journal_lines','stock_movements',
    'stock_balances','gateway_transactions','gateway_settlements','gateway_settlement_lines','doc_sequences','reconciliations',
    'activity_logs','loyalty_ledger'];
  v_has_outlet boolean;
begin
  for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' loop
    execute format('alter table %I enable row level security', t);
    if t = any(no_access) then continue; end if;
    if t = 'asset_depreciations' then
      execute 'create policy sel on asset_depreciations for select to authenticated using (exists (select 1 from fixed_assets f where f.id = asset_id and f.org_id in (select app.user_org_ids())))';
      continue;
    end if;
    if t = 'orgs' then
      execute 'create policy sel on orgs for select to authenticated using (id in (select app.user_org_ids()))';
      execute 'create policy upd on orgs for update to authenticated using (app.is_org_admin(id)) with check (app.is_org_admin(id))';
      continue;
    end if;
    if t = 'org_members' then
      execute 'create policy sel on org_members for select to authenticated using (org_id in (select app.user_org_ids()))';
      execute 'create policy ins on org_members for insert to authenticated with check (app.is_org_admin(org_id) and role <> ''owner'')';
      execute 'create policy upd on org_members for update to authenticated using (app.is_org_admin(org_id) and role <> ''owner'') with check (app.is_org_admin(org_id) and role <> ''owner'')';
      execute 'create policy del on org_members for delete to authenticated using (app.is_org_admin(org_id) and role <> ''owner'')';
      continue;
    end if;
    if t = 'outlets' then
      execute 'create policy sel on outlets for select to authenticated using (app.can_see_outlet(org_id, id))';
      execute 'create policy ins on outlets for insert to authenticated with check (app.is_org_admin(org_id))';
      execute 'create policy upd on outlets for update to authenticated using (app.is_org_admin(org_id)) with check (app.is_org_admin(org_id))';
      continue;
    end if;
    select exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='outlet_id') into v_has_outlet;
    if t = any(read_only) then
      if v_has_outlet then
        execute format('create policy sel on %I for select to authenticated using (org_id in (select app.user_org_ids()) and (outlet_id is null or app.can_see_outlet(org_id, outlet_id)))', t);
      else
        execute format('create policy sel on %I for select to authenticated using (org_id in (select app.user_org_ids()))', t);
      end if;
    else
      if v_has_outlet then
        execute format('create policy sel on %I for select to authenticated using (org_id in (select app.user_org_ids()) and (outlet_id is null or app.can_see_outlet(org_id, outlet_id)))', t);
      else
        execute format('create policy sel on %I for select to authenticated using (org_id in (select app.user_org_ids()))', t);
      end if;
      execute format('create policy ins on %I for insert to authenticated with check (app.can_manage(org_id))', t);
      execute format('create policy upd on %I for update to authenticated using (app.can_manage(org_id)) with check (app.can_manage(org_id))', t);
      execute format('create policy del on %I for delete to authenticated using (app.can_manage(org_id))', t);
    end if;
  end loop;
end $$;

-- jurnal dan akun sistem: akun bawaan tidak boleh dihapus/diganti kuncinya lewat klien
create or replace function app.accounts_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from orgs where id = old.org_id) then return old; end if;   -- hapus-org berantai
    if old.system_key is not null then raise exception 'system account cannot be deleted'; end if;
    if exists (select 1 from journal_lines where account_id = old.id) then raise exception 'account has journal lines; deactivate it instead'; end if;
    return old;
  end if;
  if old.system_key is distinct from new.system_key and auth.uid() is not null then
    raise exception 'system_key is locked';
  end if;
  if old.category <> new.category and exists (select 1 from journal_lines where account_id = old.id) then
    raise exception 'cannot change category of an account that has journal lines';
  end if;
  return new;
end $$;
create trigger accounts_guard before update or delete on accounts for each row execute function app.accounts_guard();

-- 2b) FK antar tabel dibuat DEFERRABLE INITIALLY IMMEDIATE: perilaku biasa tetap langsung, tetapi app.delete_org
--     dapat menundanya sampai semua hapus-berantai selesai. (ON DELETE CASCADE ke orgs tetap berlaku.)
do $$
declare c record;
begin
  for c in select conrelid::regclass as tbl, conname from pg_constraint
            where contype = 'f' and connamespace = 'public'::regnamespace and confdeltype = 'a' and not condeferrable loop
    execute format('alter table %s alter constraint %I deferrable initially immediate', c.tbl, c.conname);
  end loop;
end $$;

-- 3) hak akses
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant usage on schema app to authenticated, service_role;
grant select on all tables in schema public to authenticated;
do $$
declare t text;
  writable text[];
begin
  -- tulis langsung hanya pada tabel katalog/pengaturan (kebijakan 'ins/upd/del' di atas yang membatasi per peran)
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
              and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'ins') loop
    execute format('grant insert, update, delete on %I to authenticated', t);
  end loop;
  grant update on orgs to authenticated;
  grant update on outlets to authenticated;
end $$;
-- rahasia gateway dan antrean tombstone: tidak ada akses klien sama sekali (RLS tanpa kebijakan = lapis kedua)
revoke all on payment_provider_accounts, gateway_tokens, gateway_events, sync_tombstones from authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant usage on sequence app.sync_seq to authenticated, service_role;

-- fungsi: tutup untuk publik, buka hanya yang memang untuk klien
revoke all on all functions in schema app from public;
grant execute on function app.user_org_ids(), app.member_role(uuid), app.is_org_admin(uuid), app.can_manage(uuid),
      app.can_see_outlet(uuid, uuid), app.is_debit_normal(text) to authenticated, service_role;
grant execute on function app.sync_push(uuid, jsonb), app.sync_pull(uuid, bigint, int) to authenticated, service_role;
grant execute on function app.report_trial_balance(uuid, date, date, uuid), app.report_income_statement(uuid, date, date, uuid),
      app.report_balance_sheet(uuid, date, uuid), app.report_payables_aging(uuid, date),
      app.report_sales_daily(uuid, date, date, uuid) to authenticated, service_role;
-- semua fungsi lain (posting, PIN, gateway, create_org, seed) hanya untuk server
grant execute on all functions in schema app to service_role;
