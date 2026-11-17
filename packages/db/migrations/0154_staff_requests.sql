-- CG POS · 0154_staff_requests
-- Aplikasi HP karyawan fase 2: pengajuan cuti/izin, kasbon, dan tukar shift beserta persetujuannya, jadwal sendiri, dan slip gaji sendiri.
-- Keputusan Louis: cuti H-2 (sakit boleh hari ini atau kemarin, tanpa surat), maksimal 2 orang cuti per hari, disetujui PEMILIK;
-- kasbon tanpa batas nominal, hanya satu yang aktif (tidak ada pengajuan menunggu dan saldo 0), disetujui PEMILIK dengan bukti transfer wajib;
-- tukar shift: rekan setuju dulu lalu manajer; bila pengaju manajer, cukup rekannya. Absen tetap hanya di tablet kasir.
-- Semua tulis lewat fungsi security definer; tabel hanya bisa dibaca langsung oleh pengelola (daftar karyawan lewat staff_requests()).
-- Efek persetujuan: cuti -> catatan EXCUSED (hari terjadwal), kasbon -> entri BORROW di cash_advances, tukar shift -> schedule_overrides.
-- BELUM: payroll belum membaca schedule_overrides (telat/absen tetap dari jadwal mingguan).

create table pos.schedule_overrides (
  employee_id uuid not null,
  org_id uuid not null references pos.orgs(id) on delete cascade,
  work_date date not null,
  start_time time,                       -- null = libur pada tanggal itu
  swap_id uuid,
  created_at timestamptz not null default now(),
  primary key (employee_id, work_date),
  foreign key (employee_id, org_id) references pos.employees(id, org_id) on delete cascade
);

create table pos.leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  employee_id uuid not null,
  kind text not null check (kind in ('leave', 'sick', 'permit')),
  start_date date not null,
  end_date date not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid, decided_at timestamptz, decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 13),
  foreign key (employee_id, org_id) references pos.employees(id, org_id) on delete cascade
);
create index leave_requests_org on pos.leave_requests (org_id, status, start_date);

create table pos.advance_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  employee_id uuid not null,
  amount numeric(18,0) not null check (amount > 0 and amount <= 1000000000),
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  proof_path text,
  decided_by uuid, decided_at timestamptz, decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references pos.employees(id, org_id) on delete cascade
);
create index advance_requests_org on pos.advance_requests (org_id, status);
create unique index advance_requests_one_pending on pos.advance_requests (employee_id) where status = 'pending';

create table pos.shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  requester_id uuid not null,
  partner_id uuid not null,
  requester_date date not null,          -- hari kerja pengaju yang diserahkan ke rekan
  partner_date date not null,            -- hari kerja rekan yang diambil pengaju
  reason text check (reason is null or char_length(reason) <= 300),
  status text not null default 'pending_partner' check (status in ('pending_partner', 'pending_manager', 'approved', 'rejected', 'cancelled')),
  decided_by uuid, decided_at timestamptz, decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  check (requester_id <> partner_id and requester_date <> partner_date),
  foreign key (requester_id, org_id) references pos.employees(id, org_id) on delete cascade,
  foreign key (partner_id, org_id) references pos.employees(id, org_id) on delete cascade
);
create index shift_swap_requests_org on pos.shift_swap_requests (org_id, status);

do $$
declare t text;
begin
  foreach t in array array['schedule_overrides', 'leave_requests', 'advance_requests', 'shift_swap_requests'] loop
    execute format('alter table pos.%I enable row level security', t);
    execute format('create policy sel on pos.%I for select to authenticated using (pos.can_manage(org_id))', t);
    execute format('revoke all on pos.%I from anon', t);
    execute format('revoke insert, update, delete on pos.%I from authenticated', t);
    execute format('grant select on pos.%I to authenticated', t);
  end loop;
end $$;

