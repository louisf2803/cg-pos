-- CG POS · 0157_employee_outlets
-- Banyak outlet: tiap outlet punya karyawan sendiri. employee_outlets sudah menjadi sumber kebenaran (daftar karyawan, absensi, sinkronisasi POS);
-- migrasi ini menambah cara aman mengubahnya dari dashboard dan membatasi pilihan rekan tukar shift pada outlet yang sama.
--  * employee_outlets_set(karyawan, outlet[]) : pengelola mengganti daftar outlet seorang karyawan (minimal satu outlet; semua outlet harus milik org yang sama).
--    Pemilik/manajer tanpa baris outlet berarti "semua outlet" di staff_me, jadi untuk keduanya daftar boleh kosong.
--  * employee_outlets_list()                  : peta karyawan -> outlet untuk pengelola.
--  * staff_requests().teammates               : hanya rekan yang berbagi minimal satu outlet (atau keduanya tidak terikat outlet).
create or replace function pos.employee_outlets_set(p_employee uuid, p_outlets uuid[]) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare e pos.employees%rowtype; v_n int;
begin
  select * into e from pos.employees where id = p_employee and deleted_at is null;
  if not found then raise exception 'employee not found'; end if;
  if not pos.can_manage(e.org_id) then raise exception 'not allowed'; end if;
  p_outlets := coalesce(p_outlets, '{}'::uuid[]);
  if cardinality(p_outlets) = 0 and e.role not in ('owner', 'manager') then raise exception 'outlet required'; end if;
  select count(*) into v_n from pos.outlets o where o.id = any (p_outlets) and o.org_id = e.org_id and o.deleted_at is null;
  if v_n <> (select count(distinct x) from unnest(p_outlets) x) then raise exception 'outlet not found'; end if;
  delete from pos.employee_outlets where employee_id = p_employee and not (outlet_id = any (p_outlets));
  insert into pos.employee_outlets(employee_id, outlet_id, org_id)
  select p_employee, x, e.org_id from (select distinct unnest(p_outlets) x) s on conflict do nothing;
end $$;

create or replace function pos.employee_outlets_list() returns table(employee_id uuid, outlet_id uuid)
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select eo.employee_id, eo.outlet_id from pos.employee_outlets eo where pos.can_manage(eo.org_id) $$;

revoke all on function pos.employee_outlets_set(uuid, uuid[]), pos.employee_outlets_list() from public, anon;
grant execute on function pos.employee_outlets_set(uuid, uuid[]), pos.employee_outlets_list() to authenticated, service_role;

-- dua karyawan berbagi outlet bila punya outlet yang sama; yang tidak terikat outlet mana pun (pemilik/manajer: semua outlet) cocok dengan siapa saja
create or replace function pos._shares_outlet(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select exists (select 1 from pos.employee_outlets x join pos.employee_outlets y on y.outlet_id = x.outlet_id where x.employee_id = a and y.employee_id = b)
      or not exists (select 1 from pos.employee_outlets where employee_id = a)
      or not exists (select 1 from pos.employee_outlets where employee_id = b) $$;
revoke all on function pos._shares_outlet(uuid, uuid) from public, anon, authenticated;

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
    'teammates', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.name) from employees e where e.org_id = me.org_id and e.id <> me.id and e.is_active and e.deleted_at is null and e.role <> 'owner'
         and pos._shares_outlet(me.id, e.id)), '[]'::jsonb));
end $$;

create or replace function pos.swap_request_create(p_partner uuid, p_requester_date date, p_partner_date date, p_reason text default null) returns uuid
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare me pos.employees%rowtype; pr pos.employees%rowtype; v_today date := pos._jakarta_today(); v_id uuid;
begin
  me := pos._my_employee();
  if me.id is null then raise exception 'no access'; end if;
  select * into pr from employees where id = p_partner and org_id = me.org_id and deleted_at is null and is_active;
  if not found or pr.id = me.id then raise exception 'partner invalid'; end if;
  if not pos._shares_outlet(me.id, pr.id) then raise exception 'partner invalid'; end if;
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
