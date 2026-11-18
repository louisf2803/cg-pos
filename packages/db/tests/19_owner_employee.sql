-- Pemilik tampil sebagai karyawan (migrasi 0161) dan jabatan Owner/Finance tersedia otomatis.
do $$
declare o1 uuid := ctx('o1'); u_own uuid := gen_random_uuid(); new_org uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); n int;
begin
  if not exists (select 1 from job_levels where org_id = o1 and lower(name) = 'owner') or not exists (select 1 from job_levels where org_id = o1 and lower(name) = 'finance') then
    raise exception 'ASSERT GAGAL: jabatan Owner dan Finance ada untuk org yang sudah ada'; end if;

  insert into auth.users(id, email) values (u_own, 'louis.pemilik@x');
  insert into org_members(org_id, user_id, role) values (o1, u_own, 'owner');
  select count(*) into n from employees where org_id = o1 and user_id = u_own and role = 'owner' and deleted_at is null;
  if n <> 1 then raise exception 'ASSERT GAGAL: pemilik baru otomatis punya satu baris karyawan, dapat %', n; end if;
  if (select name from employees where org_id = o1 and user_id = u_own) <> 'Louis.Pemilik' then raise exception 'ASSERT GAGAL: nama awal dari email'; end if;
  if not exists (select 1 from employee_hr h join employees e on e.id = h.employee_id join job_levels j on j.id = h.job_level_id where e.user_id = u_own and lower(j.name) = 'owner') then
    raise exception 'ASSERT GAGAL: pemilik tertaut jabatan Owner'; end if;
  -- idempoten: memicu ulang tidak menggandakan
  update org_members set role = 'owner' where org_id = o1 and user_id = u_own;
  select count(*) into n from employees where org_id = o1 and user_id = u_own;
  if n <> 1 then raise exception 'ASSERT GAGAL: tidak ganda, dapat %', n; end if;

  insert into orgs(id, name) values (new_org, 'Org Jabatan Baru');
  if (select count(*) from job_levels where org_id = new_org) <> 2 then raise exception 'ASSERT GAGAL: org baru dapat dua jabatan dasar'; end if;
  insert into auth.users(id, email) values (u2, 'x2@x');
  delete from orgs where id = new_org;

  delete from employee_hr where employee_id in (select id from employees where user_id = u_own);
  delete from employees where user_id = u_own;
  delete from org_members where user_id = u_own;
end $$;
