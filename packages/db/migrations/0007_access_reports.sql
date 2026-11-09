-- CG POS · 0007_access_reports
-- Semua objek ada di schema pos. Tidak menyentuh schema public.
begin;
set local search_path = pos, extensions, public;

-- ===== 12_access.sql =====
-- Bagian 12: fungsi akses. Dipakai oleh kebijakan RLS dan laporan. Akun perangkat (role 'device') sengaja
-- tidak muncul di sini: perangkat hanya boleh memanggil fungsi sinkronisasi, tidak boleh membaca tabel langsung.

create or replace function pos.user_org_ids() returns setof uuid
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select org_id from org_members where user_id = auth.uid() and role <> 'device' $$;

create or replace function pos.member_role(p_org uuid) returns text
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select role from org_members where org_id = p_org and user_id = auth.uid() $$;

create or replace function pos.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select coalesce(pos.member_role(p_org) in ('owner','admin'), false) $$;

create or replace function pos.can_manage(p_org uuid) returns boolean
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select coalesce(pos.member_role(p_org) in ('owner','admin','manager'), false) $$;

-- boleh melihat outlet ini? pemilik/admin: semua outlet org; lainnya: hanya outlet yang ditugaskan
create or replace function pos.can_see_outlet(p_org uuid, p_outlet uuid) returns boolean
language sql stable security definer set search_path = pos, extensions, pg_temp as $$
  select case
    when pos.member_role(p_org) is null or pos.member_role(p_org) = 'device' then false
    when pos.member_role(p_org) in ('owner','admin') then true
    else exists (select 1 from member_outlets mo where mo.org_id = p_org and mo.user_id = auth.uid() and mo.outlet_id = p_outlet)
  end $$;

-- pemanggil tepercaya = rute server dengan service role (tidak ada auth.uid())
create or replace function pos.require_report_access(p_org uuid, p_outlet uuid) returns void
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
begin
  if auth.uid() is null then return; end if;
  if p_outlet is null then
    if not pos.can_manage(p_org) or pos.member_role(p_org) = 'manager' then
      raise exception 'org-wide reports need owner or admin';
    end if;
  elsif not pos.can_see_outlet(p_org, p_outlet) or not pos.can_manage(p_org) then
    raise exception 'no access to this outlet report';
  end if;
end $$;

-- ===== 13_reports.sql =====
-- Bagian 13: laporan keuangan, semuanya turunan dari journal_lines (jurnal terposting dan yang di-void; keduanya saling meniadakan)

create or replace function pos.report_trial_balance(p_org uuid, p_from date, p_to date, p_outlet uuid default null)
returns table(account_id uuid, code text, name text, category text,
              opening numeric, debit numeric, credit numeric, closing numeric)
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
begin
  perform pos.require_report_access(p_org, p_outlet);
  return query
  with mv as (
    select jl.account_id,
           coalesce(sum(jl.debit - jl.credit) filter (where je.entry_date < p_from), 0) as open_net,
           coalesce(sum(jl.debit)  filter (where je.entry_date between p_from and p_to), 0) as dr,
           coalesce(sum(jl.credit) filter (where je.entry_date between p_from and p_to), 0) as cr
      from journal_lines jl join journal_entries je on je.id = jl.entry_id and je.org_id = jl.org_id
     where jl.org_id = p_org and je.status in ('posted','voided') and je.entry_date <= p_to
       and (p_outlet is null or je.outlet_id = p_outlet)
     group by jl.account_id)
  select a.id, a.code, a.name, a.category,
         case when pos.is_debit_normal(a.category) then mv.open_net else -mv.open_net end,
         mv.dr, mv.cr,
         case when pos.is_debit_normal(a.category) then mv.open_net + mv.dr - mv.cr else -(mv.open_net + mv.dr - mv.cr) end
    from mv join accounts a on a.id = mv.account_id
   order by a.code;
end $$;

