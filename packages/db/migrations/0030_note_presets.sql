-- CG POS · 0030_note_presets
-- Catatan siap pakai untuk kasir (kategori catatan): pemilik/manajer menyusun pilihan seperti "Level pedas: Sedang", "Gula: Kurang manis",
-- kasir tinggal ketuk. Tidak mengubah data yang ada. Tulis langsung oleh pemilik/admin/manajer (RLS), seperti katalog lain.
begin;

create table pos.note_presets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid not null,
  category text not null check (char_length(btrim(category)) between 1 and 40),
  text text not null check (char_length(btrim(text)) between 1 and 60),
  sort int not null default 0,
  is_active boolean not null default true,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references pos.outlets(id, org_id) on delete cascade,
  unique (id, org_id)
);
create unique index note_presets_unique on pos.note_presets (outlet_id, lower(btrim(category)), lower(btrim(text))) where deleted_at is null;
create index note_presets_outlet on pos.note_presets (org_id, outlet_id, category, sort);

alter table pos.note_presets enable row level security;
create policy sel on pos.note_presets for select to authenticated using (org_id in (select pos.user_org_ids()) and pos.can_see_outlet(org_id, outlet_id));
create policy ins on pos.note_presets for insert to authenticated with check (pos.can_manage(org_id));
create policy upd on pos.note_presets for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id));
create policy del on pos.note_presets for delete to authenticated using (pos.can_manage(org_id));
revoke all on pos.note_presets from anon;
grant select, insert, update, delete on pos.note_presets to authenticated;

create trigger trg_touch_note_presets before update on pos.note_presets for each row execute function pos.touch_updated_at();
create trigger trg_seq_note_presets before insert or update on pos.note_presets for each row execute function pos.set_sync_seq();
create trigger trg_log_note_presets after insert or update or delete on pos.note_presets for each row execute function pos.log_change('note_preset');

commit;
