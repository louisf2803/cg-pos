-- CG POS · 0156_staff_account_create
-- Dashboard membuat akun login karyawan (username + kata sandi) lewat Edge Function staff-create-account, yang membuat pengguna Supabase Auth
-- dengan kunci service lalu menautkannya (staff_account_link, 0153). Fungsi ini hanya memeriksa izin pemanggil SEBELUM akun dibuat:
-- harus pengelola org karyawan itu; mengembalikan id pengguna yang sudah tertaut (untuk ganti kata sandi) atau null (buat akun baru).
create or replace function pos.staff_account_check(p_employee uuid) returns uuid
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare e pos.employees%rowtype;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select * into e from pos.employees where id = p_employee and deleted_at is null;
  if not found then raise exception 'employee not found'; end if;
  if not pos.can_manage(e.org_id) then raise exception 'not allowed'; end if;
  if e.role = 'owner' and not pos.is_org_admin(e.org_id) then raise exception 'not allowed'; end if;
  return e.user_id;
end $$;
revoke all on function pos.staff_account_check(uuid) from public, anon;
grant execute on function pos.staff_account_check(uuid) to authenticated, service_role;
