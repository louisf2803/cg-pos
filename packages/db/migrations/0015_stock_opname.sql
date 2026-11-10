-- CG POS · 0015_stock_opname
-- Stok opname: hitung fisik, simpan sebagai draf, lalu selesaikan. Menyelesaikan opname menulis gerakan 'opname_adjust'
-- sebesar selisih (jumlah fisik - jumlah sistem saat dihitung), jadi penjualan yang terjadi di antara hitung dan selesai tidak ikut dikoreksi dua kali.
--   * pos.stock_opname_save     : buat atau ubah draf (pemilik/manajer); nomor OPN-000001 dari urutan dokumen
--   * pos.stock_opname_finalize : selesaikan draf; sekali jalan, idempoten lewat kunci gerakan
--   * opname yang sudah final tidak bisa diubah atau dihapus, dan status final hanya bisa dicapai lewat fungsi di atas
begin;

create or replace function pos.stock_opname_guard() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_final boolean;
begin
  if tg_table_name = 'stock_opnames' then
    if tg_op = 'DELETE' then
      if old.status = 'final' and exists (select 1 from orgs where id = old.org_id) then raise exception 'finalized opname is read-only'; end if;
      return old;
    end if;
    if old.status = 'final' then raise exception 'finalized opname is read-only'; end if;
    if new.status = 'final' and coalesce(current_setting('pos.opname_finalizing', true), '') <> old.id::text then
      raise exception 'an opname can only be finalized with stock_opname_finalize';
    end if;
    return new;
  end if;
  -- baris hitung
  select exists (select 1 from stock_opnames where id = coalesce(new.opname_id, old.opname_id) and status = 'final') into v_final;
  if v_final then raise exception 'finalized opname is read-only'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function pos.stock_opname_guard() from public, anon, authenticated;
drop trigger if exists stock_opnames_guard on stock_opnames;
create trigger stock_opnames_guard before update or delete on stock_opnames for each row execute function pos.stock_opname_guard();
drop trigger if exists stock_opname_lines_guard on stock_opname_lines;
create trigger stock_opname_lines_guard before insert or update or delete on stock_opname_lines for each row execute function pos.stock_opname_guard();

create or replace function pos.stock_opname_save(p_id uuid, p_location uuid, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  l locations%rowtype; o stock_opnames%rowtype; ln jsonb; v_pid uuid; v_qty numeric; v_sys numeric; v_n int := 0; v_num bigint; v_seen uuid[] := '{}';
begin
  if p_id is null then raise exception 'id required'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be an array'; end if;
  if jsonb_array_length(p_lines) > 3000 then raise exception 'too many lines'; end if;
  select * into l from locations where id = p_location and is_active;
  if not found then raise exception 'location not found'; end if;
  if not pos.can_manage(l.org_id) then raise exception 'not allowed'; end if;

  select * into o from stock_opnames where id = p_id for update;
  if found then
    if o.org_id <> l.org_id or o.location_id <> l.id then raise exception 'opname belongs to another location'; end if;
    if o.status <> 'draft' then raise exception 'finalized opname is read-only'; end if;
    update stock_opnames set note = nullif(left(trim(coalesce(p_note, '')), 200), '') where id = o.id;
  else
    v_num := pos.next_doc_number(l.org_id, 'OPN', 0);
    insert into stock_opnames(id, org_id, location_id, number, note, created_by)
    values (p_id, l.org_id, l.id, 'OPN-' || lpad(v_num::text, 6, '0'), nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid())
    returning * into o;
  end if;

  for ln in select * from jsonb_array_elements(p_lines) loop
    v_pid := (ln->>'product_id')::uuid;
    v_qty := (ln->>'counted_qty')::numeric;
    if v_pid is null or v_qty is null or v_qty < 0 or v_qty > 1000000000 or v_qty <> round(v_qty, 4) then raise exception 'invalid line'; end if;
    if v_pid = any(v_seen) then raise exception 'duplicate product in lines'; end if;
    v_seen := v_seen || v_pid;
    if not exists (select 1 from products where id = v_pid and org_id = l.org_id and deleted_at is null and track_stock and kind in ('goods', 'ingredient')) then
      raise exception 'product does not track stock';
    end if;
    select coalesce(qty, 0) into v_sys from stock_balances where location_id = l.id and product_id = v_pid;
    insert into stock_opname_lines(opname_id, product_id, org_id, system_qty, counted_qty)
    values (o.id, v_pid, l.org_id, coalesce(v_sys, 0), v_qty)
    on conflict (opname_id, product_id) do update set counted_qty = excluded.counted_qty;   -- jumlah sistem tetap yang pertama dicatat
    v_n := v_n + 1;
  end loop;
  delete from stock_opname_lines where opname_id = o.id and not (product_id = any(v_seen));
  return jsonb_build_object('id', o.id, 'number', o.number, 'lines', v_n);
end $$;
revoke all on function pos.stock_opname_save(uuid, uuid, text, jsonb) from public, anon;
grant execute on function pos.stock_opname_save(uuid, uuid, text, jsonb) to authenticated, service_role;

create or replace function pos.stock_opname_finalize(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare o stock_opnames%rowtype; r record; v_avg numeric; v_n int := 0; v_total numeric := 0; v_cnt int;
begin
  select * into o from stock_opnames where id = p_id for update;
  if not found then raise exception 'opname not found'; end if;
  if not pos.can_manage(o.org_id) then raise exception 'not allowed'; end if;
  if o.status <> 'draft' then raise exception 'opname already finalized'; end if;
  select count(*) into v_cnt from stock_opname_lines where opname_id = o.id;
  if v_cnt = 0 then raise exception 'opname has no lines'; end if;
  perform set_config('pos.opname_finalizing', o.id::text, true);
  for r in select * from stock_opname_lines where opname_id = o.id and difference <> 0 order by product_id loop
    select coalesce(avg_cost, 0) into v_avg from stock_balances where location_id = o.location_id and product_id = r.product_id;
    insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, ref_type, ref_id, source_key, reason, created_by)
    values (o.org_id, o.location_id, r.product_id, 'opname_adjust', r.difference, case when r.difference > 0 then coalesce(v_avg, 0) else 0 end,
            'opname', o.id, 'opname:' || o.id || ':' || r.product_id, 'Opname ' || o.number, auth.uid());
    v_n := v_n + 1;
  end loop;
  select coalesce(sum(total_cost), 0) into v_total from stock_movements where ref_type = 'opname' and ref_id = o.id;
  update stock_opnames set status = 'final', finalized_at = now() where id = o.id;
  return jsonb_build_object('id', o.id, 'adjusted', v_n, 'value', v_total);
end $$;
revoke all on function pos.stock_opname_finalize(uuid) from public, anon;
grant execute on function pos.stock_opname_finalize(uuid) to authenticated, service_role;

commit;
