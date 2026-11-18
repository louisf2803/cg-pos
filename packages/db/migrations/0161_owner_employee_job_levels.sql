-- CG POS · 0161_owner_employee_job_levels
-- Pemilik ikut tampil di daftar karyawan (peran owner), dan jabatan Owner serta Finance tersedia otomatis.
--  * Jabatan "Owner" (tingkat 90) dan "Finance" (tingkat 60) ditanam untuk semua org (dan org baru).
--  * Tiap anggota org berperan owner punya satu baris karyawan (role owner, tertaut user_id, tanpa outlet = semua outlet) yang tertaut jabatan Owner.
-- Aditif: tidak mengubah data yang ada selain menambah baris yang belum ada.
create or replace function pos._seed_base_job_levels(p_org uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  insert into pos.job_levels(org_id, name, rank)
  select p_org, v.name, v.rank from (values ('Owner', 90), ('Finance', 60)) v(name, rank)
  where not exists (select 1 from pos.job_levels j where j.org_id = p_org and lower(btrim(j.name)) = lower(v.name));
end $$;
revoke all on function pos._seed_base_job_levels(uuid) from public, anon, authenticated;

create or replace function pos._ensure_owner_employee(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_emp uuid; v_name text; v_job uuid;
begin
  perform pos._seed_base_job_levels(p_org);
  select id into v_emp from pos.employees where org_id = p_org and user_id = p_user and deleted_at is null order by created_at limit 1;
  if v_emp is null then
    select coalesce(nullif(btrim(initcap(split_part(u.email, '@', 1))), ''), 'Pemilik') into v_name from auth.users u where u.id = p_user;
    v_name := coalesce(v_name, 'Pemilik');
    insert into pos.employees(org_id, user_id, name, role) values (p_org, p_user, v_name, 'owner') returning id into v_emp;
  end if;
  select id into v_job from pos.job_levels where org_id = p_org and lower(btrim(name)) = 'owner';
  insert into pos.employee_hr(employee_id, org_id, job_level_id) values (v_emp, p_org, v_job) on conflict (employee_id) do nothing;
end $$;
revoke all on function pos._ensure_owner_employee(uuid, uuid) from public, anon, authenticated;

create or replace function pos._org_members_owner_employee() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  if new.role = 'owner' then perform pos._ensure_owner_employee(new.org_id, new.user_id); end if;
  return new;
end $$;
revoke all on function pos._org_members_owner_employee() from public, anon, authenticated;
drop trigger if exists trg_org_members_owner_employee on pos.org_members;
create trigger trg_org_members_owner_employee after insert or update of role on pos.org_members
  for each row execute function pos._org_members_owner_employee();

create or replace function pos._orgs_seed_job_levels() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin perform pos._seed_base_job_levels(new.id); return new; end $$;
revoke all on function pos._orgs_seed_job_levels() from public, anon, authenticated;
drop trigger if exists trg_orgs_seed_job_levels on pos.orgs;
create trigger trg_orgs_seed_job_levels after insert on pos.orgs for each row execute function pos._orgs_seed_job_levels();

-- isi awal untuk org dan pemilik yang sudah ada
select pos._seed_base_job_levels(id) from pos.orgs;
select pos._ensure_owner_employee(m.org_id, m.user_id) from pos.org_members m where m.role = 'owner';
