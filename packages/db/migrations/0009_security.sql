-- CG POS · 0009_security
-- Semua objek ada di schema pos. Tidak menyentuh schema public.
begin;
set local search_path = pos, extensions, public;

-- ===== 15_security.sql =====
-- Bagian 15: pemicu otomatis, RLS, hak akses

-- 1) updated_at otomatis pada semua tabel yang punya kolomnya; sync_seq pada tabel yang punya kolomnya
do $$
declare r record;
begin
  for r in select distinct c.table_name from information_schema.columns c
            join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
           where c.table_schema = 'pos' and c.column_name = 'updated_at' loop
    execute format('create trigger %I before update on %I for each row execute function pos.touch_updated_at()', 'trg_touch_' || r.table_name, r.table_name);
  end loop;
  for r in select distinct c.table_name from information_schema.columns c
            join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
           where c.table_schema = 'pos' and c.column_name = 'sync_seq' and c.table_name <> 'sync_tombstones' loop
    execute format('create trigger %I before insert or update on %I for each row execute function pos.set_sync_seq()', 'trg_seq_' || r.table_name, r.table_name);
    -- tabel penghubung tanpa deleted_at: catat penghapusan keras
    if not exists (select 1 from information_schema.columns c2 where c2.table_schema = 'pos' and c2.table_name=r.table_name and c2.column_name='deleted_at')
       and r.table_name <> 'outlet_settings' then
      execute format('create trigger %I after delete on %I for each row execute function pos.record_tombstone()', 'trg_tomb_' || r.table_name, r.table_name);
    end if;
  end loop;
end $$;

-- 2) RLS
-- Kelompok:
--   no_access  : hanya service role (rahasia gateway)
--   read_only  : staf boleh baca; tulis hanya lewat fungsi (data transaksi dan pembukuan)
--   managed    : staf boleh baca; pemilik/admin/manager boleh tulis langsung (katalog, pengaturan)
do $$
declare
  t text;
  no_access text[] := array['payment_provider_accounts','gateway_tokens','gateway_events','sync_tombstones'];
  read_only text[] := array['orders','order_items','order_item_extras','order_discounts','order_tax_lines','payments','payment_allocations',
    'order_voids','refunds','refund_items','shifts','cash_movements','sync_ops','journal_entries','journal_lines','stock_movements',
    'stock_balances','gateway_transactions','gateway_settlements','gateway_settlement_lines','doc_sequences','reconciliations',
    'activity_logs','loyalty_ledger'];
  v_has_outlet boolean;
begin
  for t in select table_name from information_schema.tables where table_schema = 'pos' and table_type = 'BASE TABLE' loop
    execute format('alter table %I enable row level security', t);
    if t = any(no_access) then continue; end if;
    if t = 'asset_depreciations' then
      execute 'create policy sel on asset_depreciations for select to authenticated using (exists (select 1 from fixed_assets f where f.id = asset_id and f.org_id in (select pos.user_org_ids())))';
      continue;
    end if;
    if t = 'orgs' then
      execute 'create policy sel on orgs for select to authenticated using (id in (select pos.user_org_ids()))';
      execute 'create policy upd on orgs for update to authenticated using (pos.is_org_admin(id)) with check (pos.is_org_admin(id))';
      continue;
    end if;
    if t = 'org_members' then
      execute 'create policy sel on org_members for select to authenticated using (org_id in (select pos.user_org_ids()))';
      execute 'create policy ins on org_members for insert to authenticated with check (pos.is_org_admin(org_id) and role <> ''owner'')';
      execute 'create policy upd on org_members for update to authenticated using (pos.is_org_admin(org_id) and role <> ''owner'') with check (pos.is_org_admin(org_id) and role <> ''owner'')';
      execute 'create policy del on org_members for delete to authenticated using (pos.is_org_admin(org_id) and role <> ''owner'')';
      continue;
    end if;
    if t = 'outlets' then
      execute 'create policy sel on outlets for select to authenticated using (pos.can_see_outlet(org_id, id))';
      execute 'create policy ins on outlets for insert to authenticated with check (pos.is_org_admin(org_id))';
      execute 'create policy upd on outlets for update to authenticated using (pos.is_org_admin(org_id)) with check (pos.is_org_admin(org_id))';
      continue;
    end if;
    select exists (select 1 from information_schema.columns where table_schema = 'pos' and table_name=t and column_name='outlet_id') into v_has_outlet;
    if t = any(read_only) then
      if v_has_outlet then
        execute format('create policy sel on %I for select to authenticated using (org_id in (select pos.user_org_ids()) and (outlet_id is null or pos.can_see_outlet(org_id, outlet_id)))', t);
      else
        execute format('create policy sel on %I for select to authenticated using (org_id in (select pos.user_org_ids()))', t);
      end if;
    else
      if v_has_outlet then
        execute format('create policy sel on %I for select to authenticated using (org_id in (select pos.user_org_ids()) and (outlet_id is null or pos.can_see_outlet(org_id, outlet_id)))', t);
      else
        execute format('create policy sel on %I for select to authenticated using (org_id in (select pos.user_org_ids()))', t);
      end if;
      execute format('create policy ins on %I for insert to authenticated with check (pos.can_manage(org_id))', t);
      execute format('create policy upd on %I for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id))', t);
      execute format('create policy del on %I for delete to authenticated using (pos.can_manage(org_id))', t);
    end if;
  end loop;
