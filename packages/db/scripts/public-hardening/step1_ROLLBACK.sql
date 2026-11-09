-- Kembalikan langkah 1 persis seperti keadaan awal (RLS mati, anon boleh semuanya).
do $$
declare t text;
begin
  foreach t in array array['menus','categories','ingredients','ingredient_categories','menu_ingredients',
                           'prepared_items','prepared_ingredients','app_settings','indomie_paket_config'] loop
    execute format('drop policy if exists cg_baca_saja on public.%I', t);
    execute format('alter table public.%I disable row level security', t);
    execute format('grant insert, update, delete, truncate on public.%I to anon, authenticated', t);
  end loop;
end $$;
