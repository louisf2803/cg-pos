begin;
set local search_path = pos, extensions, public;

-- =====================================================================================
-- 0010: pintu yang aman untuk klien (POS dan dashboard)
--
-- 1. verify_pin / admin_set_pin: PIN diperiksa dan diatur lewat fungsi yang memeriksa
--    perangkat dan hak akses. Fungsi dasarnya (verify_employee_pin / set_employee_pin)
--    tetap hanya untuk service_role.
-- 2. employees: kolom rahasia (pin_hash, hitungan salah, kunci, qr_code) tidak boleh dibaca
--    atau ditulis langsung oleh klien. Tanpa ini setiap kasir bisa membaca hash PIN rekannya
--    lewat API, dan PIN 6 digit mudah ditebak offline. sync_pull (security definer) tidak terpengaruh.
-- =====================================================================================

create or replace function pos.verify_pin(p_device uuid, p_employee uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare d devices%rowtype;
begin
  select * into d from devices where id = p_device and is_active;
  if not found then return false; end if;
  if auth.uid() is null or d.user_id is distinct from auth.uid() then
    raise exception 'not your device';
  end if;
  if not exists (select 1 from employee_outlets eo
                  where eo.employee_id = p_employee and eo.outlet_id = d.outlet_id and eo.org_id = d.org_id) then
    return false;
  end if;
  return pos.verify_employee_pin(p_employee, p_pin);
end $$;

create or replace function pos.admin_set_pin(p_employee uuid, p_pin text) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid;
begin
  select org_id into v_org from employees where id = p_employee;
  if v_org is null or not pos.can_manage(v_org) then
    raise exception 'no access';
  end if;
  perform pos.set_employee_pin(p_employee, p_pin);
end $$;

revoke all on function pos.verify_pin(uuid, uuid, text), pos.admin_set_pin(uuid, text) from public;
grant execute on function pos.verify_pin(uuid, uuid, text), pos.admin_set_pin(uuid, text) to authenticated, service_role;

revoke select, insert, update on pos.employees from authenticated;
grant select (id, org_id, user_id, name, role, permissions, is_active, sync_seq, deleted_at, created_at, updated_at)
  on pos.employees to authenticated;
grant insert (id, org_id, user_id, name, role, permissions, is_active) on pos.employees to authenticated;
grant update (user_id, name, role, permissions, is_active, deleted_at) on pos.employees to authenticated;

commit;
