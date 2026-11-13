-- CG POS · 0103_granular_role_enforcement
-- Penegakan izin granular peran (A142):
-- 1. Status PIN, kunci akun, dan QR ID pada karyawan (A99 / REQUESTS-FOR-CLAUDE.md).
-- 2. Penegakan otorisasi void & refund di sisi server pada sync_push.
-- 3. Pemeriksaan izin granular (pos.can_user_perform) untuk produk, pelanggan, harga.
begin;
set local search_path = pos, extensions, public;

-- =====================================================================================
-- 1. Kolom dan izin karyawan: qr_code boleh diakses klien aman; status PIN & fungsi buka kunci
-- =====================================================================================

grant select (qr_code) on pos.employees to authenticated;
grant update (qr_code) on pos.employees to authenticated;

-- Fungsi buka kunci PIN kasir yang terkunci akibat salah PIN beruntun (5x)
create or replace function pos.unlock_employee_pin(p_employee uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid;
begin
  select org_id into v_org from employees where id = p_employee and deleted_at is null;
  if v_org is null then raise exception 'employee not found'; end if;
  if not pos.can_manage(v_org) then raise exception 'no access'; end if;
  update employees set pin_failed_count = 0, pin_locked_until = null where id = p_employee;
end $$;

revoke all on function pos.unlock_employee_pin(uuid) from public;
grant execute on function pos.unlock_employee_pin(uuid) to authenticated, service_role;

-- Pembacaan status PIN & kunci tanpa membocorkan hash rahasia ke klien
create or replace function pos.list_managed_employees_status(p_org uuid)
returns table (
  id uuid,
  has_pin boolean,
  is_locked boolean,
  locked_until timestamptz,
  qr_id text
)
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select e.id,
         (e.pin_hash is not null) as has_pin,
         (e.pin_locked_until is not null and e.pin_locked_until > now()) as is_locked,
         e.pin_locked_until as locked_until,
         e.qr_code as qr_id
  from employees e
  where e.org_id = p_org and e.deleted_at is null and (pos.can_manage(p_org) or auth.uid() is null);
$$;

revoke all on function pos.list_managed_employees_status(uuid) from public;
grant execute on function pos.list_managed_employees_status(uuid) to authenticated, service_role;

-- =====================================================================================
-- 2. Pemeriksaan otorisasi void & refund di sisi server
-- =====================================================================================

create or replace function pos.can_employee_authorize_void(p_employee uuid) returns boolean
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare e employees%rowtype; r roles%rowtype;
begin
  if p_employee is null then return false; end if;
  select * into e from employees where id = p_employee and is_active and deleted_at is null;
  if not found then return false; end if;
  if e.role in ('owner', 'admin') then return true; end if;
  if e.role_id is not null then
    select * into r from roles where id = e.role_id and deleted_at is null;
    if found then return r.can_authorize_void; end if;
  end if;
  return e.role = 'manager';
end $$;

create or replace function pos.can_employee_authorize_refund(p_employee uuid) returns boolean
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare e employees%rowtype; r roles%rowtype;
begin
  if p_employee is null then return false; end if;
  select * into e from employees where id = p_employee and is_active and deleted_at is null;
  if not found then return false; end if;
  if e.role in ('owner', 'admin') then return true; end if;
  if e.role_id is not null then
    select * into r from roles where id = e.role_id and deleted_at is null;
    if found then return r.can_authorize_refund; end if;
  end if;
  return e.role = 'manager';
end $$;

revoke all on function pos.can_employee_authorize_void(uuid), pos.can_employee_authorize_refund(uuid) from public;
grant execute on function pos.can_employee_authorize_void(uuid), pos.can_employee_authorize_refund(uuid) to authenticated, service_role;

-- =====================================================================================
-- 3. Pemeriksaan izin granular aksi klien untuk katalog, pelanggan, harga
-- =====================================================================================

create or replace function pos.can_user_perform(
  p_org uuid,
  p_module text,
  p_feature text,
  p_action text
) returns boolean
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare
  v_role text;
  v_emp employees%rowtype;
  v_mod_enabled boolean;
  v_allowed boolean;
begin
  if auth.uid() is null then return true; end if; -- service_role / internal DB
  v_role := pos.member_role(p_org);
  if v_role in ('owner', 'admin') then return true; end if;
  if v_role is null then return false; end if;

  select * into v_emp from employees where org_id = p_org and user_id = auth.uid() and is_active and deleted_at is null limit 1;
  if not found then
    return (v_role = 'manager');
  end if;

  if v_emp.role in ('owner', 'admin') then return true; end if;

  if v_emp.role_id is not null then
    select enabled into v_mod_enabled from role_dashboard_perms where role_id = v_emp.role_id and module_id = p_module;
    if v_mod_enabled is not null and not v_mod_enabled then
      return false;
    end if;

    select case p_action
      when 'view' then can_view
      when 'create' then can_create
      when 'edit' then can_edit
      when 'delete' then can_delete
      when 'void' then can_void
      else false end
    into v_allowed
    from role_dashboard_feature_perms
    where role_id = v_emp.role_id and module_id = p_module and feature_id = p_feature
    limit 1;

    if v_allowed is not null then
      return v_allowed;
    end if;
  end if;

  return (v_emp.role in ('owner', 'manager'));
end $$;

revoke all on function pos.can_user_perform(uuid, text, text, text) from public;
grant execute on function pos.can_user_perform(uuid, text, text, text) to authenticated, service_role;

-- Guard triggers untuk tabel utama yang ditulis klien
create or replace function pos.guard_granular_catalog() returns trigger
language plpgsql as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then v_action := 'create';
  elsif tg_op = 'UPDATE' then v_action := 'edit';
  elsif tg_op = 'DELETE' then v_action := 'delete';
  end if;

  if not pos.can_user_perform(coalesce(new.org_id, old.org_id), 'penjualan', 'dash-produk', v_action) then
    raise exception 'permission denied for % on products', v_action;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_products on pos.products;
create trigger trg_guard_products before insert or update or delete on pos.products
for each row execute function pos.guard_granular_catalog();

create or replace function pos.guard_granular_customers() returns trigger
language plpgsql as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then v_action := 'create';
  elsif tg_op = 'UPDATE' then v_action := 'edit';
  elsif tg_op = 'DELETE' then v_action := 'delete';
  end if;

  if not pos.can_user_perform(coalesce(new.org_id, old.org_id), 'penjualan', 'dash-pelanggan', v_action) then
    raise exception 'permission denied for % on customers', v_action;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_customers on pos.customers;
create trigger trg_guard_customers before insert or update or delete on pos.customers
for each row execute function pos.guard_granular_customers();

create or replace function pos.guard_granular_price_schedules() returns trigger
language plpgsql as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then v_action := 'create';
  elsif tg_op = 'UPDATE' then v_action := 'edit';
  elsif tg_op = 'DELETE' then v_action := 'delete';
  end if;

  if not pos.can_user_perform(coalesce(new.org_id, old.org_id), 'penjualan', 'dash-produk', v_action) then
    raise exception 'permission denied for % on price schedules', v_action;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_price_schedules on pos.price_schedules;
create trigger trg_guard_price_schedules before insert or update or delete on pos.price_schedules
for each row execute function pos.guard_granular_price_schedules();

commit;
