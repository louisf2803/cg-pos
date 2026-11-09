-- CG POS · 0006_posting
-- Semua objek ada di schema pos. Tidak menyentuh schema public.
begin;
set local search_path = pos, extensions, public;

-- ===== 11_posting.sql =====
-- Bagian 11: pembukuan otomatis. Semua fungsi idempoten (kunci sumber) dan hanya dipanggil dari fungsi lain / server.

-- Selesaikan order yang sudah lunas: stok keluar, HPP, dan satu jurnal penjualan.
create or replace function pos.finalize_order(p_order uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  o orders%rowtype; v_loc uuid; v_date date; r record; v_cogs numeric := 0;
  v_lines jsonb := '[]'::jsonb; v_closed timestamptz;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.finalized_at is not null then return; end if;
  if o.status <> 'paid' then raise exception 'order % is not paid', o.number; end if;
  v_loc := pos.outlet_location(o.outlet_id);
  v_closed := coalesce(o.closed_at, now());
  v_date := pos.open_book_date(o.org_id, pos.book_date(o.outlet_id, v_closed));

  -- stok keluar: satu gerakan per bahan per order
  for r in
    select c.pid, sum(c.q) as q from (
      select comp.component_id as pid, comp.component_qty as q
        from order_items oi
        join product_units pu on pu.id = oi.product_unit_id
        cross join lateral pos.sale_components(oi.product_id, oi.qty * pu.conversion) comp
       where oi.order_id = p_order and oi.voided_at is null
      union all
      select eoi.ingredient_id, e.qty * eoi.qty * pos.ingredient_factor(eoi.ingredient_id, eoi.unit_id)
        from order_item_extras e
        join order_items oi on oi.id = e.order_item_id and oi.org_id = e.org_id
        join extra_option_ingredients eoi on eoi.option_id = e.option_id
        join products ip on ip.id = eoi.ingredient_id and ip.track_stock
       where oi.order_id = p_order and oi.voided_at is null
    ) c group by c.pid having sum(c.q) > 0
  loop
    insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, ref_type, ref_id, source_key, occurred_at)
    values (o.org_id, v_loc, r.pid, 'sale', -r.q, 'order', o.id, 'order:' || o.id || ':' || r.pid, v_closed);
  end loop;

  select coalesce(-sum(total_cost), 0) into v_cogs
    from stock_movements where ref_type = 'order' and ref_id = o.id and kind = 'sale';

  -- debit: tiap akun metode bayar
  for r in
    select pm.account_id, sum(p.amount) as amt
      from payments p join payment_methods pm on pm.id = p.method_id and pm.org_id = p.org_id
     where p.order_id = o.id and p.status = 'succeeded' group by pm.account_id
  loop
    v_lines := v_lines || jsonb_build_object('account_id', r.account_id, 'debit', r.amt, 'memo', 'Pembayaran ' || o.number);
  end loop;
  if o.discount_total > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(o.org_id,'sales_discount'), 'debit', o.discount_total);
  end if;
  if o.rounding < 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(o.org_id,'rounding'), 'debit', -o.rounding);
  end if;
  -- kredit
  if o.subtotal > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(o.org_id,'sales_revenue'), 'credit', o.subtotal, 'memo', o.number);
  end if;
  if o.service_charge > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(o.org_id,'service_revenue'), 'credit', o.service_charge);
  end if;
  if o.tax_total > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(o.org_id,'tax_payable'), 'credit', o.tax_total);
  end if;
  if o.rounding > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(o.org_id,'rounding'), 'credit', o.rounding);
  end if;
  -- HPP
  if v_cogs > 0 then
    v_lines := v_lines
      || jsonb_build_object('account_id', pos.account_id(o.org_id,'cogs'), 'debit', v_cogs, 'memo', 'HPP ' || o.number)
      || jsonb_build_object('account_id', pos.account_id(o.org_id,'inventory'), 'credit', v_cogs, 'memo', 'HPP ' || o.number);
  end if;

  if jsonb_array_length(v_lines) >= 2 then
    perform pos.post_journal(o.org_id, o.outlet_id, v_date, 'SAL', 'Penjualan ' || o.number,
                             'sale', o.id, 'order:' || o.id || ':sale', v_lines);
  end if;
  update orders set finalized_at = now() where id = o.id;