-- karyawan untuk akun yang masuk
create or replace function pos._my_employee() returns pos.employees
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select e.* from pos.employees e where e.user_id = auth.uid() and e.deleted_at is null and e.is_active order by e.created_at limit 1 $$;

create or replace function pos._jakarta_today() returns date
language sql stable set search_path = pos, extensions, pg_temp as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

-- pesan dalam aplikasi: ke satu karyawan, atau ke semua karyawan berperan tertentu
create or replace function pos._notify(p_org uuid, p_employee uuid, p_title text, p_body text) returns void
language sql security definer set search_path = pos, extensions, pg_temp as $$
  insert into employee_notifications(org_id, employee_id, title, body) values (p_org, p_employee, left(p_title, 80), left(p_body, 500)) $$;

create or replace function pos._notify_role(p_org uuid, p_role text, p_title text, p_body text) returns void
language sql security definer set search_path = pos, extensions, pg_temp as $$
  insert into employee_notifications(org_id, employee_id, title, body)
  select p_org, e.id, left(p_title, 80), left(p_body, 500) from employees e where e.org_id = p_org and e.role = p_role and e.is_active and e.deleted_at is null $$;

-- jumlah orang lain yang cuti (menunggu/disetujui, bukan sakit) pada satu tanggal
create or replace function pos._leave_headcount(p_org uuid, p_date date, p_except uuid) returns int
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select count(distinct employee_id)::int from leave_requests
   where org_id = p_org and kind <> 'sick' and status in ('pending', 'approved') and p_date between start_date and end_date and employee_id <> p_except $$;

-- ===== CUTI / IZIN / SAKIT =====
create or replace function pos.leave_request_create(p_kind text, p_start date, p_end date, p_reason text) returns uuid
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare me pos.employees%rowtype; v_today date := pos._jakarta_today(); d date; v_id uuid;
begin
  me := pos._my_employee();
  if me.id is null then raise exception 'no access'; end if;
  if p_kind not in ('leave', 'sick', 'permit') then raise exception 'invalid kind'; end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 13 then raise exception 'invalid dates'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'reason required'; end if;
  if p_kind = 'sick' then
    if p_start < v_today - 1 or p_start > v_today + 1 then raise exception 'sick date window'; end if;
  elsif p_start < v_today + 2 then raise exception 'lead time'; end if;
  if exists (select 1 from leave_requests where employee_id = me.id and status in ('pending', 'approved') and daterange(start_date, end_date, '[]') && daterange(p_start, p_end, '[]')) then
    raise exception 'overlap';
  end if;
  if p_kind <> 'sick' then
    for d in select generate_series(p_start, p_end, interval '1 day')::date loop
      if pos._leave_headcount(me.org_id, d, me.id) >= 2 then raise exception 'day full %', d; end if;
    end loop;
  end if;
  insert into leave_requests(org_id, employee_id, kind, start_date, end_date, reason) values (me.org_id, me.id, p_kind, p_start, p_end, btrim(p_reason)) returning id into v_id;
  perform pos._notify_role(me.org_id, 'owner', 'Pengajuan izin baru', me.name || ' mengajukan ' || case p_kind when 'sick' then 'sakit' when 'permit' then 'izin' else 'cuti' end || ' ' || p_start::text || ' s.d. ' || p_end::text || '.');
  return v_id;
end $$;

