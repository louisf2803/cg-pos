-- CG POS · 0001_base_tenancy
-- Semua objek ada di schema pos. Tidak menyentuh schema public.
begin;
set local search_path = pos, extensions, public;

create schema if not exists pos;
-- ===== 00_base.sql =====
-- CG POS schema v1 (PostgreSQL 15+, dirancang untuk Supabase)
-- Bagian 00: ekstensi, fungsi dasar, penomoran dokumen
-- Aturan umum: uang numeric(18,2), kuantitas dan harga modal numeric(18,4), waktu timestamptz (UTC),
-- org_id selalu 'on delete cascade' ke orgs. FK antar tabel memakai NO ACTION dan dijadikan DEFERRABLE (lihat 15_security.sql) agar pos.delete_org bisa menghapus seluruh data satu org.

create extension if not exists pgcrypto;


create or replace function pos.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- nomor urut global untuk sinkronisasi tarik (pull). Satu aliran berurut untuk semua tabel katalog.
create sequence if not exists pos.sync_seq;
create or replace function pos.set_sync_seq() returns trigger
language plpgsql as $$
begin new.sync_seq := nextval('pos.sync_seq'); return new; end $$;

-- ===== 01_tenancy.sql =====
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

create or replace function pos.next_doc_number(p_org uuid, p_scope text, p_period int default 0)
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

create or replace function pos.on_outlet_insert() returns trigger
language plpgsql as $$
begin
  insert into outlet_settings(outlet_id, org_id) values (new.id, new.org_id);
  insert into locations(org_id, outlet_id, name, kind) values (new.org_id, new.id, new.name, 'outlet');
  return new;
end $$;
create trigger outlets_after_insert after insert on outlets
  for each row execute function pos.on_outlet_insert();

create or replace function pos.outlet_location(p_outlet uuid) returns uuid
language sql stable as $$ select id from locations where outlet_id = p_outlet and kind = 'outlet' $$;


commit;
