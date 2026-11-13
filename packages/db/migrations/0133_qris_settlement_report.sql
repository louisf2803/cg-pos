-- CG POS · 0133_qris_settlement_report
-- Laporan transaksi QRIS/gateway untuk dashboard (A133): daftar transaksi dengan biaya dan tanggal settlement. Hanya membaca, tanpa memanggil
-- penyedia pembayaran. Tabel gateway tidak dibuka ke klien (berisi log dan rujukan rahasia); fungsi ini hanya mengeluarkan kolom aman.
create or replace function pos.gateway_transactions_report(p_org uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'invalid range'; end if;
  if p_to - p_from > interval '1100 days' then raise exception 'range too long'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'outlet_name', o.name, 'reference', t.partner_reference_no, 'amount', t.amount,
      'fee', coalesce(t.fee_amount, 0) + coalesce(t.convenience_fee, 0), 'status', t.status,
      'created_at', t.created_at, 'paid_at', t.paid_at,
      'settlement_date', s.settlement_date, 'settlement_status', s.status
    ) order by t.created_at desc)
    from (select * from gateway_transactions where org_id = p_org and created_at >= p_from and created_at < p_to order by created_at desc limit 1000) t
    join outlets o on o.id = t.outlet_id and o.org_id = t.org_id
    left join gateway_settlement_lines l on l.gateway_transaction_id = t.id
    left join gateway_settlements s on s.id = l.settlement_id and s.org_id = l.org_id
  ), '[]'::jsonb);
end $$;
revoke all on function pos.gateway_transactions_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function pos.gateway_transactions_report(uuid, timestamptz, timestamptz) to authenticated, service_role;