create or replace function pos.report_income_statement(p_org uuid, p_from date, p_to date, p_outlet uuid default null)
returns table(section text, code text, name text, amount numeric)
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
begin
  perform pos.require_report_access(p_org, p_outlet);
  return query
  with mv as (
    select a.code, a.name, a.category,
           case when pos.is_debit_normal(a.category) then sum(jl.debit - jl.credit) else sum(jl.credit - jl.debit) end as amt
      from journal_lines jl
      join journal_entries je on je.id = jl.entry_id and je.org_id = jl.org_id
      join accounts a on a.id = jl.account_id
     where jl.org_id = p_org and je.status in ('posted','voided') and je.entry_date between p_from and p_to
       and (p_outlet is null or je.outlet_id = p_outlet)
       and a.category in ('revenue','cogs','expense','other_income','other_expense')
     group by a.code, a.name, a.category),
  tot as (
    select coalesce(sum(amt) filter (where category = 'revenue'), 0) rev,
           coalesce(sum(amt) filter (where category = 'cogs'), 0) cg,
           coalesce(sum(amt) filter (where category = 'expense'), 0) ex,
           coalesce(sum(amt) filter (where category = 'other_income'), 0) oi,
           coalesce(sum(amt) filter (where category = 'other_expense'), 0) oe
      from mv)
  select s, c, n, v from (
    select 1 o, 'revenue' s, mv.code c, mv.name n, mv.amt v from mv where category = 'revenue'
    union all select 2, 'cogs', mv.code, mv.name, mv.amt from mv where category = 'cogs'
    union all select 3, 'gross_profit', null, 'Laba Kotor', rev - cg from tot
    union all select 4, 'expense', mv.code, mv.name, mv.amt from mv where category = 'expense'
    union all select 5, 'operating_profit', null, 'Laba Operasional', rev - cg - ex from tot
    union all select 6, 'other_income', mv.code, mv.name, mv.amt from mv where category = 'other_income'
    union all select 7, 'other_expense', mv.code, mv.name, mv.amt from mv where category = 'other_expense'
    union all select 8, 'net_profit', null, 'Laba Bersih', rev - cg - ex + oi - oe from tot
  ) x order by o, c;
end $$;

-- Neraca per tanggal. Laba berjalan kumulatif dimasukkan sebagai baris ekuitas (belum ada tutup buku tahunan).
create or replace function pos.report_balance_sheet(p_org uuid, p_as_of date, p_outlet uuid default null)
returns table(section text, code text, name text, amount numeric)
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
begin
  perform pos.require_report_access(p_org, p_outlet);
  return query
  with mv as (
    select a.code, a.name, a.category, sum(jl.debit - jl.credit) as net
      from journal_lines jl
      join journal_entries je on je.id = jl.entry_id and je.org_id = jl.org_id
      join accounts a on a.id = jl.account_id
     where jl.org_id = p_org and je.status in ('posted','voided') and je.entry_date <= p_as_of
       and (p_outlet is null or je.outlet_id = p_outlet)
     group by a.code, a.name, a.category),
  earn as (
    select coalesce(-sum(net), 0) as profit   -- net = debit - credit; laba = kredit - debit seluruh akun laba-rugi
      from mv where category in ('revenue','cogs','expense','other_income','other_expense'))
  select s, c, n, v from (
    select 1 o, 'asset' s, mv.code c, mv.name n, mv.net v from mv
     where category in ('cash_bank','receivable','inventory','other_current_asset','fixed_asset','accumulated_depreciation')
    union all select 2, 'liability', mv.code, mv.name, -mv.net from mv
     where category in ('payable','short_term_liability','long_term_liability')
    union all select 3, 'equity', mv.code, mv.name, -mv.net from mv where category = 'equity'
    union all select 3, 'equity', '3-9999', 'Laba Berjalan (kumulatif)', profit from earn
  ) x order by o, c;
end $$;

-- Utang/piutang: umur faktur pembelian yang belum lunas
create or replace function pos.report_payables_aging(p_org uuid, p_as_of date)
returns table(supplier_id uuid, supplier_name text, invoice_id uuid, number text, due_date date,
              outstanding numeric, days_overdue int)
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
begin
  perform pos.require_report_access(p_org, null);
  return query
  select pi.supplier_id, coalesce(s.name, '(tanpa pemasok)'), pi.id, pi.number, pi.due_date,
         pi.total - pi.paid_total, greatest(0, p_as_of - pi.due_date)
    from purchase_invoices pi left join suppliers s on s.id = pi.supplier_id and s.org_id = pi.org_id
   where pi.org_id = p_org and pi.status in ('open','partially_paid') and pi.invoice_date <= p_as_of
   order by pi.due_date nulls last;
end $$;

-- Ringkasan penjualan harian per outlet (laporan dasar T1)
create or replace function pos.report_sales_daily(p_org uuid, p_from date, p_to date, p_outlet uuid default null)
returns table(day date, outlet_id uuid, orders bigint, gross_sales numeric, discounts numeric, service_charge numeric,
              tax numeric, rounding numeric, net_total numeric)
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
begin
  perform pos.require_report_access(p_org, p_outlet);
  return query
  select pos.book_date(o.outlet_id, o.closed_at), o.outlet_id, count(*), sum(o.subtotal), sum(o.discount_total),
         sum(o.service_charge), sum(o.tax_total), sum(o.rounding), sum(o.total)
    from orders o
   where o.org_id = p_org and o.status = 'paid'
     and pos.book_date(o.outlet_id, o.closed_at) between p_from and p_to
     and (p_outlet is null or o.outlet_id = p_outlet)
   group by 1, 2 order by 1, 2;
end $$;


commit;
