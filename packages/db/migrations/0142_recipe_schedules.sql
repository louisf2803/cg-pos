-- CG POS · 0142_recipe_schedules
-- Penjadwalan perubahan resep (A135): resep baru berlaku pada tanggal dan jam tertentu, bukan langsung.
--   * pos.recipe_schedules       : antrean perubahan (pending, applied, cancelled, failed). Hanya dibaca pengelola; ditulis lewat fungsi di bawah.
--   * pos.recipe_schedule_save   : jadwalkan resep baru satu produk (pemilik/admin/manajer). Waktu harus di masa depan; isi diperiksa seperti recipe_save.
--   * pos.recipe_schedule_cancel : batalkan jadwal yang belum berjalan.
--   * pos.recipe_apply_due       : terapkan semua jadwal yang waktunya sudah tiba (resep lama diganti seluruhnya, atomik per jadwal; satu jadwal
--                                  gagal tidak menghentikan yang lain, statusnya jadi failed beserta alasannya). Dijalankan pg_cron tiap menit di Supabase.
-- Penjualan sebelum waktu berlaku memakai resep lama, sesudahnya resep baru (resep dibaca saat penjualan dibukukan).

create table pos.recipe_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  product_id uuid not null,
  effective_at timestamptz not null,
  lines jsonb not null,
  note text check (note is null or char_length(note) <= 200),
  status text not null default 'pending' check (status in ('pending', 'applied', 'cancelled', 'failed')),
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (id, org_id),
  foreign key (product_id, org_id) references pos.products(id, org_id) on delete cascade
);
create index recipe_schedules_due on pos.recipe_schedules (effective_at) where status = 'pending';
create index recipe_schedules_org on pos.recipe_schedules (org_id, effective_at desc);

alter table pos.recipe_schedules enable row level security;
create policy sel on pos.recipe_schedules for select to authenticated using (pos.can_manage(org_id));
revoke all on pos.recipe_schedules from anon;
grant select on pos.recipe_schedules to authenticated;
grant all on pos.recipe_schedules to service_role;

-- pemeriksaan isi resep yang sama dengan recipe_save; mengembalikan jumlah baris atau melempar galat
create or replace function pos._recipe_lines_check(p_lines jsonb) returns integer
language plpgsql immutable set search_path = pos, extensions, pg_temp as $$
declare r record; seen uuid[] := '{}';
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be an array'; end if;
  if jsonb_array_length(p_lines) > 60 then raise exception 'too many recipe lines'; end if;
  for r in select (e->>'ingredient_id')::uuid as ing, (e->>'qty')::numeric as qty, (e->>'unit_id')::uuid as unit from jsonb_array_elements(p_lines) e loop
    if r.ing is null or r.unit is null then raise exception 'recipe line needs ingredient and unit'; end if;
    if r.qty is null or r.qty <= 0 then raise exception 'recipe qty must be positive'; end if;
    if r.qty <> round(r.qty, 4) then raise exception 'recipe qty has too many decimals'; end if;
    if r.ing = any(seen) then raise exception 'duplicate ingredient in recipe'; end if;
    seen := seen || r.ing;
  end loop;
  return jsonb_array_length(p_lines);
end $$;
revoke all on function pos._recipe_lines_check(jsonb) from public, anon, authenticated;

create or replace function pos.recipe_schedule_save(p_product uuid, p_effective_at timestamptz, p_lines jsonb, p_note text default null) returns uuid
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select org_id into v_org from pos.products where id = p_product and deleted_at is null;
  if not found then raise exception 'product not found'; end if;
  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  if p_effective_at is null or p_effective_at <= now() then raise exception 'effective time must be in the future'; end if;
  perform pos._recipe_lines_check(p_lines);
  if p_note is not null and char_length(p_note) > 200 then raise exception 'note too long'; end if;
  insert into pos.recipe_schedules(org_id, product_id, effective_at, lines, note, created_by)
  values (v_org, p_product, p_effective_at, p_lines, nullif(btrim(coalesce(p_note, '')), ''), auth.uid()) returning id into v_id;
  return v_id;
