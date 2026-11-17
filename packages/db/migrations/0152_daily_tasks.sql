-- CG POS · 0152_daily_tasks
-- Tugas harian Opening dan Closing per outlet, dikerjakan bersama oleh satu tim lewat aplikasi karyawan, dan menjadi syarat Tutup kasir.
-- Keputusan Louis (17 Nov 2026): daftar tugas diatur manajer di backend dan BERBEDA PER OUTLET; tiap tugas hanya perlu dicentang atau wajib foto;
-- tugas yang tidak mungkin dikerjakan boleh ditandai "tidak bisa" dengan alasan (dianggap selesai); status sama untuk seluruh tim; foto tercatat atas nama pengunggah.
--  * task_templates : daftar tugas per outlet dan fase (opening/closing); ditulis pengelola (RLS), dibaca semua anggota.
--  * task_runs      : satu baris per outlet, hari lokal outlet, dan fase; dibuat lazimnya oleh task_run_ensure.
--  * task_items     : salinan tiap tugas untuk hari itu beserta status. Hanya berubah lewat fungsi (selesai, tidak bisa, buka lagi).
-- Gerbang: task_close_gate(outlet) mengembalikan tugas wajib yang belum selesai (hari ini, opening dan closing). Pemakainya kasir saat Tutup kasir.

create table pos.task_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid not null,
  phase text not null check (phase in ('opening', 'closing')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null check (kind in ('check', 'photo')),
  required boolean not null default true,
  allow_skip boolean not null default true,
  sort integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references pos.outlets(id, org_id) on delete cascade,
  unique (id, org_id)
);
create index task_templates_outlet on pos.task_templates (outlet_id, phase, sort);

create table pos.task_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid not null,
  run_date date not null,
  phase text not null check (phase in ('opening', 'closing')),
  created_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references pos.outlets(id, org_id) on delete cascade,
  unique (outlet_id, run_date, phase),
  unique (id, org_id)
);

create table pos.task_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  run_id uuid not null,
  template_id uuid,
  title text not null,
  kind text not null check (kind in ('check', 'photo')),
  required boolean not null default true,
  allow_skip boolean not null default true,
  sort integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  photo_path text,
  done_by_user uuid,
  done_by_employee uuid,
  done_at timestamptz,
  skip_reason text,
  foreign key (run_id, org_id) references pos.task_runs(id, org_id) on delete cascade,
  check (status <> 'skipped' or char_length(btrim(coalesce(skip_reason, ''))) > 0),
  check (status <> 'done' or kind <> 'photo' or photo_path is not null)
);
create index task_items_run on pos.task_items (run_id, sort);
create unique index task_items_run_template on pos.task_items (run_id, template_id) where template_id is not null;

alter table pos.task_templates enable row level security;
alter table pos.task_runs enable row level security;
alter table pos.task_items enable row level security;
create policy sel on pos.task_templates for select to authenticated using (org_id in (select pos.user_org_ids()));
create policy ins on pos.task_templates for insert to authenticated with check (pos.can_manage(org_id));
create policy upd on pos.task_templates for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id));
create policy del on pos.task_templates for delete to authenticated using (pos.can_manage(org_id));
create policy sel on pos.task_runs for select to authenticated using (org_id in (select pos.user_org_ids()));
create policy sel on pos.task_items for select to authenticated using (org_id in (select pos.user_org_ids()));
revoke all on pos.task_templates, pos.task_runs, pos.task_items from anon;
grant select, insert, update, delete on pos.task_templates to authenticated;
grant select on pos.task_runs, pos.task_items to authenticated;
grant all on pos.task_templates, pos.task_runs, pos.task_items to service_role;

-- Pastikan ada baris hari ini untuk satu fase dan semua tugas aktif tersalin (tugas baru yang ditambahkan siang hari ikut masuk). Semua anggota boleh memanggil.
create or replace function pos.task_run_ensure(p_outlet uuid, p_phase text) returns uuid
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_run uuid; v_date date;
begin
  select org_id into v_org from outlets where id = p_outlet;
  if v_org is null or v_org not in (select pos.user_org_ids()) then raise exception 'not allowed'; end if;
  if p_phase not in ('opening', 'closing') then raise exception 'invalid phase'; end if;
  v_date := pos.book_date(p_outlet, now());
  insert into task_runs(org_id, outlet_id, run_date, phase) values (v_org, p_outlet, v_date, p_phase)
  on conflict (outlet_id, run_date, phase) do nothing;
  select id into v_run from task_runs where outlet_id = p_outlet and run_date = v_date and phase = p_phase;
  insert into task_items(org_id, run_id, template_id, title, kind, required, allow_skip, sort)
  select v_org, v_run, t.id, t.title, t.kind, t.required, t.allow_skip, t.sort
    from task_templates t
   where t.outlet_id = p_outlet and t.phase = p_phase and t.is_active
  on conflict (run_id, template_id) where template_id is not null do nothing;
  return v_run;
end $$;
revoke all on function pos.task_run_ensure(uuid, text) from public, anon;
grant execute on function pos.task_run_ensure(uuid, text) to authenticated, service_role;

