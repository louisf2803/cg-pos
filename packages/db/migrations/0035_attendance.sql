-- CG POS · 0035_attendance
-- Absensi karyawan: clock in / clock out dari POS (pilih karyawan, PIN, selfie opsional) dan koreksi oleh pemilik/manajer.
-- Waktu SELALU dari server (now()), bukan dari perangkat, supaya jam tidak bisa dimanipulasi dari klien.
-- Klien tidak boleh menulis tabel langsung: semua perubahan lewat fungsi di bawah. Satu karyawan hanya boleh punya
-- satu catatan terbuka (belum clock out). photo_path = jalur objek di bucket privat 'attendance-photos' (lihat 0036),
-- wajib diawali id org supaya tidak bisa menunjuk berkas org lain.
create table pos.attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid not null,
  employee_id uuid not null,
  device_id uuid references pos.devices(id) on delete set null,
  clock_in_at timestamptz not null default now(),
  clock_in_photo_path text check (clock_in_photo_path is null or char_length(clock_in_photo_path) <= 300),
  clock_out_at timestamptz,
  clock_out_photo_path text check (clock_out_photo_path is null or char_length(clock_out_photo_path) <= 300),
  note text check (note is null or char_length(note) <= 300),
  edited_by uuid,
  sync_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references pos.outlets(id, org_id),
  foreign key (employee_id, org_id) references pos.employees(id, org_id),
  check (clock_out_at is null or clock_out_at >= clock_in_at),
  unique (id, org_id)
);
create unique index attendance_one_open on pos.attendance (employee_id) where clock_out_at is null;
create index attendance_org_in on pos.attendance (org_id, clock_in_at desc);
create index attendance_emp_in on pos.attendance (employee_id, clock_in_at desc);

alter table pos.attendance enable row level security;
create policy sel on pos.attendance for select to authenticated using (org_id in (select pos.user_org_ids()));
revoke all on pos.attendance from anon;
revoke insert, update, delete on pos.attendance from authenticated;
grant select on pos.attendance to authenticated;

create trigger trg_touch_attendance before update on pos.attendance for each row execute function pos.touch_updated_at();
create trigger trg_seq_attendance before insert or update on pos.attendance for each row execute function pos.set_sync_seq();
create trigger trg_log_attendance after insert or update or delete on pos.attendance for each row execute function pos.log_change('attendance');

-- jalur foto harus di dalam folder org perangkat dan tidak boleh naik folder
create or replace function pos._attendance_photo_ok(p_org uuid, p_path text) returns boolean
language sql immutable set search_path = pos, extensions, pg_temp as $$
  select p_path is null or (p_path like p_org::text || '/%' and p_path not like '%..%' and char_length(p_path) <= 300)
$$;

create or replace function pos.attendance_clock_in(p_device uuid, p_employee uuid, p_pin text, p_photo_path text default null) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare d devices%rowtype; v_id uuid; v_at timestamptz := now();
begin
  select * into d from devices where id = p_device and is_active;
  if not found then raise exception 'device not found'; end if;
  if auth.uid() is null or d.user_id is distinct from auth.uid() then raise exception 'not your device'; end if;
  if not pos._attendance_photo_ok(d.org_id, p_photo_path) then raise exception 'invalid photo path'; end if;
  if not exists (select 1 from employee_outlets eo where eo.employee_id = p_employee and eo.outlet_id = d.outlet_id and eo.org_id = d.org_id) then
    raise exception 'employee not at this outlet';
  end if;
  if not pos.verify_employee_pin(p_employee, p_pin) then raise exception 'invalid pin'; end if;
  if exists (select 1 from attendance where employee_id = p_employee and clock_out_at is null) then raise exception 'already clocked in'; end if;
  insert into attendance(org_id, outlet_id, employee_id, device_id, clock_in_at, clock_in_photo_path)
  values (d.org_id, d.outlet_id, p_employee, d.id, v_at, p_photo_path) returning id into v_id;
  return jsonb_build_object('id', v_id, 'clock_in_at', v_at);
end $$;