create or replace function pos.leave_request_decide(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare r pos.leave_requests%rowtype; d date;
begin
  select * into r from leave_requests where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if not pos.is_org_admin(r.org_id) then raise exception 'not allowed'; end if;
  if r.status <> 'pending' then raise exception 'already decided'; end if;
  if p_approve and r.kind <> 'sick' then
    for d in select generate_series(r.start_date, r.end_date, interval '1 day')::date loop
      if (select count(distinct employee_id) from leave_requests where org_id = r.org_id and kind <> 'sick' and status = 'approved' and d between start_date and end_date and employee_id <> r.employee_id) >= 2 then
        raise exception 'day full %', d;
      end if;
    end loop;
  end if;
  update leave_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
  if p_approve then
    insert into employee_incidents(org_id, employee_id, incident_date, kind, count, notes, created_by)
    select r.org_id, r.employee_id, g::date, 'EXCUSED', 1, left('Disetujui lewat aplikasi (' || r.kind || ')', 300), auth.uid()
      from generate_series(r.start_date, r.end_date, interval '1 day') g
     where exists (select 1 from employee_schedules s where s.employee_id = r.employee_id and s.weekday = extract(dow from g)::int);
  end if;
  perform pos._notify(r.org_id, r.employee_id, case when p_approve then 'Izin disetujui' else 'Izin ditolak' end, 'Pengajuan ' || r.start_date::text || ' s.d. ' || r.end_date::text || case when p_approve then ' disetujui.' else ' ditolak.' end || coalesce(' Catatan: ' || nullif(btrim(coalesce(p_note, '')), ''), ''));
end $$;

create or replace function pos.leave_request_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare me pos.employees%rowtype;
begin
  me := pos._my_employee();
  update leave_requests set status = 'cancelled', decided_at = now() where id = p_id and employee_id = me.id and status = 'pending';
  if not found then raise exception 'not found'; end if;
end $$;

-- ===== KASBON =====
create or replace function pos.advance_request_create(p_amount numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare me pos.employees%rowtype; v_id uuid;
begin
  me := pos._my_employee();
  if me.id is null then raise exception 'no access'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 or p_amount <> trunc(p_amount) then raise exception 'invalid amount'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'reason required'; end if;
  if exists (select 1 from advance_requests where employee_id = me.id and status = 'pending') then raise exception 'pending exists'; end if;
  if pos._cash_advance_balance(me.org_id, me.id) > 0 then raise exception 'active advance'; end if;
  insert into advance_requests(org_id, employee_id, amount, reason) values (me.org_id, me.id, p_amount, btrim(p_reason)) returning id into v_id;
  perform pos._notify_role(me.org_id, 'owner', 'Pengajuan kasbon baru', me.name || ' mengajukan kasbon Rp ' || p_amount::bigint::text || '.');
  return v_id;
end $$;

create or replace function pos.advance_request_decide(p_id uuid, p_approve boolean, p_note text default null, p_proof_path text default null) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare r pos.advance_requests%rowtype;
begin
  select * into r from advance_requests where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if not pos.is_org_admin(r.org_id) then raise exception 'not allowed'; end if;
  if r.status <> 'pending' then raise exception 'already decided'; end if;
  if p_approve then
    if p_proof_path is null or split_part(p_proof_path, '/', 1) <> r.org_id::text then raise exception 'proof required'; end if;
    if pos._cash_advance_balance(r.org_id, r.employee_id) > 0 then raise exception 'active advance'; end if;
    insert into cash_advances(org_id, employee_id, kind, amount, entry_date, notes, created_by)
    values (r.org_id, r.employee_id, 'BORROW', r.amount, pos._jakarta_today(), 'Kasbon lewat aplikasi, bukti transfer terlampir', auth.uid());
  end if;
  update advance_requests set status = case when p_approve then 'approved' else 'rejected' end, proof_path = case when p_approve then p_proof_path end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
  perform pos._notify(r.org_id, r.employee_id, case when p_approve then 'Kasbon disetujui' else 'Kasbon ditolak' end,
    'Kasbon Rp ' || r.amount::bigint::text || case when p_approve then ' disetujui dan sudah ditransfer.' else ' ditolak.' end || coalesce(' Catatan: ' || nullif(btrim(coalesce(p_note, '')), ''), ''));
end $$;

create or replace function pos.advance_request_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare me pos.employees%rowtype;
begin
  me := pos._my_employee();
  update advance_requests set status = 'cancelled', decided_at = now() where id = p_id and employee_id = me.id and status = 'pending';
  if not found then raise exception 'not found'; end if;
end $$;

-- ===== TUKAR SHIFT =====
create or replace function pos._start_time(p_employee uuid, p_date date) returns time
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select case when exists (select 1 from schedule_overrides o where o.employee_id = p_employee and o.work_date = p_date)
              then (select o.start_time from schedule_overrides o where o.employee_id = p_employee and o.work_date = p_date)
              else (select s.start_time from employee_schedules s where s.employee_id = p_employee and s.weekday = extract(dow from p_date)::int) end $$;

create or replace function pos.swap_request_create(p_partner uuid, p_requester_date date, p_partner_date date, p_reason text default null) returns uuid
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare me pos.employees%rowtype; pr pos.employees%rowtype; v_today date := pos._jakarta_today(); v_id uuid;
begin
  me := pos._my_employee();
  if me.id is null then raise exception 'no access'; end if;
  select * into pr from employees where id = p_partner and org_id = me.org_id and deleted_at is null and is_active;
  if not found or pr.id = me.id then raise exception 'partner invalid'; end if;
  if p_requester_date is null or p_partner_date is null or p_requester_date = p_partner_date then raise exception 'invalid dates'; end if;
  if p_requester_date < v_today or p_partner_date < v_today then raise exception 'past date'; end if;
  if pos._start_time(me.id, p_requester_date) is null then raise exception 'requester not scheduled'; end if;
  if pos._start_time(pr.id, p_partner_date) is null then raise exception 'partner not scheduled'; end if;
  if pos._start_time(me.id, p_partner_date) is not null or pos._start_time(pr.id, p_requester_date) is not null then raise exception 'schedule conflict'; end if;
  insert into shift_swap_requests(org_id, requester_id, partner_id, requester_date, partner_date, reason)
  values (me.org_id, me.id, pr.id, p_requester_date, p_partner_date, nullif(btrim(coalesce(p_reason, '')), '')) returning id into v_id;
  perform pos._notify(me.org_id, pr.id, 'Ajakan tukar shift', me.name || ' mengajak tukar shift: ' || p_requester_date::text || ' dengan ' || p_partner_date::text || '.');
  return v_id;
end $$;

create or replace function pos._swap_apply(r pos.shift_swap_requests) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare t_req time; t_par time;
begin
  t_req := pos._start_time(r.requester_id, r.requester_date);
  t_par := pos._start_time(r.partner_id, r.partner_date);
  if t_req is null or t_par is null or pos._start_time(r.requester_id, r.partner_date) is not null or pos._start_time(r.partner_id, r.requester_date) is not null then raise exception 'schedule conflict'; end if;
  insert into schedule_overrides(employee_id, org_id, work_date, start_time, swap_id) values
    (r.requester_id, r.org_id, r.requester_date, null, r.id), (r.requester_id, r.org_id, r.partner_date, t_par, r.id),
    (r.partner_id, r.org_id, r.partner_date, null, r.id), (r.partner_id, r.org_id, r.requester_date, t_req, r.id)
  on conflict (employee_id, work_date) do update set start_time = excluded.start_time, swap_id = excluded.swap_id;
end $$;

create or replace function pos.swap_partner_decide(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare r pos.shift_swap_requests%rowtype; me pos.employees%rowtype; req pos.employees%rowtype; v_next text;
begin
  me := pos._my_employee();
  select * into r from shift_swap_requests where id = p_id for update;
  if not found or me.id is null or r.partner_id <> me.id then raise exception 'not allowed'; end if;
  if r.status <> 'pending_partner' then raise exception 'already decided'; end if;
  select * into req from employees where id = r.requester_id;
  v_next := case when not p_approve then 'rejected' when req.role = 'manager' then 'approved' else 'pending_manager' end;
  if v_next = 'approved' then perform pos._swap_apply(r); end if;
  update shift_swap_requests set status = v_next, decided_at = case when v_next in ('approved', 'rejected') then now() end, decided_by = case when v_next in ('approved', 'rejected') then auth.uid() end where id = p_id;
  perform pos._notify(r.org_id, r.requester_id, case v_next when 'rejected' then 'Tukar shift ditolak rekan' when 'approved' then 'Tukar shift disetujui' else 'Rekan setuju tukar shift' end,
    me.name || case v_next when 'rejected' then ' menolak tukar shift.' when 'approved' then ' setuju dan jadwal sudah diubah.' else ' setuju, menunggu persetujuan manajer.' end);
  if v_next = 'pending_manager' then perform pos._notify_role(r.org_id, 'manager', 'Tukar shift menunggu persetujuan', req.name || ' dan ' || me.name || ' ingin tukar shift.'); end if;
end $$;

create or replace function pos.swap_manager_decide(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare r pos.shift_swap_requests%rowtype; me pos.employees%rowtype;
begin
  select * into r from shift_swap_requests where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if not pos.can_manage(r.org_id) then raise exception 'not allowed'; end if;
  me := pos._my_employee();
  if me.id is not null and me.id in (r.requester_id, r.partner_id) then raise exception 'own swap'; end if;
  if r.status <> 'pending_manager' then raise exception 'already decided'; end if;
  if p_approve then perform pos._swap_apply(r); end if;
  update shift_swap_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
  perform pos._notify(r.org_id, r.requester_id, case when p_approve then 'Tukar shift disetujui' else 'Tukar shift ditolak manajer' end, 'Tukar shift ' || r.requester_date::text || ' dengan ' || r.partner_date::text || case when p_approve then ' disetujui, jadwal diubah.' else ' ditolak.' end);
  perform pos._notify(r.org_id, r.partner_id, case when p_approve then 'Tukar shift disetujui' else 'Tukar shift ditolak manajer' end, 'Tukar shift ' || r.requester_date::text || ' dengan ' || r.partner_date::text || case when p_approve then ' disetujui, jadwal diubah.' else ' ditolak.' end);
end $$;

create or replace function pos.swap_request_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare me pos.employees%rowtype;
begin
  me := pos._my_employee();
  update shift_swap_requests set status = 'cancelled', decided_at = now() where id = p_id and requester_id = me.id and status in ('pending_partner', 'pending_manager');
  if not found then raise exception 'not found'; end if;
end $$;

-- ===== DAFTAR UNTUK APLIKASI =====
-- Milik sendiri; pemilik/admin juga melihat semua cuti dan kasbon org; pengelola melihat semua tukar shift; rekan melihat ajakan ke dirinya.
create or replace function pos.staff_requests() returns jsonb
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare me pos.employees%rowtype; v_admin boolean; v_manage boolean;
begin
  me := pos._my_employee();
  if me.id is null then return null; end if;
  v_admin := pos.is_org_admin(me.org_id); v_manage := pos.can_manage(me.org_id);
  return jsonb_build_object(
    'leave', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'employee_id', l.employee_id, 'employee_name', e.name, 'kind', l.kind, 'start_date', l.start_date, 'end_date', l.end_date, 'reason', l.reason, 'status', l.status, 'note', l.decision_note, 'created_at', l.created_at) order by l.created_at desc)
       from (select * from leave_requests where org_id = me.org_id and (employee_id = me.id or v_admin) order by created_at desc limit 100) l join employees e on e.id = l.employee_id), '[]'::jsonb),
    'advances', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'employee_id', a.employee_id, 'employee_name', e.name, 'amount', a.amount, 'reason', a.reason, 'status', a.status, 'proof_path', a.proof_path, 'note', a.decision_note, 'created_at', a.created_at) order by a.created_at desc)
       from (select * from advance_requests where org_id = me.org_id and (employee_id = me.id or v_admin) order by created_at desc limit 100) a join employees e on e.id = a.employee_id), '[]'::jsonb),
    'swaps', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'requester_id', s.requester_id, 'requester_name', rq.name, 'partner_id', s.partner_id, 'partner_name', pt.name, 'requester_date', s.requester_date, 'partner_date', s.partner_date, 'reason', s.reason, 'status', s.status, 'note', s.decision_note, 'created_at', s.created_at) order by s.created_at desc)
       from (select * from shift_swap_requests where org_id = me.org_id and (requester_id = me.id or partner_id = me.id or v_manage) order by created_at desc limit 100) s
       join employees rq on rq.id = s.requester_id join employees pt on pt.id = s.partner_id), '[]'::jsonb),
    'teammates', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.name) from employees e where e.org_id = me.org_id and e.id <> me.id and e.is_active and e.deleted_at is null and e.role <> 'owner'), '[]'::jsonb));
