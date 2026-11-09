-- STATUS: BELUM DITERAPKAN ke project nyata (2026-11-10). Uji dengan rollback tertahan: server Supabase meminta konfirmasi yang tidak terjawab.
-- Hanya pemilik (atau admin) organisasi yang boleh memberi, mencabut, atau mengubah peran "owner" pada karyawan.
-- Tanpa ini, manajer (yang boleh mengelola karyawan) bisa mengangkat diri atau orang lain menjadi pemilik,
-- lalu memakai PIN pemilik untuk menyetujui void. Jalur server (tanpa JWT pengguna) tidak dibatasi.
create or replace function pos.employees_owner_guard() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if coalesce(pos.member_role(coalesce(new.org_id, old.org_id)), '') in ('owner', 'admin') then return coalesce(new, old); end if;
  if tg_op = 'INSERT' and new.role = 'owner' then
    raise exception 'only owner can grant owner role';
  end if;
  if tg_op = 'UPDATE' and (old.role = 'owner' or new.role = 'owner') then
    -- pemilik tidak boleh diubah oleh manajer; peran lain boleh
    if old.role is distinct from new.role or old.name is distinct from new.name
       or old.is_active is distinct from new.is_active or old.deleted_at is distinct from new.deleted_at
       or old.permissions is distinct from new.permissions or old.user_id is distinct from new.user_id then
      raise exception 'only owner can change an owner employee';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists employees_owner_guard on pos.employees;
create trigger employees_owner_guard before insert or update on pos.employees
  for each row execute function pos.employees_owner_guard();

-- PIN pemilik juga hanya boleh diatur oleh pemilik/admin (PIN pemilik menyetujui void).
create or replace function pos.admin_set_pin(p_employee uuid, p_pin text) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_role text;
begin
  select org_id, role into v_org, v_role from employees where id = p_employee;
  if v_org is null or not pos.can_manage(v_org) then
    raise exception 'no access';
  end if;
  if v_role = 'owner' and coalesce(pos.member_role(v_org), '') not in ('owner', 'admin') then
    raise exception 'no access';
  end if;
  perform pos.set_employee_pin(p_employee, p_pin);
end $$;
