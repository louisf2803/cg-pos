-- Langkah 1 (diterapkan 2026-11-09 sebagai migrasi public_step1_readonly_catalog_tables).
-- Tabel katalog/pengaturan Coffee Ground jadi baca-saja untuk anon dan authenticated.
do $$
declare t text;
begin
  foreach t in array array['menus','categories','ingredients','ingredient_categories','menu_ingredients',
                           'prepared_items','prepared_ingredients','app_settings','indomie_paket_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists cg_baca_saja on public.%I', t);
    execute format('create policy cg_baca_saja on public.%I for select to anon, authenticated using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;
