-- CG POS · 0149_hr_profile_collective_leave
-- Dari aplikasi BackendCoffeeGround (modul pegawai) ke dashboard CG POS:
--  * cuti bersama: tanggal libur yang dipotongkan dari jatah cuti/absen tahunan semua karyawan (dipakai di payroll);
--  * profil kepegawaian: data diri, tanggal bergabung, tipe pekerjaan, dan rekening bank untuk transfer gaji.
-- Keduanya HANYA untuk pemilik/manajer (pos.can_manage), sama seperti payroll dan struktur SDM (0038). Data pribadi tidak terbaca kasir.

create table pos.collective_leaves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  leave_date date not null,
  description text not null check (char_length(btrim(description)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (org_id, leave_date)
);
create index collective_leaves_org_date on pos.collective_leaves (org_id, leave_date);

create table pos.employee_profiles (
  employee_id uuid primary key,
  org_id uuid not null references pos.orgs(id) on delete cascade,
  nik text check (nik is null or char_length(nik) between 6 and 32),
  phone text check (phone is null or char_length(phone) between 5 and 24),
  email text check (email is null or char_length(email) between 3 and 120),
  address text check (address is null or char_length(address) <= 300),
  join_date date,
  employment_type text check (employment_type in ('full_time', 'part_time', 'contract')),
  bank_name text check (bank_name is null or char_length(bank_name) between 2 and 60),
  bank_account_number text check (bank_account_number is null or char_length(bank_account_number) between 4 and 32),
  bank_account_holder text check (bank_account_holder is null or char_length(bank_account_holder) between 2 and 80),
  updated_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references pos.employees(id, org_id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['collective_leaves', 'employee_profiles'] loop
    execute format('alter table pos.%I enable row level security', t);
    execute format('create policy sel on pos.%I for select to authenticated using (pos.can_manage(org_id))', t);
    execute format('create policy ins on pos.%I for insert to authenticated with check (pos.can_manage(org_id))', t);
    execute format('create policy upd on pos.%I for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id))', t);
    execute format('create policy del on pos.%I for delete to authenticated using (pos.can_manage(org_id))', t);
    execute format('revoke all on pos.%I from anon', t);
    execute format('grant select, insert, update, delete on pos.%I to authenticated', t);
  end loop;
end $$;
create trigger trg_touch_employee_profiles before update on pos.employee_profiles for each row execute function pos.touch_updated_at();