end $$;

-- jurnal dan akun sistem: akun bawaan tidak boleh dihapus/diganti kuncinya lewat klien
create or replace function pos.accounts_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from orgs where id = old.org_id) then return old; end if;   -- hapus-org berantai
    if old.system_key is not null then raise exception 'system account cannot be deleted'; end if;
    if exists (select 1 from journal_lines where account_id = old.id) then raise exception 'account has journal lines; deactivate it instead'; end if;
    return old;
  end if;
  if old.system_key is distinct from new.system_key and auth.uid() is not null then
    raise exception 'system_key is locked';
  end if;
  if old.category <> new.category and exists (select 1 from journal_lines where account_id = old.id) then
    raise exception 'cannot change category of an account that has journal lines';
  end if;
  return new;
end $$;
create trigger accounts_guard before update or delete on accounts for each row execute function pos.accounts_guard();

-- 2b) FK antar tabel dibuat DEFERRABLE INITIALLY IMMEDIATE: perilaku biasa tetap langsung, tetapi pos.delete_org
--     dapat menundanya sampai semua hapus-berantai selesai. (ON DELETE CASCADE ke orgs tetap berlaku.)
do $$
declare c record;
begin
  for c in select conrelid::regclass as tbl, conname from pg_constraint
            where contype = 'f' and connamespace = 'pos'::regnamespace and confdeltype = 'a' and not condeferrable loop
    execute format('alter table %s alter constraint %I deferrable initially immediate', c.tbl, c.conname);
  end loop;
end $$;

-- 3) hak akses
revoke all on all tables in schema pos from anon, authenticated;
grant usage on schema pos to authenticated, service_role;
grant usage on schema pos to authenticated, service_role;
grant select on all tables in schema pos to authenticated;
do $$
declare t text;
  writable text[];
begin
  -- tulis langsung hanya pada tabel katalog/pengaturan (kebijakan 'ins/upd/del' di atas yang membatasi per peran)
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'pos' and c.relkind = 'r'
              and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'ins') loop
    execute format('grant insert, update, delete on %I to authenticated', t);
  end loop;
  grant update on orgs to authenticated;
  grant update on outlets to authenticated;
end $$;
-- rahasia gateway dan antrean tombstone: tidak ada akses klien sama sekali (RLS tanpa kebijakan = lapis kedua)
revoke all on payment_provider_accounts, gateway_tokens, gateway_events, sync_tombstones from authenticated;
grant all on all tables in schema pos to service_role;
grant all on all sequences in schema pos to service_role;
grant usage on sequence pos.sync_seq to authenticated, service_role;

-- fungsi: tutup untuk publik, buka hanya yang memang untuk klien
revoke all on all functions in schema pos from public;
grant execute on function pos.user_org_ids(), pos.member_role(uuid), pos.is_org_admin(uuid), pos.can_manage(uuid),
      pos.can_see_outlet(uuid, uuid), pos.is_debit_normal(text) to authenticated, service_role;
grant execute on function pos.sync_push(uuid, jsonb), pos.sync_pull(uuid, bigint, int) to authenticated, service_role;
grant execute on function pos.report_trial_balance(uuid, date, date, uuid), pos.report_income_statement(uuid, date, date, uuid),
      pos.report_balance_sheet(uuid, date, uuid), pos.report_payables_aging(uuid, date),
      pos.report_sales_daily(uuid, date, date, uuid) to authenticated, service_role;
-- semua fungsi lain (posting, PIN, gateway, create_org, seed) hanya untuk server
grant execute on all functions in schema pos to service_role;


-- Setiap fungsi membawa search_path sendiri: PostgREST memanggil dengan search_path bawaan (public), bukan pos.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'pos' and p.prokind = 'f'
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') loop
    execute format('alter function %s set search_path = pos, extensions, pg_temp', f.sig);
  end loop;
end $$;

commit;
