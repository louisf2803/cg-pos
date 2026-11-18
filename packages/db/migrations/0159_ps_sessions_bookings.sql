-- CG POS · 0159_ps_sessions_bookings
-- Rental PS tahap server: sesi sewa dan booking disimpan di server supaya semua tablet kasir dan aplikasi karyawan melihat jadwal yang sama
-- (blok waktu seperti kalender). Tablet tetap bekerja offline memakai jam sendiri dan menyinkronkan saat online.
--  * Setiap catatan punya `rev` (naik tiap perubahan di klien); server hanya menerima rev yang lebih besar, jadi kiriman terlambat
--    dari tablet offline tidak menimpa data yang lebih baru. Id dibuat klien (idempoten).
--  * ps_session_upsert / ps_booking_upsert : tulis (anggota org; karyawan berperan kasir lewat aplikasi HP tidak boleh membuat/ubah booking).
--  * ps_board(outlet, dari, sampai)        : baca sesi dan booking dalam rentang waktu (dan menghanguskan booking belum lunas yang lewat batas).
-- Booking tidak boleh bertumpuk di station yang sama; booking tidak boleh menimpa sesi yang masih berjalan.
create table pos.ps_sessions (
  id uuid primary key,
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid not null,
  table_id uuid not null,
  customer_name text check (customer_name is null or char_length(customer_name) <= 60),
  pressed_at timestamptz not null,
  billable_start timestamptz not null,
  ends_at timestamptz not null,
  parts jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array' and jsonb_array_length(parts) <= 40),
  total numeric(18,0) not null default 0 check (total between 0 and 1000000000),
  paid boolean not null default false,
  status text not null default 'running' check (status in ('running', 'finished')),
  finished_at timestamptz,
  rev integer not null default 1,
  created_by uuid,
  updated_at timestamptz not null default now(),
  check (ends_at > billable_start or status = 'finished'),
  foreign key (outlet_id, org_id) references pos.outlets(id, org_id) on delete cascade,
  foreign key (table_id, org_id) references pos.tables(id, org_id) on delete cascade
);
create unique index ps_sessions_one_running on pos.ps_sessions (table_id) where status = 'running';
create index ps_sessions_outlet_time on pos.ps_sessions (outlet_id, billable_start);

create table pos.ps_bookings (
  id uuid primary key,
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid not null,
  table_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  phone text check (phone is null or char_length(phone) <= 30),
  start_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  label text not null default '' check (char_length(label) <= 60),
  price numeric(18,0) not null default 0 check (price between 0 and 1000000000),
  paid boolean not null default false,
  status text not null default 'active' check (status in ('active', 'cancelled', 'started', 'expired')),
  expires_at timestamptz not null,
  created_by uuid,
  created_by_name text check (created_by_name is null or char_length(created_by_name) <= 60),
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references pos.outlets(id, org_id) on delete cascade,
  foreign key (table_id, org_id) references pos.tables(id, org_id) on delete cascade
);
create index ps_bookings_outlet_time on pos.ps_bookings (outlet_id, start_at);

do $$
declare t text;
begin
  foreach t in array array['ps_sessions', 'ps_bookings'] loop
    execute format('alter table pos.%I enable row level security', t);
    execute format('create policy sel on pos.%I for select to authenticated using (org_id in (select pos.user_org_ids()))', t);
    execute format('revoke all on pos.%I from anon', t);
    execute format('revoke insert, update, delete on pos.%I from authenticated', t);
    execute format('grant select on pos.%I to authenticated', t);
    execute format('grant all on pos.%I to service_role', t);
  end loop;
end $$;

-- boleh menulis? anggota org (bukan akun perangkat); karyawan tertaut berperan kasir/dapur/gudang tidak boleh mengubah booking dari aplikasi HP
create or replace function pos._ps_writer_ok(p_org uuid, p_booking boolean) returns boolean
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare v_role text;
begin
  if auth.uid() is null or p_org not in (select pos.user_org_ids()) then return false; end if;
  if p_booking then
    select e.role into v_role from pos.employees e where e.user_id = auth.uid() and e.org_id = p_org and e.deleted_at is null and e.is_active limit 1;
    if v_role is not null and v_role not in ('owner', 'manager') then return false; end if;
  end if;
  return true;
end $$;