end $$;

-- Pekerjaan berkala: order lunas yang belum terbukukan (misal periode terkunci sempat menolak)
create or replace function pos.finalize_pending_orders(p_limit int default 200) returns int
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare r record; n int := 0;
begin
  for r in select id from orders where status = 'paid' and finalized_at is null order by closed_at limit p_limit loop
    begin
      perform pos.finalize_order(r.id); n := n + 1;
    exception when others then
      insert into activity_logs(org_id, action, entity, entity_id, detail)
      select org_id, 'order.finalize_failed', 'order', id, jsonb_build_object('error', sqlerrm) from orders where id = r.id;
    end;
  end loop;
  return n;
end $$;

-- Kas masuk/keluar di laci kasir
create or replace function pos.post_cash_movement(p_id uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare m cash_movements%rowtype; s shifts%rowtype; st outlet_settings%rowtype;
        v_cash uuid; v_other uuid; v_day_out numeric; v_date date;
begin
  select * into m from cash_movements where id = p_id;
  select * into s from shifts where id = m.shift_id and org_id = m.org_id;
  select * into st from outlet_settings where outlet_id = s.outlet_id;
  v_cash := pos.cash_account(m.org_id);
  if v_cash is null then raise exception 'no active cash payment method'; end if;
  if st.require_cash_photo and m.photo_path is null then raise exception 'cash movement needs a photo'; end if;
  v_date := pos.open_book_date(m.org_id, pos.book_date(s.outlet_id, m.occurred_at));
  if m.kind = 'out' and st.cash_out_daily_limit is not null then
    select coalesce(sum(cm.amount), 0) into v_day_out
      from cash_movements cm join shifts sh on sh.id = cm.shift_id and sh.org_id = cm.org_id
     where sh.outlet_id = s.outlet_id and cm.kind = 'out'
       and pos.book_date(s.outlet_id, cm.occurred_at) = pos.book_date(s.outlet_id, m.occurred_at);
    if v_day_out > st.cash_out_daily_limit then
      raise exception 'daily cash-out limit % exceeded (% so far)', st.cash_out_daily_limit, v_day_out;
    end if;
  end if;
  if m.kind = 'in' then
    v_other := coalesce(m.account_id, pos.account_id(m.org_id, 'cash_in_other'));
    perform pos.post_journal(m.org_id, s.outlet_id, v_date, 'CSH', 'Kas masuk: ' || m.reason, 'cash_movement', m.id, 'cashmove:' || m.id,
      jsonb_build_array(jsonb_build_object('account_id', v_cash, 'debit', m.amount),
                        jsonb_build_object('account_id', v_other, 'credit', m.amount)));
  else
    v_other := coalesce(m.account_id, pos.account_id(m.org_id, 'cash_out_expense'));
    perform pos.post_journal(m.org_id, s.outlet_id, v_date, 'CSH', 'Kas keluar: ' || m.reason, 'cash_movement', m.id, 'cashmove:' || m.id,
      jsonb_build_array(jsonb_build_object('account_id', v_other, 'debit', m.amount),
                        jsonb_build_object('account_id', v_cash, 'credit', m.amount)));
  end if;
end $$;

-- Rekonsiliasi satu baris: uang masuk sebenarnya vs yang dicatat. Selisih masuk akun selisih rekonsiliasi.
create or replace function pos.reconcile(p_recon uuid, p_actual numeric, p_fee numeric, p_bank uuid, p_by uuid, p_settlement uuid default null)
returns uuid language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare r reconciliations%rowtype; v_clear uuid; v_diff numeric; v_lines jsonb; v_je uuid; v_date date;
begin
  select * into r from reconciliations where id = p_recon for update;
  if not found then raise exception 'reconciliation not found'; end if;
  if r.status = 'reconciled' then return r.journal_entry_id; end if;
  select account_id into v_clear from payment_methods where id = r.method_id;
  v_diff := r.expected_amount - p_actual - coalesce(p_fee, 0);       -- >0 : uang kurang (rugi)
  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', p_bank, 'debit', p_actual),
    jsonb_build_object('account_id', v_clear, 'credit', r.expected_amount));
  if coalesce(p_fee, 0) > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(r.org_id,'gateway_fee_expense'), 'debit', p_fee);
  end if;
  if v_diff > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(r.org_id,'reconciliation_diff'), 'debit', v_diff);
  elsif v_diff < 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(r.org_id,'reconciliation_diff'), 'credit', -v_diff);
  end if;
  -- baris dengan debit 0 dibuang
  v_lines := (select coalesce(jsonb_agg(e), '[]') from jsonb_array_elements(v_lines) e
               where coalesce((e->>'debit')::numeric,0) + coalesce((e->>'credit')::numeric,0) > 0);
  v_date := pos.open_book_date(r.org_id, pos.book_date(r.outlet_id, now()));
  v_je := pos.post_journal(r.org_id, r.outlet_id, v_date, 'REC', 'Rekonsiliasi ' || r.number,
                           'reconciliation', r.id, 'recon:' || r.id, v_lines);
  update reconciliations set actual_amount = p_actual, fee_amount = coalesce(p_fee,0), difference = v_diff,
         status = 'reconciled', bank_account_id = p_bank, settlement_id = p_settlement,
         journal_entry_id = v_je, reconciled_at = now(), reconciled_by = p_by
   where id = r.id;
  return v_je;
