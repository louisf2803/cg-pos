-- CG POS · 0123_outlet_business_bank_group
-- Menambahkan kolom informasi bisnis, rekening bank, grup outlet, dan logo pada pos.outlets

alter table pos.outlets add column if not exists email text;
alter table pos.outlets add column if not exists tax_id_number text;
alter table pos.outlets add column if not exists business_type text;
alter table pos.outlets add column if not exists outlet_group text;
alter table pos.outlets add column if not exists logo_url text;
alter table pos.outlets add column if not exists bank_name text;
alter table pos.outlets add column if not exists bank_account_number text;
alter table pos.outlets add column if not exists bank_account_name text;

create table if not exists pos.outlet_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table pos.outlet_groups enable row level security;
drop policy if exists sel on pos.outlet_groups;
create policy sel on pos.outlet_groups for select to authenticated using (pos.can_manage(org_id));
drop policy if exists ins on pos.outlet_groups;
create policy ins on pos.outlet_groups for insert to authenticated with check (pos.can_manage(org_id));
drop policy if exists upd on pos.outlet_groups;
create policy upd on pos.outlet_groups for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id));
drop policy if exists del on pos.outlet_groups;
create policy del on pos.outlet_groups for delete to authenticated using (pos.can_manage(org_id));

revoke all on pos.outlet_groups from anon;
grant select, insert, update, delete on pos.outlet_groups to authenticated;
