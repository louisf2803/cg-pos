-- CG POS · 0155_owner_overview
-- Pantauan pemilik di aplikasi HP: satu panggilan merangkum hari ini per outlet (penjualan, kasir yang sedang membuka shift, karyawan yang sedang absen masuk,
-- kemajuan tugas Opening/Closing), tren penjualan 7 hari, dan jumlah pengajuan yang menunggu keputusan. Hanya pemilik/admin (pos.is_org_admin).
create or replace function pos.owner_overview(p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_day date := coalesce(p_date, pos._jakarta_today()); v_outlets jsonb; v_series jsonb; v_pending jsonb;
begin
  select e.org_id into v_org from pos.employees e where e.user_id = auth.uid() and e.deleted_at is null and e.is_active order by e.created_at limit 1;
  if v_org is null or not pos.is_org_admin(v_org) then raise exception 'not allowed'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'name', o.name,
      'orders', coalesce(s.orders, 0), 'sales', coalesce(s.total, 0),
      'open_shifts', coalesce((select jsonb_agg(jsonb_build_object('cashier', c.name, 'opened_at', sh.opened_at) order by sh.opened_at)
                                 from shifts sh join employees c on c.id = sh.cashier_id where sh.outlet_id = o.id and sh.status = 'open'), '[]'::jsonb),
      'clocked_in', coalesce((select jsonb_agg(c.name order by c.name) from attendance a join employees c on c.id = a.employee_id
                               where a.outlet_id = o.id and a.clock_out_at is null and pos.book_date(o.id, a.clock_in_at) = v_day), '[]'::jsonb),
      'tasks', coalesce((select jsonb_agg(jsonb_build_object('phase', r.phase,
                    'done', (select count(*) from task_items i where i.run_id = r.id and i.status in ('done', 'skipped')),
                    'total', (select count(*) from task_items i where i.run_id = r.id)) order by r.phase)
                   from task_runs r where r.outlet_id = o.id and r.run_date = v_day), '[]'::jsonb)
    ) order by o.name), '[]'::jsonb) into v_outlets
    from outlets o
    left join lateral (select count(*) as orders, sum(x.total) as total from orders x
                        where x.outlet_id = o.id and x.status = 'paid' and pos.book_date(x.outlet_id, x.closed_at) = v_day) s on true
   where o.org_id = v_org;
  select coalesce(jsonb_agg(jsonb_build_object('day', g::date, 'sales', coalesce(t.total, 0), 'orders', coalesce(t.orders, 0)) order by g), '[]'::jsonb) into v_series
    from generate_series(v_day - 6, v_day, interval '1 day') g
    left join lateral (select sum(x.total) as total, count(*) as orders from orders x
                        where x.org_id = v_org and x.status = 'paid' and pos.book_date(x.outlet_id, x.closed_at) = g::date) t on true;
  v_pending := jsonb_build_object(
    'leave', (select count(*) from leave_requests where org_id = v_org and status = 'pending'),
    'advances', (select count(*) from advance_requests where org_id = v_org and status = 'pending'),
    'swaps', (select count(*) from shift_swap_requests where org_id = v_org and status = 'pending_manager'));
  return jsonb_build_object('date', v_day, 'outlets', v_outlets, 'series', v_series, 'pending', v_pending);
end $$;
revoke all on function pos.owner_overview(date) from public, anon;
grant execute on function pos.owner_overview(date) to authenticated, service_role;