end $$;

-- Tutup kasir: hitung kas seharusnya, catat selisih, buat baris rekonsiliasi non-tunai.
create or replace function pos.close_shift(p_shift uuid, p_closed_by uuid, p_counted numeric, p_closed_at timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare s shifts%rowtype; v_cash_pay numeric; v_in numeric; v_out numeric; v_ref numeric; v_expected numeric;
        v_var numeric; v_cash uuid; v_date date; m record; v_num bigint; v_rec uuid; st outlets%rowtype;
begin
  select * into s from shifts where id = p_shift for update;
  if not found then raise exception 'shift not found'; end if;
  if s.status = 'closed' then return; end if;
  select * into st from outlets where id = s.outlet_id;

  select coalesce(sum(p.amount),0) into v_cash_pay
    from payments p join payment_methods pm on pm.id = p.method_id and pm.org_id = p.org_id
   where p.shift_id = s.id and p.status = 'succeeded' and pm.kind = 'cash';
  select coalesce(sum(amount) filter (where kind = 'in'),0), coalesce(sum(amount) filter (where kind = 'out'),0)
    into v_in, v_out from cash_movements where shift_id = s.id;
  select coalesce(sum(rf.total),0) into v_ref
    from refunds rf join payment_methods pm on pm.id = rf.method_id and pm.org_id = rf.org_id
   where rf.shift_id = s.id and pm.kind = 'cash' and rf.status = 'completed';

  v_expected := s.opening_cash + v_cash_pay + v_in - v_out - v_ref;
  v_var := p_counted - v_expected;
  update shifts set status = 'closed', closed_at = p_closed_at, closed_by = p_closed_by,
         closing_cash_counted = p_counted, expected_cash = v_expected, cash_variance = v_var,
         note = coalesce(p_note, note)
   where id = s.id;

  if v_var <> 0 then
    v_cash := pos.cash_account(s.org_id);
    v_date := pos.open_book_date(s.org_id, pos.book_date(s.outlet_id, p_closed_at));
    perform pos.post_journal(s.org_id, s.outlet_id, v_date, 'SHF', 'Selisih kas shift',
      'shift_close', s.id, 'shift:' || s.id || ':variance',
      case when v_var < 0
        then jsonb_build_array(jsonb_build_object('account_id', pos.account_id(s.org_id,'cash_over_short'), 'debit', -v_var),
                               jsonb_build_object('account_id', v_cash, 'credit', -v_var))
        else jsonb_build_array(jsonb_build_object('account_id', v_cash, 'debit', v_var),
                               jsonb_build_object('account_id', pos.account_id(s.org_id,'cash_over_short'), 'credit', v_var))
      end);
  end if;

  -- baris rekonsiliasi per metode non-tunai
  for m in
    select pm.id as method_id, pm.kind, sum(p.amount) as amt
      from payments p join payment_methods pm on pm.id = p.method_id and pm.org_id = p.org_id
     where p.shift_id = s.id and p.status = 'succeeded' and pm.kind in ('noncash','gateway')
     group by pm.id, pm.kind
  loop
    v_num := pos.next_doc_number(s.org_id, 'REC', 0);
    insert into reconciliations(org_id, outlet_id, shift_id, method_id, number, expected_amount)
    values (s.org_id, s.outlet_id, s.id, m.method_id, 'REC-' || lpad(v_num::text, 6, '0'), m.amt)
    returning id into v_rec;
    -- metode gateway hanya direkonsiliasi lewat laporan settlement DOKU
    if st.auto_reconcile_noncash and m.kind = 'noncash' then
      perform pos.reconcile(v_rec, m.amt, 0, pos.account_id(s.org_id,'bank_main'), p_closed_by);
    end if;
  end loop;
end $$;

-- Refund: jurnal balik pendapatan + (opsional) barang kembali ke stok
create or replace function pos.post_refund(p_refund uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare rf refunds%rowtype; o orders%rowtype; pm payment_methods%rowtype; v_tax numeric; v_date date; v_lines jsonb;
        ri record; c record; v_loc uuid; v_cost numeric := 0; v_avg numeric;
begin
  select * into rf from refunds where id = p_refund for update;
  select * into o from orders where id = rf.order_id;
  select * into pm from payment_methods where id = rf.method_id;
  if o.finalized_at is null then perform pos.finalize_order(o.id); end if;
  v_date := pos.open_book_date(rf.org_id, pos.book_date(rf.outlet_id, rf.created_at));
  v_tax := case when o.total > 0 then round(rf.total * o.tax_total / o.total, 2) else 0 end;
  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', pos.account_id(rf.org_id,'sales_returns'), 'debit', rf.total - v_tax),
    jsonb_build_object('account_id', pm.account_id, 'credit', rf.total));
  if v_tax > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(rf.org_id,'tax_payable'), 'debit', v_tax);
  end if;

  if rf.restock then
    v_loc := pos.outlet_location(rf.outlet_id);
    for ri in
      select oi.product_id as pid, r2.qty * pu.conversion as base_qty
        from refund_items r2
        join order_items oi on oi.id = r2.order_item_id and oi.org_id = r2.org_id
        join product_units pu on pu.id = oi.product_unit_id
       where r2.refund_id = rf.id
    loop
      for c in select * from pos.sale_components(ri.pid, ri.base_qty) loop
        select coalesce(avg_cost, 0) into v_avg from stock_balances where location_id = v_loc and product_id = c.component_id;
        insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, ref_type, ref_id, source_key)
        values (rf.org_id, v_loc, c.component_id, 'refund_return', c.component_qty, coalesce(v_avg,0), 'refund', rf.id,
                'refund:' || rf.id || ':' || c.component_id || ':' || ri.pid)
        on conflict do nothing;
      end loop;
    end loop;
    select coalesce(sum(total_cost),0) into v_cost from stock_movements where ref_type = 'refund' and ref_id = rf.id;
    if v_cost > 0 then
      v_lines := v_lines
        || jsonb_build_object('account_id', pos.account_id(rf.org_id,'inventory'), 'debit', v_cost)
        || jsonb_build_object('account_id', pos.account_id(rf.org_id,'cogs'), 'credit', v_cost);
    end if;
  end if;
  perform pos.post_journal(rf.org_id, rf.outlet_id, v_date, 'RFN', 'Refund ' || rf.number, 'refund', rf.id, 'refund:' || rf.id, v_lines);
  update refunds set status = 'completed' where id = rf.id;