end $$;

-- Jadwal kerja sendiri (jadwal mingguan + pengecualian tukar shift) untuk rentang tanggal
create or replace function pos.staff_schedule(p_from date, p_to date) returns table(work_date date, start_time time, swapped boolean)
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare me pos.employees%rowtype;
begin
  me := pos._my_employee();
  if me.id is null then return; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'invalid range'; end if;
  return query
    select g::date, pos._start_time(me.id, g::date), exists (select 1 from schedule_overrides o where o.employee_id = me.id and o.work_date = g::date)
      from generate_series(p_from, p_to, interval '1 day') g;
end $$;

-- Slip gaji sendiri (hanya periode yang sudah dibayar)
create or replace function pos.staff_payslips() returns setof pos.payroll_records
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select r.* from payroll_records r join employees e on e.id = r.employee_id
   where e.user_id = auth.uid() and r.status = 'PAID' order by r.period_year desc, r.period_month desc limit 24 $$;

-- Bucket bukti transfer kasbon: <org>/<karyawan>/<pengajuan>.jpg; hanya pemilik/admin yang mengunggah; pengelola dan karyawan terkait membaca
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'skema storage tidak ada, bucket kasbon-proof dilewati';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('kasbon-proof', 'kasbon-proof', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'kasbon_proof_insert') then
    execute $p$create policy kasbon_proof_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'kasbon-proof' and pos.is_org_admin(((storage.foldername(name))[1])::uuid))$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'kasbon_proof_select') then
    execute $p$create policy kasbon_proof_select on storage.objects for select to authenticated
      using (bucket_id = 'kasbon-proof' and (pos.can_manage(((storage.foldername(name))[1])::uuid)
        or (storage.foldername(name))[2] = (select e.id::text from pos.employees e where e.user_id = auth.uid() and e.deleted_at is null limit 1)))$p$;
  end if;