create or replace function pos.attendance_clock_out(p_device uuid, p_employee uuid, p_pin text, p_photo_path text default null) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare d devices%rowtype; a attendance%rowtype; v_at timestamptz := now();
begin
  select * into d from devices where id = p_device and is_active;
  if not found then raise exception 'device not found'; end if;
  if auth.uid() is null or d.user_id is distinct from auth.uid() then raise exception 'not your device'; end if;
  if not pos._attendance_photo_ok(d.org_id, p_photo_path) then raise exception 'invalid photo path'; end if;
  if not exists (select 1 from employee_outlets eo where eo.employee_id = p_employee and eo.outlet_id = d.outlet_id and eo.org_id = d.org_id) then
    raise exception 'employee not at this outlet';
  end if;
  if not pos.verify_employee_pin(p_employee, p_pin) then raise exception 'invalid pin'; end if;
  select * into a from attendance where employee_id = p_employee and org_id = d.org_id and clock_out_at is null for update;
  if not found then raise exception 'not clocked in'; end if;
  update attendance set clock_out_at = greatest(v_at, a.clock_in_at), clock_out_photo_path = p_photo_path where id = a.id;
  return jsonb_build_object('id', a.id, 'clock_in_at', a.clock_in_at, 'clock_out_at', greatest(v_at, a.clock_in_at));
end $$;

-- Akun perangkat tidak boleh membaca tabel langsung (user_org_ids mengecualikan role device), jadi POS menanyakan
-- siapa yang sedang clock in di outlet perangkatnya lewat fungsi ini.
create or replace function pos.attendance_status(p_device uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare d devices%rowtype;
begin
  select * into d from devices where id = p_device and is_active;
  if not found then raise exception 'device not found'; end if;
  if auth.uid() is null or d.user_id is distinct from auth.uid() then raise exception 'not your device'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('employee_id', employee_id, 'clock_in_at', clock_in_at) order by clock_in_at)
                     from attendance where org_id = d.org_id and outlet_id = d.outlet_id and clock_out_at is null), '[]'::jsonb);
end $$;

-- Koreksi/tambah catatan oleh pemilik atau manajer (lupa clock out, salah jam). Tidak memakai PIN karyawan.
create or replace function pos.attendance_admin_save(p_id uuid, p_org uuid, p_employee uuid, p_outlet uuid,
  p_clock_in timestamptz, p_clock_out timestamptz, p_note text) returns uuid
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_id uuid;
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if p_clock_in is null then raise exception 'clock in required'; end if;
  if p_clock_out is not null and p_clock_out < p_clock_in then raise exception 'clock out before clock in'; end if;
  if p_clock_in > now() + interval '5 minutes' or (p_clock_out is not null and p_clock_out > now() + interval '5 minutes') then
    raise exception 'time in the future';
  end if;
  if not exists (select 1 from employees where id = p_employee and org_id = p_org and deleted_at is null) then raise exception 'employee not found'; end if;
  if not exists (select 1 from outlets where id = p_outlet and org_id = p_org) then raise exception 'outlet not found'; end if;
  if p_id is not null then
    update attendance set employee_id = p_employee, outlet_id = p_outlet, clock_in_at = p_clock_in, clock_out_at = p_clock_out,
           note = nullif(left(btrim(coalesce(p_note, '')), 300), ''), edited_by = auth.uid()
     where id = p_id and org_id = p_org returning id into v_id;
    if v_id is null then raise exception 'attendance not found'; end if;
  else
    insert into attendance(org_id, outlet_id, employee_id, clock_in_at, clock_out_at, note, edited_by)
    values (p_org, p_outlet, p_employee, p_clock_in, p_clock_out, nullif(left(btrim(coalesce(p_note, '')), 300), ''), auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function pos.attendance_admin_delete(p_id uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid;
begin
  select org_id into v_org from attendance where id = p_id;
  if v_org is null then raise exception 'attendance not found'; end if;
  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  delete from attendance where id = p_id;
end $$;

revoke all on function pos._attendance_photo_ok(uuid, text) from public, anon;
revoke all on function pos.attendance_clock_in(uuid, uuid, text, text), pos.attendance_clock_out(uuid, uuid, text, text), pos.attendance_status(uuid),
  pos.attendance_admin_save(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text), pos.attendance_admin_delete(uuid) from public, anon;
grant execute on function pos.attendance_clock_in(uuid, uuid, text, text), pos.attendance_clock_out(uuid, uuid, text, text), pos.attendance_status(uuid),
  pos.attendance_admin_save(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text), pos.attendance_admin_delete(uuid) to authenticated, service_role;