end $$;

---------------------------------------------------------------------------------------------------
-- DOKU: dipanggil oleh rute server (service role). Tidak pernah oleh aplikasi POS.
---------------------------------------------------------------------------------------------------
-- Catat notifikasi masuk. Mengembalikan id baru, atau null bila notifikasi sama sudah pernah diterima.
create or replace function pos.record_gateway_event(
  p_provider text, p_dedupe text, p_external_id text, p_partner_ref text, p_latest_status text,
  p_headers jsonb, p_body jsonb, p_sig_valid boolean) returns uuid
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v uuid; v_org uuid;
begin
  select org_id into v_org from gateway_transactions where provider = p_provider and partner_reference_no = p_partner_ref;
  insert into gateway_events(org_id, provider, dedupe_key, external_id, partner_reference_no, latest_status, headers, body, signature_valid)
  values (v_org, p_provider, p_dedupe, p_external_id, p_partner_ref, p_latest_status, coalesce(p_headers,'{}'), p_body, p_sig_valid)
  on conflict (provider, dedupe_key) do nothing returning id into v;
  return v;
end $$;

-- Tandai transaksi gateway lunas (setelah server memastikan lewat query status DOKU).
-- Hasil: 'paid' | 'already_paid' | 'amount_mismatch' | 'late_payment_needs_review'
create or replace function pos.gateway_mark_paid(
  p_partner_ref text, p_reference_no text, p_rrn text, p_amount numeric, p_paid_at timestamptz, p_fee numeric default null)