end $$;
revoke all on function pos.recipe_schedule_save(uuid, timestamptz, jsonb, text) from public, anon;
grant execute on function pos.recipe_schedule_save(uuid, timestamptz, jsonb, text) to authenticated, service_role;

create or replace function pos.recipe_schedule_cancel(p_id uuid) returns boolean
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_n int;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  select org_id into v_org from pos.recipe_schedules where id = p_id;
  if not found then return false; end if;
  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  update pos.recipe_schedules set status = 'cancelled' where id = p_id and status = 'pending';
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
revoke all on function pos.recipe_schedule_cancel(uuid) from public, anon;
grant execute on function pos.recipe_schedule_cancel(uuid) to authenticated, service_role;

create or replace function pos.recipe_apply_due() returns integer
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare s record; r record; v_done int := 0; v_name text; v_old text; v_new text;
begin
  for s in select * from pos.recipe_schedules where status = 'pending' and effective_at <= now() order by effective_at, created_at for update skip locked loop
    begin
      select name into v_name from pos.products where id = s.product_id and org_id = s.org_id and deleted_at is null;
      if v_name is null then raise exception 'product not found'; end if;
      select string_agg(i.name || ' ' || trim_scale(rl.qty)::text || ' ' || u.name, ', ' order by i.name, rl.id) into v_old
        from pos.recipe_lines rl join pos.products i on i.id = rl.ingredient_id join pos.units u on u.id = rl.unit_id where rl.product_id = s.product_id;
      delete from pos.recipe_lines where product_id = s.product_id;
      for r in select (e->>'ingredient_id')::uuid as ing, (e->>'qty')::numeric as qty, (e->>'unit_id')::uuid as unit from jsonb_array_elements(s.lines) e loop
        insert into pos.recipe_lines(org_id, product_id, ingredient_id, qty, unit_id) values (s.org_id, s.product_id, r.ing, r.qty, r.unit);
      end loop;
      select string_agg(i.name || ' ' || trim_scale(rl.qty)::text || ' ' || u.name, ', ' order by i.name, rl.id) into v_new
        from pos.recipe_lines rl join pos.products i on i.id = rl.ingredient_id join pos.units u on u.id = rl.unit_id where rl.product_id = s.product_id;
      insert into pos.activity_logs(org_id, outlet_id, actor_user_id, action, entity, entity_id, detail)
      values (s.org_id, null, s.created_by, 'recipe.updated', 'recipe', s.product_id,
              jsonb_build_object('name', v_name, 'scheduled', true, 'changes', jsonb_build_object('lines', jsonb_build_array(to_jsonb(left(v_old, 200)), to_jsonb(left(v_new, 200))))));
      update pos.recipe_schedules set status = 'applied', applied_at = now(), error = null where id = s.id;
      v_done := v_done + 1;
    exception when others then
      -- jadwal ini gagal (mis. bahan dihapus, satuan tak punya konversi): sub-transaksi dibatalkan sehingga resep lama utuh; tandai gagal dan lanjut
      update pos.recipe_schedules set status = 'failed', error = left(sqlerrm, 200), applied_at = now() where id = s.id;
    end;
  end loop;
  return v_done;
end $$;
revoke all on function pos.recipe_apply_due() from public, anon, authenticated;
grant execute on function pos.recipe_apply_due() to service_role;

-- penjadwal: tiap menit di Supabase (pg_cron). Di database lokal/tes ekstensi tidak ada, jadi dilewati.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron tidak tersedia, penjadwal resep dilewati';
    return;
  end if;
  create extension if not exists pg_cron;
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'cgpos-recipe-apply-due';
    perform cron.schedule('cgpos-recipe-apply-due', '* * * * *', 'select pos.recipe_apply_due()');
  end if;
exception when others then
  raise notice 'penjadwal resep tidak dipasang: %', sqlerrm;
end $$;
