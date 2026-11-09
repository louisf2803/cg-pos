-- CG POS · 0002_accounts_catalog
-- Semua objek ada di schema pos. Tidak menyentuh schema public.
begin;
set local search_path = pos, extensions, public;

-- ===== 02_accounts.sql =====
-- Bagian 02: daftar akun dan jurnal (buku besar). Semua laporan keuangan diturunkan dari sini.
-- Daftar akun bawaan dibuat sendiri (lihat pos.seed_org_defaults), bukan salinan daftar akun Majoo.

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

create or replace function pos.is_debit_normal(p_category text) returns boolean
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
create or replace function pos.journal_entries_guard() returns trigger
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
  for each row execute function pos.journal_entries_guard();

create or replace function pos.journal_lines_guard() returns trigger
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
  for each row execute function pos.journal_lines_guard();

create or replace function pos.account_id(p_org uuid, p_key text) returns uuid
language plpgsql stable as $$
declare v uuid;
begin
  select id into v from accounts where org_id = p_org and system_key = p_key;
  if v is null then raise exception 'system account % missing for org %', p_key, p_org; end if;
  return v;
end $$;

-- helper posting: p_lines = [{"account_id": "...", "debit": 10, "credit": 0, "memo": "..."}]
-- Idempoten lewat p_source_key: bila sudah ada, mengembalikan id jurnal lama.
create or replace function pos.post_journal(
  p_org uuid, p_outlet uuid, p_date date, p_prefix text, p_desc text,
  p_source_type text, p_source_id uuid, p_source_key text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_id uuid; v_num bigint; l jsonb; i int := 0;
begin
  if p_source_key is not null then
    select id into v_id from journal_entries where org_id = p_org and source_key = p_source_key;
    if v_id is not null then return v_id; end if;
  end if;
  v_num := pos.next_doc_number(p_org, 'JRN:' || p_prefix, 0);
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

-- ===== 03_catalog.sql =====
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


commit;
