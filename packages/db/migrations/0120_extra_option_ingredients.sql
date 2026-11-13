-- CG POS · 0120_extra_option_ingredients
-- Mengaktifkan RLS dan kebijakan akses untuk pos.extra_option_ingredients

alter table if exists pos.extra_option_ingredients enable row level security;
drop policy if exists sel on pos.extra_option_ingredients;
create policy sel on pos.extra_option_ingredients for select to authenticated using (pos.can_manage(org_id));
drop policy if exists ins on pos.extra_option_ingredients;
create policy ins on pos.extra_option_ingredients for insert to authenticated with check (pos.can_manage(org_id));
drop policy if exists upd on pos.extra_option_ingredients;
create policy upd on pos.extra_option_ingredients for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id));
drop policy if exists del on pos.extra_option_ingredients;
create policy del on pos.extra_option_ingredients for delete to authenticated using (pos.can_manage(org_id));

revoke all on pos.extra_option_ingredients from anon;
grant select, insert, update, delete on pos.extra_option_ingredients to authenticated;

