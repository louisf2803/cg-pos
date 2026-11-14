-- CG POS · 0121_service_duration_and_staff
-- Menambahkan kolom durasi layanan dan staf pelaksana pada produk jasa:
-- 1. Kolom service_duration_min int check (service_duration_min is null or service_duration_min >= 0)
-- 2. Kolom service_staff_ids uuid[] default '{}'
-- 3. Tabel relasi pos.product_service_staff (product_id, employee_id, org_id)

alter table pos.products add column if not exists service_duration_min int check (service_duration_min is null or service_duration_min >= 0);
alter table pos.products add column if not exists service_staff_ids uuid[] default '{}';

create table if not exists pos.product_service_staff (
  org_id uuid not null references pos.orgs(id) on delete cascade,
  product_id uuid not null,
  employee_id uuid not null references pos.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, employee_id),
  foreign key (product_id, org_id) references pos.products(id, org_id) on delete cascade
);

alter table pos.product_service_staff enable row level security;
drop policy if exists sel on pos.product_service_staff;
create policy sel on pos.product_service_staff for select to authenticated using (pos.can_manage(org_id));
drop policy if exists ins on pos.product_service_staff;
create policy ins on pos.product_service_staff for insert to authenticated with check (pos.can_manage(org_id));
drop policy if exists upd on pos.product_service_staff;
create policy upd on pos.product_service_staff for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id));
drop policy if exists del on pos.product_service_staff;
create policy del on pos.product_service_staff for delete to authenticated using (pos.can_manage(org_id));

revoke all on pos.product_service_staff from anon;
grant select, insert, update, delete on pos.product_service_staff to authenticated;