create or replace function pos._ps_expire(p_outlet uuid) returns void
language sql security definer set search_path = pos, extensions, pg_temp as $$
  update pos.ps_bookings set status = 'expired', rev = rev + 1, updated_at = now()
   where outlet_id = p_outlet and status = 'active' and not paid and expires_at < now() $$;

create or replace function pos.ps_session_upsert(p_outlet uuid, p_row jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_id uuid := (p_row->>'id')::uuid; v_table uuid := (p_row->>'table_id')::uuid; v_rev int := coalesce((p_row->>'rev')::int, 1); cur pos.ps_sessions%rowtype;
  v_start timestamptz := (p_row->>'billable_start')::timestamptz; v_end timestamptz := (p_row->>'ends_at')::timestamptz; v_status text := coalesce(p_row->>'status', 'running');
begin
  select org_id into v_org from pos.outlets where id = p_outlet;
  if v_org is null then raise exception 'outlet not found'; end if;
  if not pos._ps_writer_ok(v_org, false) then raise exception 'not allowed'; end if;
  if not exists (select 1 from pos.ps_stations s where s.table_id = v_table and s.outlet_id = p_outlet) then raise exception 'station not found'; end if;
  select * into cur from pos.ps_sessions where id = v_id;
  if found then
    if cur.outlet_id <> p_outlet or cur.table_id <> v_table then raise exception 'station not found'; end if;
    if cur.rev >= v_rev then return jsonb_build_object('accepted', false, 'rev', cur.rev); end if;
    update pos.ps_sessions set customer_name = nullif(btrim(coalesce(p_row->>'customer_name', '')), ''), billable_start = v_start, ends_at = v_end,
      parts = coalesce(p_row->'parts', '[]'::jsonb), total = coalesce((p_row->>'total')::numeric, 0), paid = coalesce((p_row->>'paid')::boolean, false),
      status = v_status, finished_at = (p_row->>'finished_at')::timestamptz, rev = v_rev, updated_at = now() where id = v_id;
  else
    insert into pos.ps_sessions(id, org_id, outlet_id, table_id, customer_name, pressed_at, billable_start, ends_at, parts, total, paid, status, finished_at, rev, created_by)
    values (v_id, v_org, p_outlet, v_table, nullif(btrim(coalesce(p_row->>'customer_name', '')), ''), (p_row->>'pressed_at')::timestamptz, v_start, v_end,
      coalesce(p_row->'parts', '[]'::jsonb), coalesce((p_row->>'total')::numeric, 0), coalesce((p_row->>'paid')::boolean, false), v_status, (p_row->>'finished_at')::timestamptz, v_rev, auth.uid());
  end if;
  -- booking yang sudah berjalan atau mulai dalam 15 menit di station ini dianggap terpakai oleh sesi ini
  if v_status = 'running' then
    update pos.ps_bookings set status = 'started', rev = rev + 1, updated_at = now()
     where table_id = v_table and status = 'active' and start_at <= v_start + interval '15 minutes' and start_at + make_interval(mins => duration_minutes) > v_start;
  end if;
  return jsonb_build_object('accepted', true, 'rev', v_rev);
exception when unique_violation then
  raise exception 'station busy';
end $$;

create or replace function pos.ps_booking_upsert(p_outlet uuid, p_row jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_id uuid := (p_row->>'id')::uuid; v_table uuid := (p_row->>'table_id')::uuid; v_rev int := coalesce((p_row->>'rev')::int, 1);
  v_start timestamptz := (p_row->>'start_at')::timestamptz; v_dur int := (p_row->>'duration_minutes')::int; v_status text := coalesce(p_row->>'status', 'active');
  cur pos.ps_bookings%rowtype; v_name text; v_exists boolean;
begin
  select org_id into v_org from pos.outlets where id = p_outlet;
  if v_org is null then raise exception 'outlet not found'; end if;
  if not pos._ps_writer_ok(v_org, true) then raise exception 'not allowed'; end if;
  if not exists (select 1 from pos.ps_stations s where s.table_id = v_table and s.outlet_id = p_outlet and not s.is_maintenance) then raise exception 'station not found'; end if;
  select * into cur from pos.ps_bookings where id = v_id;
  v_exists := found;
  if v_exists and (cur.outlet_id <> p_outlet or cur.table_id <> v_table) then raise exception 'station not found'; end if;
  if v_exists and cur.rev >= v_rev then return jsonb_build_object('accepted', false, 'rev', cur.rev); end if;
  if v_status = 'active' then
    if exists (select 1 from pos.ps_bookings b where b.table_id = v_table and b.status = 'active' and b.id <> v_id
               and b.start_at < v_start + make_interval(mins => v_dur) and v_start < b.start_at + make_interval(mins => b.duration_minutes)) then
      raise exception 'booking clash';
    end if;
    if exists (select 1 from pos.ps_sessions s where s.table_id = v_table and s.status = 'running' and s.ends_at > v_start and s.billable_start < v_start + make_interval(mins => v_dur)) then
      raise exception 'station busy';
    end if;
  end if;
  select e.name into v_name from pos.employees e where e.user_id = auth.uid() and e.org_id = v_org and e.deleted_at is null limit 1;
  if v_exists then
    update pos.ps_bookings set name = btrim(p_row->>'name'), phone = nullif(btrim(coalesce(p_row->>'phone', '')), ''), start_at = v_start, duration_minutes = v_dur,
      label = coalesce(p_row->>'label', ''), price = coalesce((p_row->>'price')::numeric, 0), paid = coalesce((p_row->>'paid')::boolean, false), status = v_status,
      expires_at = (p_row->>'expires_at')::timestamptz, rev = v_rev, updated_at = now() where id = v_id;
  else
    insert into pos.ps_bookings(id, org_id, outlet_id, table_id, name, phone, start_at, duration_minutes, label, price, paid, status, expires_at, created_by, created_by_name, rev)
    values (v_id, v_org, p_outlet, v_table, btrim(p_row->>'name'), nullif(btrim(coalesce(p_row->>'phone', '')), ''), v_start, v_dur, coalesce(p_row->>'label', ''),
      coalesce((p_row->>'price')::numeric, 0), coalesce((p_row->>'paid')::boolean, false), v_status, (p_row->>'expires_at')::timestamptz, auth.uid(), v_name, v_rev);
  end if;
  return jsonb_build_object('accepted', true, 'rev', v_rev);
end $$;

-- Sesi dan booking dalam rentang waktu untuk satu outlet (booking belum lunas yang lewat batas dihanguskan dulu). Dibaca semua anggota org.
create or replace function pos.ps_board(p_outlet uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid;
begin
  select org_id into v_org from pos.outlets where id = p_outlet;
  if v_org is null or v_org not in (select pos.user_org_ids()) then raise exception 'not allowed'; end if;
  if p_to < p_from or p_to - p_from > interval '8 days' then raise exception 'invalid range'; end if;
  perform pos._ps_expire(p_outlet);
  return jsonb_build_object(
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'table_id', s.table_id, 'customer_name', s.customer_name, 'pressed_at', s.pressed_at, 'billable_start', s.billable_start,
        'ends_at', s.ends_at, 'parts', s.parts, 'total', s.total, 'paid', s.paid, 'status', s.status, 'finished_at', s.finished_at, 'rev', s.rev) order by s.billable_start)
      from pos.ps_sessions s where s.outlet_id = p_outlet and (s.status = 'running' or (s.billable_start < p_to and coalesce(s.finished_at, s.ends_at) > p_from))), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'table_id', b.table_id, 'name', b.name, 'phone', b.phone, 'start_at', b.start_at, 'duration_minutes', b.duration_minutes,
        'label', b.label, 'price', b.price, 'paid', b.paid, 'status', b.status, 'expires_at', b.expires_at, 'created_by_name', b.created_by_name, 'created_at', b.created_at, 'rev', b.rev) order by b.start_at)
      from pos.ps_bookings b where b.outlet_id = p_outlet and b.status in ('active', 'started') and b.start_at < p_to and b.start_at + make_interval(mins => b.duration_minutes) > p_from), '[]'::jsonb),
    'server_now', now());
end $$;

revoke all on function pos._ps_writer_ok(uuid, boolean), pos._ps_expire(uuid) from public, anon, authenticated;
revoke all on function pos.ps_session_upsert(uuid, jsonb), pos.ps_booking_upsert(uuid, jsonb), pos.ps_board(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function pos.ps_session_upsert(uuid, jsonb), pos.ps_booking_upsert(uuid, jsonb), pos.ps_board(uuid, timestamptz, timestamptz) to authenticated, service_role;