-- Selesaikan satu tugas. Tugas foto wajib jalur foto yang berada di folder organisasi ini. employee opsional (karyawan yang mengerjakan).
create or replace function pos.task_item_complete(p_item uuid, p_photo_path text default null, p_employee uuid default null) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare it task_items%rowtype;
begin
  select * into it from task_items where id = p_item for update;
  if not found then raise exception 'task not found'; end if;
  if it.org_id not in (select pos.user_org_ids()) then raise exception 'not allowed'; end if;
  if it.status = 'done' then return; end if;
  if it.kind = 'photo' then
    if p_photo_path is null or btrim(p_photo_path) = '' then raise exception 'photo required'; end if;
    if split_part(p_photo_path, '/', 1) <> it.org_id::text then raise exception 'photo path invalid'; end if;
  end if;
  if p_employee is not null and not exists (select 1 from employees where id = p_employee and org_id = it.org_id) then raise exception 'employee not found'; end if;
  update task_items set status = 'done', photo_path = case when kind = 'photo' then p_photo_path else null end, skip_reason = null,
         done_by_user = auth.uid(), done_by_employee = p_employee, done_at = now()
   where id = it.id;
end $$;

-- Tandai "tidak bisa dikerjakan" dengan alasan (hanya bila tugas mengizinkan). Dianggap selesai untuk gerbang Tutup kasir.
create or replace function pos.task_item_skip(p_item uuid, p_reason text, p_employee uuid default null) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare it task_items%rowtype;
begin
  select * into it from task_items where id = p_item for update;
  if not found then raise exception 'task not found'; end if;
  if it.org_id not in (select pos.user_org_ids()) then raise exception 'not allowed'; end if;
  if not it.allow_skip then raise exception 'skip not allowed'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'reason required'; end if;
  if p_employee is not null and not exists (select 1 from employees where id = p_employee and org_id = it.org_id) then raise exception 'employee not found'; end if;
  update task_items set status = 'skipped', skip_reason = left(btrim(p_reason), 200), photo_path = null,
         done_by_user = auth.uid(), done_by_employee = p_employee, done_at = now()
   where id = it.id;
end $$;

-- Buka lagi tugas yang salah ditandai (hanya pengelola).
create or replace function pos.task_item_reopen(p_item uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid;
begin
  select org_id into v_org from task_items where id = p_item;
  if v_org is null then raise exception 'task not found'; end if;
  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  update task_items set status = 'pending', photo_path = null, skip_reason = null, done_by_user = null, done_by_employee = null, done_at = null where id = p_item;
end $$;

-- Gerbang Tutup kasir: tugas WAJIB yang belum selesai hari ini (opening dan closing). Memastikan baris hari ini ada lebih dulu.
create or replace function pos.task_close_gate(p_outlet uuid) returns table(phase text, item_id uuid, title text, kind text)
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_date date; ph text;
begin
  select org_id into v_org from outlets where id = p_outlet;
  if v_org is null or v_org not in (select pos.user_org_ids()) then raise exception 'not allowed'; end if;
  foreach ph in array array['opening', 'closing'] loop
    if exists (select 1 from task_templates t where t.outlet_id = p_outlet and t.phase = ph and t.is_active) then
      perform pos.task_run_ensure(p_outlet, ph);
    end if;
  end loop;
  v_date := pos.book_date(p_outlet, now());
  return query
    select r.phase, i.id, i.title, i.kind
      from task_runs r join task_items i on i.run_id = r.id
     where r.outlet_id = p_outlet and r.run_date = v_date and i.required and i.status = 'pending'
     order by case r.phase when 'opening' then 0 else 1 end, i.sort, i.title;
end $$;

-- Catat Tutup kasir yang dibuka paksa oleh manajer (PIN di kasir). Semua anggota boleh memanggil karena kasir bukan pengelola akun.
create or replace function pos.task_gate_override_log(p_outlet uuid, p_authorized_by uuid, p_reason text, p_pending int) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid;
begin
  select org_id into v_org from outlets where id = p_outlet;
  if v_org is null or v_org not in (select pos.user_org_ids()) then raise exception 'not allowed'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'reason required'; end if;
  insert into activity_logs(org_id, outlet_id, actor_user_id, actor_employee_id, action, entity, entity_id, detail)
  values (v_org, p_outlet, auth.uid(), p_authorized_by, 'shift.close_forced_tasks', 'outlet', p_outlet, jsonb_build_object('reason', left(btrim(p_reason), 200), 'pending', coalesce(p_pending, 0)));
end $$;

revoke all on function pos.task_item_complete(uuid, text, uuid), pos.task_item_skip(uuid, text, uuid), pos.task_item_reopen(uuid), pos.task_close_gate(uuid), pos.task_gate_override_log(uuid, uuid, text, int) from public, anon;
grant execute on function pos.task_item_complete(uuid, text, uuid), pos.task_item_skip(uuid, text, uuid), pos.task_item_reopen(uuid), pos.task_close_gate(uuid), pos.task_gate_override_log(uuid, uuid, text, int) to authenticated, service_role;

-- Bucket privat foto tugas (hanya di Supabase; di database lokal/tes dilewati). Jalur: <org_id>/<outlet_id>/<tanggal>/<id_tugas>.jpg
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'skema storage tidak ada, bucket task-photos dilewati';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('task-photos', 'task-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'task_photos_insert') then
    execute $p$create policy task_photos_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'task-photos' and (storage.foldername(name))[1] in (select u::text from pos.user_org_ids() u))$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'task_photos_select') then
    execute $p$create policy task_photos_select on storage.objects for select to authenticated
      using (bucket_id = 'task-photos' and (storage.foldername(name))[1] in (select u::text from pos.user_org_ids() u))$p$;
  end if;
end $$;
