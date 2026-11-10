-- CG POS · 0022_recipe_save
-- Resep (BOM): bahan baku yang berkurang saat satu produk terjual.
--   * pos.recipe_lines_guard() : pemicu sebelum simpan. Produk harus barang jual atau bahan (bukan paket/jasa), bahan harus barang atau
--                                bahan, bukan dirinya sendiri, dan satuan yang dipilih HARUS punya konversi ke satuan dasar bahan.
--                                Tanpa ini satu resep salah membuat setiap penjualan produk itu gagal (pos.ingredient_factor menolak).
--   * pos.recipe_save()        : ganti seluruh resep satu produk secara atomik (pemilik/admin/manajer), tolak bahan kembar,
--                                jumlah lebih dari 4 desimal, dan lebih dari 60 baris; mencatat satu baris log aktivitas (entity 'recipe')
--                                berisi ringkasan bahan lama dan baru, bukan satu baris per bahan.
-- Tabel pos.recipe_lines sendiri tidak diubah; baris yang sudah ada tidak diperiksa ulang (hanya simpan baru atau ubah).
begin;

create or replace function pos.recipe_lines_guard() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_pk text; v_ik text;
begin
  select kind into v_pk from pos.products where id = new.product_id and org_id = new.org_id and deleted_at is null;
  select kind into v_ik from pos.products where id = new.ingredient_id and org_id = new.org_id and deleted_at is null;
  if v_pk is null then raise exception 'recipe product not found'; end if;
  if v_ik is null then raise exception 'recipe ingredient not found'; end if;
  if v_pk not in ('goods', 'ingredient') then raise exception 'recipe product kind % cannot have a recipe', v_pk; end if;
  if v_ik not in ('goods', 'ingredient') then raise exception 'recipe ingredient kind % is not allowed', v_ik; end if;
  if new.product_id = new.ingredient_id then raise exception 'recipe ingredient cannot be the product itself'; end if;
  perform pos.ingredient_factor(new.ingredient_id, new.unit_id);   -- galat bila satuan tak punya konversi
  return new;
end $$;
revoke all on function pos.recipe_lines_guard() from public, anon, authenticated;

create trigger trg_recipe_lines_guard before insert or update on pos.recipe_lines
  for each row execute function pos.recipe_lines_guard();

create or replace function pos.recipe_save(p_product uuid, p_lines jsonb) returns integer
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  v_org uuid; v_name text; v_old text; v_new text; v_n int := 0; r record;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select org_id, name into v_org, v_name from pos.products where id = p_product and deleted_at is null;
  if not found then raise exception 'product not found'; end if;
  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be an array'; end if;
  if jsonb_array_length(p_lines) > 60 then raise exception 'too many recipe lines'; end if;

  select string_agg(i.name || ' ' || trim_scale(rl.qty)::text || ' ' || u.name, ', ' order by i.name, rl.id) into v_old
    from pos.recipe_lines rl join pos.products i on i.id = rl.ingredient_id join pos.units u on u.id = rl.unit_id
   where rl.product_id = p_product;

  delete from pos.recipe_lines where product_id = p_product;
  for r in select (e->>'ingredient_id')::uuid as ing, (e->>'qty')::numeric as qty, (e->>'unit_id')::uuid as unit from jsonb_array_elements(p_lines) e loop
    if r.qty is null or r.qty <= 0 then raise exception 'recipe qty must be positive'; end if;
    if r.qty <> round(r.qty, 4) then raise exception 'recipe qty has too many decimals'; end if;
    insert into pos.recipe_lines(org_id, product_id, ingredient_id, qty, unit_id) values (v_org, p_product, r.ing, r.qty, r.unit);
    v_n := v_n + 1;
  end loop;

  select string_agg(i.name || ' ' || trim_scale(rl.qty)::text || ' ' || u.name, ', ' order by i.name, rl.id) into v_new
    from pos.recipe_lines rl join pos.products i on i.id = rl.ingredient_id join pos.units u on u.id = rl.unit_id
   where rl.product_id = p_product;
  if v_old is distinct from v_new then
    insert into pos.activity_logs(org_id, outlet_id, actor_user_id, action, entity, entity_id, detail)
    values (v_org, null, auth.uid(), 'recipe.updated', 'recipe', p_product,
            jsonb_build_object('name', v_name, 'changes', jsonb_build_object('lines', jsonb_build_array(to_jsonb(left(v_old, 200)), to_jsonb(left(v_new, 200))))));
  end if;
  return v_n;
end $$;
revoke all on function pos.recipe_save(uuid, jsonb) from public, anon;
grant execute on function pos.recipe_save(uuid, jsonb) to authenticated, service_role;

commit;
