-- CG POS · 0038_hr_structure
-- Struktur SDM: tingkat jabatan, organisasi (unit/divisi), tipe karyawan, profil SDM per karyawan, pengaturan lokasi absensi per outlet
-- (radius), dan notifikasi ke karyawan. Semua HANYA untuk pemilik/manajer (pos.can_manage), sama seperti payroll.
-- Quick PIN tidak dibuat: keputusan Louis 12 Nov 2026, samakan saja dengan PIN karyawan yang sudah ada.

create table pos.job_levels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  rank smallint not null default 0 check (rank between 0 and 99),   -- makin besar makin tinggi
  created_at timestamptz not null default now(),
  unique (org_id, id)
);
create unique index job_levels_name on pos.job_levels (org_id, lower(btrim(name)));

create table pos.org_units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  parent_id uuid,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, parent_id) references pos.org_units(org_id, id) on delete set null (parent_id),
  check (parent_id is null or parent_id <> id)
);
create unique index org_units_name on pos.org_units (org_id, lower(btrim(name)));

create table pos.employee_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (org_id, id)
);
create unique index employee_types_name on pos.employee_types (org_id, lower(btrim(name)));

-- Profil SDM per karyawan; menghapus jabatan/unit/tipe hanya melepas tautan.
create table pos.employee_hr (
  employee_id uuid primary key,
  org_id uuid not null references pos.orgs(id) on delete cascade,
  job_level_id uuid,
  org_unit_id uuid,
  employee_type_id uuid,
  updated_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references pos.employees(id, org_id) on delete cascade,
  foreign key (org_id, job_level_id) references pos.job_levels(org_id, id) on delete set null (job_level_id),
  foreign key (org_id, org_unit_id) references pos.org_units(org_id, id) on delete set null (org_unit_id),
  foreign key (org_id, employee_type_id) references pos.employee_types(org_id, id) on delete set null (employee_type_id)
);

-- Lokasi dan radius absensi per outlet. mode: 'flag' = absen di luar radius tetap diterima tetapi ditandai; 'block' = ditolak.
-- Keputusan Louis 12 Nov 2026: di luar radius DIBLOKIR (bawaan 'block'). Penegakan di pos.attendance_clock_in menyusul di migrasi berikutnya; tabel ini hanya menyimpan pengaturan.
create table pos.attendance_settings (
  outlet_id uuid primary key,
  org_id uuid not null references pos.orgs(id) on delete cascade,
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  radius_m integer check (radius_m between 10 and 5000),
  mode text not null default 'block' check (mode in ('flag', 'block')),
  require_photo boolean not null default true,
  updated_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references pos.outlets(id, org_id) on delete cascade,
  check ((latitude is null) = (longitude is null) and (radius_m is null or latitude is not null))
);

-- Notifikasi dari pengelola ke karyawan (employee_id kosong = semua karyawan).
create table pos.employee_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  employee_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null check (char_length(body) between 1 and 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references pos.employees(id, org_id) on delete cascade
);
create index employee_notifications_org on pos.employee_notifications (org_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['job_levels', 'org_units', 'employee_types', 'employee_hr', 'attendance_settings', 'employee_notifications'] loop
    execute format('alter table pos.%I enable row level security', t);
    execute format('create policy sel on pos.%I for select to authenticated using (pos.can_manage(org_id))', t);
    execute format('create policy ins on pos.%I for insert to authenticated with check (pos.can_manage(org_id))', t);
    execute format('create policy upd on pos.%I for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id))', t);
    execute format('create policy del on pos.%I for delete to authenticated using (pos.can_manage(org_id))', t);
    execute format('revoke all on pos.%I from anon', t);
    execute format('grant select, insert, update, delete on pos.%I to authenticated', t);
  end loop;
end $$;
create trigger trg_touch_employee_hr before update on pos.employee_hr for each row execute function pos.touch_updated_at();
create trigger trg_touch_attendance_settings before update on pos.attendance_settings for each row execute function pos.touch_updated_at();
