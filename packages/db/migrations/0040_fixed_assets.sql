-- CG POS · 0040_fixed_assets
-- Manajemen aset tetap: perolehan (opsional dengan jurnal), penyusutan garis lurus bulanan, pelepasan aset. Tabel fixed_assets dan
-- asset_depreciations sudah ada sejak 0004; migrasi ini menambah fungsi saja (aditif), semua khusus pemilik/admin, jurnal lewat pos.post_journal.
-- ASUMSI (belum dicek ke Majoo): penyusutan mulai bulan SETELAH bulan perolehan; nilai per bulan = (harga - sisa) / umur, bulan terakhir
-- menghabiskan sisa; akun bawaan 1-2100 Peralatan, 1-2900 Akumulasi Penyusutan, 6-2000 Beban Penyusutan.

-- Catat aset baru. Idempoten menurut p_id. Bila p_pay_account diisi: jurnal Dr Peralatan, Cr akun bayar sebesar harga perolehan.
create or replace function pos.fixed_asset_acquire(p_id uuid, p_org uuid, p_name text, p_acquired_on date, p_cost numeric, p_salvage numeric,
  p_life_months int, p_outlet uuid, p_pay_account uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_asset uuid; v_acc uuid; v_exp uuid; v_cost uuid; v_je uuid;
begin
  if p_id is null then raise exception 'id required'; end if;
  if not pos.is_org_admin(p_org) then raise exception 'not allowed'; end if;
  if exists (select 1 from fixed_assets where id = p_id and org_id = p_org) then return jsonb_build_object('id', p_id, 'already', true); end if;
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 120 then raise exception 'name required (max 120)'; end if;
  if p_acquired_on is null then raise exception 'date required'; end if;
  if p_cost is null or p_cost <= 0 or p_cost > 1000000000000 or p_cost <> round(p_cost, 2) then raise exception 'invalid cost'; end if;
  if p_salvage is null or p_salvage < 0 or p_salvage >= p_cost or p_salvage <> round(p_salvage, 2) then raise exception 'invalid salvage'; end if;
  if p_life_months is null or p_life_months < 1 or p_life_months > 600 then raise exception 'invalid life'; end if;
  if p_outlet is not null and not exists (select 1 from outlets where id = p_outlet and org_id = p_org) then raise exception 'outlet not found'; end if;
  v_cost := pos.account_id(p_org, 'fixed_asset_equipment');
  v_acc := pos.account_id(p_org, 'accumulated_depreciation');
  v_exp := pos.account_id(p_org, 'depreciation_expense');
  if v_cost is null or v_acc is null or v_exp is null then raise exception 'asset accounts missing'; end if;
  insert into fixed_assets(id, org_id, outlet_id, name, acquired_on, cost, salvage_value, useful_life_months, asset_account_id, accumulated_account_id, expense_account_id)
  values (p_id, p_org, p_outlet, btrim(p_name), p_acquired_on, p_cost, p_salvage, p_life_months, v_cost, v_acc, v_exp) returning id into v_asset;
  if p_pay_account is not null then
    if not exists (select 1 from accounts where id = p_pay_account and org_id = p_org and kind = 'detail' and is_active) then raise exception 'account not found or not postable'; end if;
    v_je := pos.post_journal(p_org, p_outlet, p_acquired_on, 'AT', left('Perolehan aset: ' || btrim(p_name), 200), 'fixed_asset', v_asset, 'asset:' || v_asset,
      jsonb_build_array(jsonb_build_object('account_id', v_cost, 'debit', p_cost, 'credit', 0), jsonb_build_object('account_id', p_pay_account, 'debit', 0, 'credit', p_cost)));
  end if;
  return jsonb_build_object('id', v_asset, 'journal_id', v_je);
end $$;

-- Susutkan semua aset aktif untuk satu bulan (p_period = tanggal mana pun di bulan itu; tidak boleh bulan depan). Idempoten per aset per bulan.
create or replace function pos.fixed_asset_depreciate(p_org uuid, p_period date) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare a fixed_assets%rowtype; v_month date; v_end date; v_done int; v_sum numeric; v_amt numeric; v_je uuid; v_count int := 0; v_total numeric := 0;
begin
  if not pos.is_org_admin(p_org) then raise exception 'not allowed'; end if;
  if p_period is null then raise exception 'period required'; end if;
  v_month := date_trunc('month', p_period)::date;
  if v_month > date_trunc('month', current_date)::date then raise exception 'period in the future'; end if;
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

-- Lepas aset (jual/buang): hapus nilai perolehan dan akumulasi, catat kas hasil jual, selisih ke akun laba/rugi pelepasan.
create or replace function pos.fixed_asset_dispose(p_asset uuid, p_date date, p_proceeds numeric, p_cash_account uuid, p_gain_loss_account uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare a fixed_assets%rowtype; v_acc numeric; v_diff numeric; v_lines jsonb; v_je uuid; v_proceeds numeric := coalesce(p_proceeds, 0);
begin
  select * into a from fixed_assets where id = p_asset for update;
  if not found then raise exception 'asset not found'; end if;
  if not pos.is_org_admin(a.org_id) then raise exception 'not allowed'; end if;
  if a.status <> 'active' then raise exception 'asset already disposed'; end if;
  if p_date is null or p_date < a.acquired_on or p_date > current_date then raise exception 'invalid date'; end if;
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

revoke all on function pos.fixed_asset_acquire(uuid, uuid, text, date, numeric, numeric, int, uuid, uuid),
  pos.fixed_asset_depreciate(uuid, date), pos.fixed_asset_dispose(uuid, date, numeric, uuid, uuid) from public, anon;
grant execute on function pos.fixed_asset_acquire(uuid, uuid, text, date, numeric, numeric, int, uuid, uuid),
  pos.fixed_asset_depreciate(uuid, date), pos.fixed_asset_dispose(uuid, date, numeric, uuid, uuid) to authenticated, service_role;
