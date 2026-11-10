-- CG POS · 0014_stock_manual
-- Stok masuk, stok keluar, dan barang terbuang dari dashboard. stock_movements hanya bisa ditulis lewat fungsi,
-- jadi ditambah satu fungsi `pos.stock_post` (khusus pemilik/manajer) dan dua jenis gerakan baru: adjust_in, adjust_out.
--   * rata-rata biaya tetap dihitung trigger stock_movement_apply (tidak diubah)
--   * stok boleh negatif (keputusan 9 Nov 2026): keluar melebihi saldo tidak ditolak
--   * kunci idempotensi (p_key) mencegah pengiriman ganda saat jaringan ulang
begin;

alter table stock_movements drop constraint stock_movements_kind_check;
alter table stock_movements add constraint stock_movements_kind_check check (kind in (
  'sale','sale_void','refund_return','purchase_receipt','purchase_return',
  'transfer_out','transfer_in','waste','production_in','production_out','opname_adjust','opening','adjust_in','adjust_out'));
alter table stock_movements add constraint stock_movements_manual_sign check (
  (kind <> 'adjust_in' or qty_delta > 0) and (kind <> 'adjust_out' or qty_delta < 0));

create or replace function pos.stock_post(
  p_location uuid, p_product uuid, p_kind text, p_qty numeric, p_unit_cost numeric, p_reason text, p_key text
) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare l locations%rowtype; pr products%rowtype; v_key text; v_delta numeric; v_cost numeric; b stock_balances%rowtype; v_id uuid; v_dup boolean := false;
begin
  select * into l from locations where id = p_location and is_active;
  if not found then raise exception 'location not found'; end if;
  if not pos.can_manage(l.org_id) then raise exception 'not allowed'; end if;
  if p_kind is null or p_kind not in ('adjust_in', 'adjust_out', 'waste') then raise exception 'kind must be adjust_in, adjust_out or waste'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 1000000000 or p_qty <> round(p_qty, 4) then raise exception 'qty must be positive, at most 4 decimals'; end if;
  select * into pr from products where id = p_product and org_id = l.org_id and deleted_at is null;
  if not found then raise exception 'product not found'; end if;
  if pr.kind not in ('goods', 'ingredient') or not pr.track_stock then raise exception 'product does not track stock'; end if;
  if p_reason is not null and length(p_reason) > 200 then raise exception 'reason too long'; end if;
  if p_unit_cost is not null and (p_unit_cost < 0 or p_unit_cost > 1000000000) then raise exception 'unit cost out of range'; end if;

  v_key := case when p_key is null or p_key = '' then null else 'manual:' || p_key end;
  if v_key is not null and exists (select 1 from stock_movements where org_id = l.org_id and source_key = v_key) then
    v_dup := true;
  else
    v_delta := case when p_kind = 'adjust_in' then p_qty else -p_qty end;
    -- tanpa harga: pakai rata-rata saat ini, jadi menambah stok tidak menggeser HPP
    select * into b from stock_balances where location_id = l.id and product_id = pr.id;
    v_cost := case when p_kind = 'adjust_in' then coalesce(p_unit_cost, b.avg_cost, 0) else 0 end;
    insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, ref_type, source_key, reason, created_by)
    values (l.org_id, l.id, pr.id, p_kind, v_delta, v_cost, 'manual', v_key, nullif(trim(coalesce(p_reason, '')), ''), auth.uid())
    returning id into v_id;
  end if;
  select * into b from stock_balances where location_id = l.id and product_id = pr.id;
  return jsonb_build_object('movement_id', v_id, 'duplicate', v_dup, 'qty', coalesce(b.qty, 0), 'avg_cost', coalesce(b.avg_cost, 0));
end $$;
revoke all on function pos.stock_post(uuid, uuid, text, numeric, numeric, text, text) from public, anon;
grant execute on function pos.stock_post(uuid, uuid, text, numeric, numeric, text, text) to authenticated, service_role;

commit;