returns text language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare g gateway_transactions%rowtype; pay payments%rowtype; o orders%rowtype;
begin
  select * into g from gateway_transactions where partner_reference_no = p_partner_ref for update;
  if not found then raise exception 'unknown partner reference %', p_partner_ref; end if;
  if g.status = 'paid' then return 'already_paid'; end if;
  if p_amount <> g.amount then
    insert into activity_logs(org_id, outlet_id, action, entity, entity_id, detail)
    values (g.org_id, g.outlet_id, 'gateway.amount_mismatch', 'gateway_transaction', g.id,
            jsonb_build_object('expected', g.amount, 'reported', p_amount));
    return 'amount_mismatch';
  end if;
  select * into pay from payments where id = g.payment_id for update;
  select * into o from orders where id = pay.order_id for update;

  update gateway_transactions set status = 'paid', paid_at = p_paid_at, reference_no = coalesce(p_reference_no, reference_no),
         rrn = p_rrn, fee_amount = coalesce(p_fee, fee_amount), next_check_at = null where id = g.id;

  -- pembayaran terlambat: QR sudah kami batalkan, tetapi uang tetap masuk
  if pay.status in ('cancelled','failed') or o.status = 'void' or (o.total - o.paid_total) < pay.amount then
    insert into activity_logs(org_id, outlet_id, action, entity, entity_id, detail)
    values (g.org_id, g.outlet_id, 'gateway.late_payment', 'gateway_transaction', g.id,
            jsonb_build_object('order_id', o.id, 'amount', g.amount, 'payment_status', pay.status, 'order_status', o.status));
    return 'late_payment_needs_review';
  end if;

  update payments set status = 'succeeded', paid_at = p_paid_at, reference = coalesce(p_reference_no, reference) where id = pay.id;
  if (select status from orders where id = o.id) = 'paid' then
    begin perform pos.finalize_order(o.id);
    exception when others then
      insert into activity_logs(org_id, outlet_id, action, entity, entity_id, detail)
      values (o.org_id, o.outlet_id, 'order.finalize_failed', 'order', o.id, jsonb_build_object('error', sqlerrm));
    end;
  end if;
  return 'paid';
