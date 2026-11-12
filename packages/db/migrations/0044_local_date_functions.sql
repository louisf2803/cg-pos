-- CG POS · 0044_local_date_functions
-- Perbaikan: fungsi aset tetap dan tagihan rutin membandingkan tanggal dari klien (tanggal lokal WIB) dengan current_date server (UTC).
-- Antara 00.00 dan 07.00 WIB tanggal UTC masih kemarin, sehingga "hari ini" ditolak sebagai "di masa depan". Sekarang memakai tanggal
-- Asia/Jakarta (AGENTS.md: tanggal lokal Asia/Jakarta). Hanya mengganti isi fungsi (create or replace); tanda tangan dan hak akses tetap.

create or replace function pos.fixed_asset_depreciate(p_org uuid, p_period date) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare a fixed_assets%rowtype; v_month date; v_end date; v_done int; v_sum numeric; v_amt numeric; v_je uuid; v_count int := 0; v_total numeric := 0;
begin
  if not pos.is_org_admin(p_org) then raise exception 'not allowed'; end if;
  if p_period is null then raise exception 'period required'; end if;
  v_month := date_trunc('month', p_period)::date;
  if v_month > date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date then raise exception 'period in the future'; end if;
  v_end := (v_month + interval '1 month - 1 day')::date;
  for a in select * from fixed_assets where org_id = p_org and status = 'active' and useful_life_months is not null
      and date_trunc('month', acquired_on)::date < v_month order by acquired_on, id for update loop
    if exists (select 1 from asset_depreciations where asset_id = a.id and period = v_month) then continue; end if;
    select count(*), coalesce(sum(amount), 0) into v_done, v_sum from asset_depreciations where asset_id = a.id;
    if v_done >= a.useful_life_months or a.cost - a.salvage_value - v_sum <= 0 then continue; end if;
    v_amt := case when v_done >= a.useful_life_months - 1 then a.cost - a.salvage_value - v_sum
                  else least(a.cost - a.salvage_value - v_sum, round((a.cost - a.salvage_value) / a.useful_life_months, 2)) end;
    if v_amt <= 0 then continue; end if;
    v_je := pos.post_journal(p_org, a.outlet_id, v_end, 'PY', left('Penyusutan ' || to_char(v_month, 'YYYY-MM') || ': ' || a.name, 200), 'fixed_asset', a.id,
      'depr:' || a.id || ':' || to_char(v_month, 'YYYY-MM'),
      jsonb_build_array(jsonb_build_object('account_id', a.expense_account_id, 'debit', v_amt, 'credit', 0), jsonb_build_object('account_id', a.accumulated_account_id, 'debit', 0, 'credit', v_amt)));
    insert into asset_depreciations(asset_id, period, amount, journal_entry_id) values (a.id, v_month, v_amt, v_je);
    v_count := v_count + 1; v_total := v_total + v_amt;
  end loop;
  return jsonb_build_object('period', v_month, 'assets', v_count, 'total', v_total);
end $$;

create or replace function pos.fixed_asset_dispose(p_asset uuid, p_date date, p_proceeds numeric, p_cash_account uuid, p_gain_loss_account uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare a fixed_assets%rowtype; v_acc numeric; v_diff numeric; v_lines jsonb; v_je uuid; v_proceeds numeric := coalesce(p_proceeds, 0);
begin
  select * into a from fixed_assets where id = p_asset for update;
  if not found then raise exception 'asset not found'; end if;
  if not pos.is_org_admin(a.org_id) then raise exception 'not allowed'; end if;
  if a.status <> 'active' then raise exception 'asset already disposed'; end if;
  if p_date is null or p_date < a.acquired_on or p_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'invalid date'; end if;
  if v_proceeds < 0 or v_proceeds > 1000000000000 or v_proceeds <> round(v_proceeds, 2) then raise exception 'invalid proceeds'; end if;
  if v_proceeds > 0 and (p_cash_account is null or not exists (select 1 from accounts where id = p_cash_account and org_id = a.org_id and kind = 'detail' and is_active)) then raise exception 'cash account required'; end if;
  select coalesce(sum(amount), 0) into v_acc from asset_depreciations where asset_id = a.id;
  v_diff := v_proceeds + v_acc - a.cost;
  if v_diff <> 0 and (p_gain_loss_account is null or not exists (select 1 from accounts where id = p_gain_loss_account and org_id = a.org_id and kind = 'detail' and is_active)) then raise exception 'gain/loss account required'; end if;
  v_lines := jsonb_build_array(jsonb_build_object('account_id', a.asset_account_id, 'debit', 0, 'credit', a.cost));
  if v_acc > 0 then v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', a.accumulated_account_id, 'debit', v_acc, 'credit', 0)); end if;
  if v_proceeds > 0 then v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', p_cash_account, 'debit', v_proceeds, 'credit', 0)); end if;
  if v_diff > 0 then v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', p_gain_loss_account, 'debit', 0, 'credit', v_diff));
  elsif v_diff < 0 then v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', p_gain_loss_account, 'debit', -v_diff, 'credit', 0)); end if;
  v_je := pos.post_journal(a.org_id, a.outlet_id, p_date, 'LA', left('Pelepasan aset: ' || a.name, 200), 'fixed_asset', a.id, 'dispose:' || a.id, v_lines);
  update fixed_assets set status = 'disposed' where id = a.id;
  return jsonb_build_object('id', a.id, 'journal_id', v_je, 'gain_loss', v_diff);
end $$;

create or replace function pos.recurring_bill_pay(p_bill uuid, p_pay_account uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare b recurring_bills%rowtype; v_je uuid; v_next date;
begin
  select * into b from recurring_bills where id = p_bill for update;
  if not found then raise exception 'bill not found'; end if;
  if not pos.is_org_admin(b.org_id) then raise exception 'not allowed'; end if;
  if not b.is_active then raise exception 'bill inactive'; end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'invalid date'; end if;
  if p_pay_account is null or not exists (select 1 from accounts where id = p_pay_account and org_id = b.org_id and kind = 'detail' and is_active) then raise exception 'account not found or not postable'; end if;
  if not exists (select 1 from accounts where id = b.expense_account_id and org_id = b.org_id and kind = 'detail' and is_active) then raise exception 'account not found or not postable'; end if;
  v_je := pos.post_journal(b.org_id, b.outlet_id, p_date, 'TR', left('Tagihan rutin: ' || b.name, 200), 'recurring_bill', b.id, 'bill:' || b.id || ':' || b.next_due,
    jsonb_build_array(jsonb_build_object('account_id', b.expense_account_id, 'debit', b.amount, 'credit', 0), jsonb_build_object('account_id', p_pay_account, 'debit', 0, 'credit', b.amount)));
  insert into recurring_bill_runs(bill_id, due_date, paid_on, amount, journal_entry_id) values (b.id, b.next_due, p_date, b.amount, v_je)
    on conflict (bill_id, due_date) do nothing;
  v_next := case b.frequency when 'weekly' then b.next_due + 7 when 'monthly' then (b.next_due + interval '1 month')::date else (b.next_due + interval '1 year')::date end;
  update recurring_bills set next_due = v_next where id = b.id;
  return jsonb_build_object('bill_id', b.id, 'paid_due', b.next_due, 'next_due', v_next, 'journal_id', v_je);
end $$;

