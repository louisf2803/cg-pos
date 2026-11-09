-- Pengganti minimal skema auth Supabase untuk tes lokal
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
end $$;

-- seperti Supabase: pgcrypto hidup di schema extensions
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
-- tabel milik app lain di schema public (meniru proyek Coffee Ground): migrasi CG POS tidak boleh menyentuhnya
create table public.categories (id uuid primary key default gen_random_uuid(), name text not null, type text);
create table public.employees (id uuid primary key default gen_random_uuid(), full_name text not null, password text);
insert into public.categories(name,type) values ('Specialty Coffee','drink');
insert into public.employees(full_name,password) values ('Contoh','x');
grant select, insert, update, delete on public.categories, public.employees to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table public._baseline as
  select 'categories'::text t, (select count(*) from public.categories) n,
         (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='categories' and grantee='anon') anon_priv,
         (select count(*) from pg_constraint where connamespace='public'::regnamespace and condeferrable) deferrable_fks;