end $$;

-- Kedaluwarsakan transaksi QR hanya bila status sudah diperiksa SETELAH waktu kedaluwarsa dan masih belum lunas.
create or replace function pos.gateway_expire_due() returns int
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare r record; n int := 0;
begin
  for r in select id, payment_id from gateway_transactions
            where status in ('created','pending') and expires_at < now() and last_checked_at > expires_at for update skip locked
  loop
    update gateway_transactions set status = 'expired', next_check_at = null where id = r.id;
    update payments set status = 'cancelled', failure_reason = 'qr_expired' where id = r.payment_id and status = 'pending';
    n := n + 1;
  end loop;
  return n;
end $$;

-- Terapkan laporan settlement: pindahkan saldo perantara ke bank, catat biaya, tutup baris rekonsiliasi gateway.
create or replace function pos.apply_settlement(p_settlement uuid) returns uuid
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare s gateway_settlements%rowtype; v_lines jsonb := '[]'::jsonb; r record; v_je uuid; v_date date; v_sum numeric := 0;
begin
  select * into s from gateway_settlements where id = p_settlement for update;
  if not found then raise exception 'settlement not found'; end if;
  if s.journal_entry_id is not null then return s.journal_entry_id; end if;
  if s.bank_account_id is null then raise exception 'settlement needs a bank account'; end if;
  for r in
    select pm.account_id, sum(l.amount) as amt
      from gateway_settlement_lines l
      join gateway_transactions g on g.id = l.gateway_transaction_id and g.org_id = l.org_id
      join payments p on p.id = g.payment_id and p.org_id = g.org_id
      join payment_methods pm on pm.id = p.method_id and pm.org_id = p.org_id
     where l.settlement_id = s.id group by pm.account_id
  loop
    v_lines := v_lines || jsonb_build_object('account_id', r.account_id, 'credit', r.amt);
    v_sum := v_sum + r.amt;
  end loop;
  if v_sum <> s.gross_amount then
    raise exception 'settlement lines (%) do not add up to gross (%)', v_sum, s.gross_amount;
  end if;
  v_lines := v_lines || jsonb_build_object('account_id', s.bank_account_id, 'debit', s.net_amount);
  if s.fee_total > 0 then
    v_lines := v_lines || jsonb_build_object('account_id', pos.account_id(s.org_id,'gateway_fee_expense'), 'debit', s.fee_total);
  end if;
  v_date := pos.open_book_date(s.org_id, s.settlement_date);
  v_je := pos.post_journal(s.org_id, null, v_date, 'STL', 'Settlement DOKU ' || coalesce(s.reference,''),
                           'settlement', s.id, 'settlement:' || s.id, v_lines);
  update gateway_settlements set status = 'settled', journal_entry_id = v_je where id = s.id;

  -- baris rekonsiliasi gateway yang seluruh transaksinya sudah ter-settle
  update reconciliations rc set status = 'reconciled', actual_amount = rc.expected_amount, difference = 0,
         bank_account_id = s.bank_account_id, settlement_id = s.id, journal_entry_id = v_je, reconciled_at = now()
   where rc.org_id = s.org_id and rc.status = 'unreconciled'
     and exists (select 1 from payment_methods pm where pm.id = rc.method_id and pm.kind = 'gateway')
     and exists (select 1 from gateway_settlement_lines l
                  join gateway_transactions g on g.id = l.gateway_transaction_id
                  join payments p on p.id = g.payment_id
                 where l.settlement_id = s.id and p.shift_id = rc.shift_id and p.method_id = rc.method_id)
     and not exists (select 1 from payments p
                      join gateway_transactions g on g.payment_id = p.id and p.status = 'succeeded'
                     where p.shift_id = rc.shift_id and p.method_id = rc.method_id
                       and not exists (select 1 from gateway_settlement_lines l2 where l2.gateway_transaction_id = g.id));
  return v_je;
end $$;


commit;
