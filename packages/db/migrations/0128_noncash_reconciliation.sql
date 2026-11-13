-- CG POS · 0128_noncash_reconciliation
-- Fitur A128: Rekonsiliasi non-tunai per shift & metode bayar, pengaturan outlet, akun piutang gateway dan biaya transaksi gateway.

alter table pos.outlet_settings
  add column if not exists auto_reconcile_noncash boolean not null default false;

comment on column pos.outlet_settings.auto_reconcile_noncash is
  'Pencatatan non-tunai otomatis saat tutup kasir (true) atau rekonsiliasi manual (false)';

-- Simpan atau eksekusi rekonsiliasi non-tunai dari dashboard klien.
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
  v_bank uuid;
  v_clear uuid;
  v_method_uuid uuid;
  v_je uuid;
  v_num bigint;
  v_actual numeric := coalesce(p_actual, 0);
  v_fee numeric := coalesce(p_fee, 0);
  v_diff numeric;
  v_lines jsonb;
  v_date date;
begin
  if p_recon is not null then
    select * into r from reconciliations where id = p_recon for update;
    if found then
      v_org := r.org_id;
    end if;
  end if;

  if v_org is null then
    if p_outlet is null then raise exception 'outlet required'; end if;
    select org_id into v_org from outlets where id = p_outlet;
    if v_org is null then raise exception 'outlet not found'; end if;
  end if;

  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  if v_actual < 0 or v_actual <> round(v_actual, 2) then raise exception 'invalid actual amount'; end if;
  if v_fee < 0 or v_fee <> round(v_fee, 2) then raise exception 'invalid fee amount'; end if;

  -- Cari akun bank
  v_bank := p_bank;
  if v_bank is null then
    v_bank := pos.account_id(v_org, 'bank_main');
  end if;
  if v_bank is null then raise exception 'bank account missing'; end if;

  if r.id is not null then
    -- Baris rekonsiliasi yang sudah ada
    select account_id into v_clear from payment_methods where id = r.method_id;
    if v_clear is null then
      v_clear := pos.account_id(v_org, 'noncash_clearing');
    end if;

    v_diff := (v_actual + v_fee) - r.expected_amount;
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_bank, 'debit', v_actual, 'credit', 0),
      jsonb_build_object('account_id', v_clear, 'debit', 0, 'credit', r.expected_amount)
    );
    if v_fee > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', pos.account_id(v_org, 'gateway_fee_expense'), 'debit', v_fee, 'credit', 0));
    end if;
    if v_diff < 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', pos.account_id(v_org, 'reconciliation_diff'), 'debit', -v_diff, 'credit', 0));
    elsif v_diff > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', pos.account_id(v_org, 'reconciliation_diff'), 'debit', 0, 'credit', v_diff));
    end if;

    v_date := (now() at time zone 'Asia/Jakarta')::date;
    v_je := pos.post_journal(v_org, r.outlet_id, v_date, 'REC', left('Rekonsiliasi ' || r.number, 200),
                             'reconciliation', r.id, 'recon:' || r.id, v_lines);

    update reconciliations
       set actual_amount = v_actual,
           fee_amount = v_fee,
           difference = v_diff,
           status = 'reconciled',
           bank_account_id = v_bank,
           journal_entry_id = v_je,
           reconciled_at = now(),
           reconciled_by = auth.uid()
     where id = r.id
     returning * into r;

    return jsonb_build_object(
      'id', r.id,
      'number', r.number,
      'expected_amount', r.expected_amount,
      'actual_amount', r.actual_amount,
      'fee_amount', r.fee_amount,
      'difference', r.difference,
      'status', r.status,
      'journal_id', v_je,
      'reconciled_at', r.reconciled_at
    );
  else
    -- Jika dipanggil tanpa baris rekonsiliasi yang sudah ada di tabel
    select id, account_id into v_method_uuid, v_clear from payment_methods
     where (id::text = p_method_id or code = p_method_id) and org_id = v_org limit 1;

    if v_clear is null then
      v_clear := pos.account_id(v_org, 'noncash_clearing');
    end if;

    v_diff := 0;
    v_num := pos.next_doc_number(v_org, 'REC', 0);

    insert into reconciliations (
      org_id, outlet_id, shift_id, method_id, number,
      expected_amount, actual_amount, fee_amount, difference,
      status, bank_account_id, reconciled_at, reconciled_by
    ) values (
      v_org, p_outlet, p_shift, coalesce(v_method_uuid, gen_random_uuid()), 'REC-' || lpad(v_num::text, 6, '0'),
      v_actual + v_fee, v_actual, v_fee, 0,
      'reconciled', v_bank, now(), auth.uid()
    ) returning * into r;

    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_bank, 'debit', v_actual, 'credit', 0),
      jsonb_build_object('account_id', v_clear, 'debit', 0, 'credit', v_actual + v_fee)
    );
    if v_fee > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', pos.account_id(v_org, 'gateway_fee_expense'), 'debit', v_fee, 'credit', 0));
    end if;

    v_date := (now() at time zone 'Asia/Jakarta')::date;
    v_je := pos.post_journal(v_org, p_outlet, v_date, 'REC', left('Rekonsiliasi ' || r.number, 200),
                             'reconciliation', r.id, 'recon:' || r.id, v_lines);

    update reconciliations set journal_entry_id = v_je where id = r.id;

    return jsonb_build_object(
      'id', r.id,
      'number', r.number,
      'expected_amount', r.expected_amount,
      'actual_amount', r.actual_amount,
      'fee_amount', r.fee_amount,
      'difference', 0,
      'status', r.status,
      'journal_id', v_je,
      'reconciled_at', r.reconciled_at
    );
  end if;
end $$;

revoke all on function pos.save_noncash_reconciliation(uuid, uuid, uuid, text, numeric, numeric, uuid, text) from public, anon;
grant execute on function pos.save_noncash_reconciliation(uuid, uuid, uuid, text, numeric, numeric, uuid, text) to authenticated, service_role;
