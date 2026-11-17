-- CG POS · 0151_clear_unavailable_adjust_in
-- 0150 lupa jenis 'adjust_in' (Stok masuk manual dari dashboard, pos.stock_post 0014) pada daftar gerakan yang mengisi stok dan menghapus penanda habis.
create or replace function pos.clear_unavailable_on_restock() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  if new.qty_delta > 0 and new.kind in ('purchase_receipt', 'transfer_in', 'production_in', 'opening', 'opname_adjust', 'adjust_in') then
    delete from ingredient_unavailable u
     using locations l
     where l.id = new.location_id and l.outlet_id is not null and u.outlet_id = l.outlet_id and u.product_id = new.product_id;
  end if;
  return null;
end $$;
