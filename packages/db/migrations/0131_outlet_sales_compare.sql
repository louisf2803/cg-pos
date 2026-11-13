-- CG POS · 0131_outlet_sales_compare
-- Perbandingan penjualan antar outlet pada rentang waktu yang sama (A131): penjualan, jumlah transaksi, rata-rata per transaksi,
-- produk terlaris (3 teratas), harga pokok (jurnal akun HPP per outlet), dan margin. Hanya pengelola (pos.can_manage). Hanya membaca.

create or replace function pos.outlet_sales_compare(p_org uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare v_cogs_acc uuid; v_res jsonb;
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'invalid range'; end if;
  if p_to - p_from > interval '1100 days' then raise exception 'range too long'; end if;
  v_cogs_acc := pos.account_id(p_org, 'cogs');
  select coalesce(jsonb_agg(jsonb_build_object(
    'outlet_id', o.id, 'name', o.name,
    'sales', s.sales, 'orders', s.cnt,
    'cogs', coalesce(c.cogs, 0),
    'top', coalesce(t.top, '[]'::jsonb)
  ) order by s.sales desc, o.name), '[]'::jsonb) into v_res
  from outlets o
  cross join lateral (
    select coalesce(sum(od.total), 0) as sales, count(*)::int as cnt
      from orders od where od.org_id = p_org and od.outlet_id = o.id and od.status = 'paid' and od.closed_at >= p_from and od.closed_at < p_to
  ) s
  cross join lateral (
    select coalesce(sum(jl.debit - jl.credit), 0) as cogs
      from journal_entries je join journal_lines jl on jl.entry_id = je.id
     where je.org_id = p_org and je.outlet_id = o.id and je.status = 'posted' and jl.account_id = v_cogs_acc
       and je.entry_date >= (p_from at time zone 'Asia/Jakarta')::date and je.entry_date <= ((p_to - interval '1 second') at time zone 'Asia/Jakarta')::date
  ) c
  cross join lateral (
    select jsonb_agg(jsonb_build_object('name', x.name, 'qty', x.qty, 'amount', x.amount) order by x.qty desc, x.name) as top
      from (select oi.name, sum(oi.qty) as qty, sum(oi.line_total) as amount
              from orders od join order_items oi on oi.order_id = od.id
             where od.org_id = p_org and od.outlet_id = o.id and od.status = 'paid' and od.closed_at >= p_from and od.closed_at < p_to and oi.voided_at is null
             group by oi.name order by sum(oi.qty) desc, oi.name limit 3) x
  ) t
  where o.org_id = p_org and o.is_active;
  return v_res;
end $$;

revoke all on function pos.outlet_sales_compare(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function pos.outlet_sales_compare(uuid, timestamptz, timestamptz) to authenticated, service_role;
