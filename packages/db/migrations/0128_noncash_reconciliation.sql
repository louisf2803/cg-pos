-- CG POS · 0128_noncash_reconciliation
-- Fitur A128: Rekonsiliasi non-tunai per shift & metode bayar, pengaturan outlet, akun piutang gateway dan biaya transaksi gateway.

alter table pos.outlet_settings
  add column if not exists auto_reconcile_noncash boolean not null default false;

comment on column pos.outlet_settings.auto_reconcile_noncash is
  'Pencatatan non-tunai otomatis saat tutup kasir (true) atau rekonsiliasi manual (false)';

-- Rekonsiliasi non-tunai dari dashboard. Memakai pos.reconcile (0006) yang sudah ada: jurnal bank/piutang/biaya gateway/selisih dan idempoten.
-- Baris rekonsiliasi harus sudah ada (dibuat saat tutup kasir); dicari lewat p_recon, atau lewat (outlet, shift, metode bayar).
-- difference di tabel mengikuti pos.reconcile: positif = uang kurang, negatif = uang lebih.
create or replace function pos.save_noncash_reconciliation(
  p_recon uuid,
  p_outlet uuid,
  p_shift uuid,
  p_method_id text,
  p_actual numeric,
  p_fee numeric default 0,
  p_bank uuid default null,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  r reconciliations%rowtype;
  v_org uuid;
  v_method uuid;
  v_bank uuid;
  v_je uuid;
  v_actual numeric := coalesce(p_actual, 0);
  v_fee numeric := coalesce(p_fee, 0);
begin
  if p_recon is not null then
    select * into r from reconciliations where id = p_recon;
  else
    select org_id into v_org from outlets where id = p_outlet;
    if v_org is null then raise exception 'outlet not found'; end if;
    select id into v_method from payment_methods where org_id = v_org and (id::text = p_method_id or code = p_method_id) limit 1;
    select * into r from reconciliations where org_id = v_org and outlet_id = p_outlet and shift_id = p_shift and method_id = v_method;
  end if;
  if r.id is null then raise exception 'reconciliation not found'; end if;
  if not pos.can_manage(r.org_id) then raise exception 'not allowed'; end if;
  if v_actual < 0 or v_actual <> round(v_actual, 2) then raise exception 'invalid actual amount'; end if;
  if v_fee < 0 or v_fee <> round(v_fee, 2) then raise exception 'invalid fee amount'; end if;
  if r.status = 'reconciled' then raise exception 'already reconciled'; end if;
  v_bank := coalesce(p_bank, pos.account_id(r.org_id, 'bank_main'));
  if not exists (select 1 from accounts where id = v_bank and org_id = r.org_id and kind = 'detail' and is_active and category = 'cash_bank') then
    raise exception 'bank account not found';
  end if;
  v_je := pos.reconcile(r.id, v_actual, v_fee, v_bank, auth.uid());
  select * into r from reconciliations where id = r.id;
  return jsonb_build_object(
    'id', r.id, 'number', r.number, 'expected_amount', r.expected_amount, 'actual_amount', r.actual_amount, 'fee_amount', r.fee_amount,
    'difference', r.difference, 'status', r.status, 'journal_id', v_je, 'reconciled_at', r.reconciled_at
  );
end $$;

revoke all on function pos.save_noncash_reconciliation(uuid, uuid, uuid, text, numeric, numeric, uuid, text) from public, anon;
grant execute on function pos.save_noncash_reconciliation(uuid, uuid, uuid, text, numeric, numeric, uuid, text) to authenticated, service_role;
