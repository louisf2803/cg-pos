-- CG POS · 0039_attendance_radius
-- Penegakan radius absensi (keputusan Louis 12 Nov 2026): perangkat mengirim lokasi GPS saat clock in; bila outlet punya radius
-- (pos.attendance_settings, 0038) dan mode 'block', absen di luar radius DITOLAK, dan lokasi wajib dikirim. Mode 'flag' menerima
-- tetapi jarak tetap tercatat. Tanpa pengaturan radius, perilaku tidak berubah. Jarak dihitung server (haversine, meter).
-- Catatan: lokasi dikirim klien, jadi ini pembatas kelalaian, bukan pencegah pemalsuan lokasi yang disengaja.

alter table pos.attendance
  add column clock_in_lat numeric(9,6) check (clock_in_lat is null or clock_in_lat between -90 and 90),
  add column clock_in_lng numeric(9,6) check (clock_in_lng is null or clock_in_lng between -180 and 180),
  add column clock_in_distance_m integer check (clock_in_distance_m is null or clock_in_distance_m >= 0);

-- Jarak dua titik di bumi dalam meter (bulat).
create or replace function pos._distance_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) returns integer
language sql immutable set search_path = pos, pg_temp as $$
  select round(2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians((lat2 - lat1)::float8) / 2), 2) +
    cos(radians(lat1::float8)) * cos(radians(lat2::float8)) * power(sin(radians((lng2 - lng1)::float8) / 2), 2)
  ))))::integer
$$;

drop function pos.attendance_clock_in(uuid, uuid, text, text);
create or replace function pos.attendance_clock_in(p_device uuid, p_employee uuid, p_pin text, p_photo_path text default null,
  p_lat numeric default null, p_lng numeric default null) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare d devices%rowtype; v_id uuid; v_at timestamptz := now(); s attendance_settings%rowtype; v_dist integer;
begin
  select * into d from devices where id = p_device and is_active;
  if not found then raise exception 'device not found'; end if;
  if auth.uid() is null or d.user_id is distinct from auth.uid() then raise exception 'not your device'; end if;
  if not pos._attendance_photo_ok(d.org_id, p_photo_path) then raise exception 'invalid photo path'; end if;
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid location'; end if;
  if not exists (select 1 from employee_outlets eo where eo.employee_id = p_employee and eo.outlet_id = d.outlet_id and eo.org_id = d.org_id) then
    raise exception 'employee not at this outlet';
  end if;
  if not pos.verify_employee_pin(p_employee, p_pin) then raise exception 'invalid pin'; end if;
  if exists (select 1 from attendance where employee_id = p_employee and clock_out_at is null) then raise exception 'already clocked in'; end if;
  select * into s from attendance_settings where outlet_id = d.outlet_id and org_id = d.org_id;
  if found and s.radius_m is not null then
    if p_lat is null then
      if s.mode = 'block' then raise exception 'location required'; end if;
    else
      v_dist := pos._distance_m(s.latitude, s.longitude, p_lat, p_lng);
      if s.mode = 'block' and v_dist > s.radius_m then raise exception 'outside radius'; end if;
    end if;
  end if;
  insert into attendance(org_id, outlet_id, employee_id, device_id, clock_in_at, clock_in_photo_path, clock_in_lat, clock_in_lng, clock_in_distance_m)
  values (d.org_id, d.outlet_id, p_employee, d.id, v_at, p_photo_path, p_lat, p_lng, v_dist) returning id into v_id;
  return jsonb_build_object('id', v_id, 'clock_in_at', v_at, 'distance_m', v_dist);
end $$;

revoke all on function pos._distance_m(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function pos._distance_m(numeric, numeric, numeric, numeric) to authenticated, service_role;
revoke all on function pos.attendance_clock_in(uuid, uuid, text, text, numeric, numeric) from public, anon;
grant execute on function pos.attendance_clock_in(uuid, uuid, text, text, numeric, numeric) to authenticated, service_role;
