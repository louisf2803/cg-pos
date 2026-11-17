-- CG POS · 0153_staff_accounts
-- Aplikasi HP karyawan (Android, Expo): karyawan masuk dengan email dan kata sandi akun Supabase, lalu aplikasi perlu tahu "saya karyawan yang mana".
-- employees.user_id (0001) sudah ada untuk tautan itu. Migrasi ini menambah:
--  * staff_account_link(karyawan, email)  : pengelola menautkan akun Supabase (yang sudah dibuat di Authentication) ke satu karyawan, dan memastikan akun itu
--                                           anggota organisasi (peran bawaan menurut peran karyawan; peran pemilik hanya bila akunnya memang sudah pemilik org ini);
--  * staff_account_unlink(karyawan)       : melepas tautan (keanggotaan org tidak diubah);
--  * staff_account_list()                 : daftar tautan beserta email, hanya untuk pengelola;
--  * staff_me()                           : identitas karyawan untuk akun yang sedang masuk (null bila belum ditautkan), termasuk daftar outlet.
-- Pembuatan akun login tetap di Supabase (Authentication, Users); aplikasi tidak mendaftarkan akun sendiri.

create or replace function pos.staff_account_link(p_employee uuid, p_email text) returns uuid
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare e employees%rowtype; v_user uuid; v_role text; v_member text;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select * into e from employees where id = p_employee and deleted_at is null;
  if not found then raise exception 'employee not found'; end if;
  if not pos.can_manage(e.org_id) then raise exception 'not allowed'; end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if v_user is null then raise exception 'user not found'; end if;
  if exists (select 1 from employees x where x.user_id = v_user and x.id <> e.id and x.deleted_at is null) then raise exception 'already linked'; end if;
  select role into v_member from org_members where org_id = e.org_id and user_id = v_user;
  if v_member = 'device' then raise exception 'device account'; end if;
  if v_member is null then
    v_role := case e.role when 'manager' then 'manager' when 'owner' then null else 'cashier' end;
    if v_role is null then raise exception 'owner membership required'; end if;
    insert into org_members(org_id, user_id, role) values (e.org_id, v_user, v_role);
  end if;
  update employees set user_id = v_user, updated_at = now() where id = e.id;
  return v_user;
end $$;

create or replace function pos.staff_account_unlink(p_employee uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid;
begin
  select org_id into v_org from employees where id = p_employee;
  if v_org is null then raise exception 'employee not found'; end if;
  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  update employees set user_id = null, updated_at = now() where id = p_employee;
end $$;

create or replace function pos.staff_account_list() returns table(employee_id uuid, user_id uuid, email text)
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select e.id, e.user_id, u.email::text
    from employees e join auth.users u on u.id = e.user_id
   where e.user_id is not null and e.deleted_at is null and pos.can_manage(e.org_id) $$;

create or replace function pos.staff_me() returns jsonb
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare e employees%rowtype; v_outlets jsonb; v_member text;
begin
  if auth.uid() is null then return null; end if;
  select * into e from employees where user_id = auth.uid() and deleted_at is null and is_active order by created_at limit 1;
  if not found then return null; end if;
  select role into v_member from org_members where org_id = e.org_id and user_id = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by o.name), '[]'::jsonb) into v_outlets
    from outlets o
   where o.org_id = e.org_id
     and (exists (select 1 from employee_outlets eo where eo.employee_id = e.id and eo.outlet_id = o.id)
          or (e.role in ('owner', 'manager') and not exists (select 1 from employee_outlets eo where eo.employee_id = e.id)));
  return jsonb_build_object('employee_id', e.id, 'org_id', e.org_id, 'name', e.name, 'role', e.role, 'member_role', v_member, 'outlets', v_outlets);
end $$;

revoke all on function pos.staff_account_link(uuid, text), pos.staff_account_unlink(uuid), pos.staff_account_list(), pos.staff_me() from public, anon;
grant execute on function pos.staff_account_link(uuid, text), pos.staff_account_unlink(uuid), pos.staff_account_list(), pos.staff_me() to authenticated, service_role;