end $$;

revoke all on function pos._my_employee(), pos._jakarta_today(), pos._notify(uuid, uuid, text, text), pos._notify_role(uuid, text, text, text), pos._leave_headcount(uuid, date, uuid), pos._start_time(uuid, date), pos._swap_apply(pos.shift_swap_requests) from public, anon, authenticated;
revoke all on function pos.leave_request_create(text, date, date, text), pos.leave_request_decide(uuid, boolean, text), pos.leave_request_cancel(uuid),
  pos.advance_request_create(numeric, text), pos.advance_request_decide(uuid, boolean, text, text), pos.advance_request_cancel(uuid),
  pos.swap_request_create(uuid, date, date, text), pos.swap_partner_decide(uuid, boolean), pos.swap_manager_decide(uuid, boolean, text), pos.swap_request_cancel(uuid),
  pos.staff_requests(), pos.staff_schedule(date, date), pos.staff_payslips() from public, anon;
grant execute on function pos.leave_request_create(text, date, date, text), pos.leave_request_decide(uuid, boolean, text), pos.leave_request_cancel(uuid),
  pos.advance_request_create(numeric, text), pos.advance_request_decide(uuid, boolean, text, text), pos.advance_request_cancel(uuid),
  pos.swap_request_create(uuid, date, date, text), pos.swap_partner_decide(uuid, boolean), pos.swap_manager_decide(uuid, boolean, text), pos.swap_request_cancel(uuid),
  pos.staff_requests(), pos.staff_schedule(date, date), pos.staff_payslips() to authenticated, service_role;
