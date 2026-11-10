-- CG POS · 0021_activity_log
-- Log aktivitas perubahan pengaturan: siapa mengubah apa dan kapan, tanpa menyimpan nilai rahasia.
--   * pos.log_change()     : pemicu sesudah simpan di tabel pengaturan. Mencatat dibuat, diubah (kolom, nilai lama dan baru),
--                            dihapus (arsip), dipulihkan, dan dihapus permanen. Kolom bising (updated_at, sync_seq, dst.) dan rahasia
--                            (hash PIN, kode QR) tidak dicatat; ganti PIN hanya dicatat sebagai kejadian tanpa nilai.
--                            Kegagalan mencatat tidak boleh menggagalkan simpan: hanya peringatan.
--   * pos.activity_list()  : daftar log untuk dashboard; hanya pemilik, admin, atau manajer (outlet yang boleh dilihat).
-- Tabel pos.activity_logs sudah ada sejak 0001 (juga dipakai kejadian sistem); tidak diubah.
begin;

create or replace function pos.log_clip(p jsonb) returns jsonb
language sql immutable set search_path = pg_catalog as $$
  select case
    when p is null then null
    when jsonb_typeof(p) = 'string' then to_jsonb(left(p #>> '{}', 200))
    when jsonb_typeof(p) in ('object', 'array') then to_jsonb(left(p::text, 200))
    else p end $$;

create or replace function pos.log_change() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_entity text := tg_argv[0];
  v_noise text[] := array['updated_at', 'created_at', 'sync_seq', 'deleted_at'];
  v_secret text[] := array['pin_hash', 'pin_failed_count', 'pin_locked_until', 'qr_code'];
  v_changes jsonb := '{}'::jsonb; v_key text; v_action text; v_org uuid; v_id uuid; v_outlet uuid; v_name text; v_pin boolean := false; v_n int := 0;
begin
  v_org := nullif(v_row->>'org_id', '')::uuid;
  if v_org is null then return null; end if;
  v_id := coalesce(nullif(v_row->>'id', '')::uuid, nullif(v_row->>'user_id', '')::uuid);
  v_outlet := nullif(v_row->>'outlet_id', '')::uuid;
  v_name := coalesce(nullif(v_row->>'name', ''), nullif(v_row->>'code', ''));
  if v_name is null and nullif(v_row->>'product_id', '') is not null then
    select p.name into v_name from pos.products p where p.id = (v_row->>'product_id')::uuid;
  end if;
  if v_entity = 'member' then
    select u.email::text into v_name from auth.users u where u.id = (v_row->>'user_id')::uuid;
  end if;

  if tg_op = 'INSERT' then
    v_action := v_entity || '.created';
  elsif tg_op = 'DELETE' then
    v_action := v_entity || '.removed';
  else
    if (v_old->>'deleted_at') is null and (v_new->>'deleted_at') is not null then v_action := v_entity || '.deleted';
    elsif (v_old->>'deleted_at') is not null and (v_new->>'deleted_at') is null then v_action := v_entity || '.restored';
    else v_action := v_entity || '.updated';
    end if;
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key = any (v_noise) then continue; end if;
      if v_key = any (v_secret) then
        if v_key = 'pin_hash' and (v_old->v_key) is distinct from (v_new->v_key) then v_pin := true; end if;
        continue;
      end if;
      if (v_old->v_key) is distinct from (v_new->v_key) and v_n < 20 then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_array(pos.log_clip(v_old->v_key), pos.log_clip(v_new->v_key)));
        v_n := v_n + 1;
      end if;
    end loop;
    if v_action = v_entity || '.updated' and v_n = 0 and not v_pin then return null; end if;
  end if;

  if v_action <> v_entity || '.updated' or v_n > 0 then
    insert into pos.activity_logs(org_id, outlet_id, actor_user_id, action, entity, entity_id, detail)
    values (v_org, v_outlet, auth.uid(), v_action, v_entity, v_id, jsonb_build_object('name', v_name, 'changes', v_changes));
  end if;
  if v_pin then
    insert into pos.activity_logs(org_id, outlet_id, actor_user_id, action, entity, entity_id, detail)
    values (v_org, v_outlet, auth.uid(), 'employee.pin_changed', 'employee', v_id, jsonb_build_object('name', v_name, 'changes', '{}'::jsonb));
  end if;
  return null;
exception when others then
  raise warning 'log_change gagal (%): %', tg_table_name, sqlerrm;
  return null;
end $$;
revoke all on function pos.log_change() from public, anon, authenticated;

create trigger trg_log_products after insert or update or delete on pos.products for each row execute function pos.log_change('product');
create trigger trg_log_product_units after insert or update or delete on pos.product_units for each row execute function pos.log_change('product_unit');
create trigger trg_log_categories after insert or update or delete on pos.categories for each row execute function pos.log_change('category');
create trigger trg_log_departments after insert or update or delete on pos.departments for each row execute function pos.log_change('department');
create trigger trg_log_units after insert or update or delete on pos.units for each row execute function pos.log_change('unit');
create trigger trg_log_payment_methods after insert or update or delete on pos.payment_methods for each row execute function pos.log_change('payment_method');
create trigger trg_log_outlets after insert or update or delete on pos.outlets for each row execute function pos.log_change('outlet');
create trigger trg_log_outlet_settings after insert or update or delete on pos.outlet_settings for each row execute function pos.log_change('outlet_settings');
create trigger trg_log_employees after insert or update or delete on pos.employees for each row execute function pos.log_change('employee');
create trigger trg_log_taxes after insert or update or delete on pos.taxes for each row execute function pos.log_change('tax');
create trigger trg_log_promotions after insert or update or delete on pos.promotions for each row execute function pos.log_change('promotion');
create trigger trg_log_coupons after insert or update or delete on pos.coupons for each row execute function pos.log_change('coupon');
create trigger trg_log_extra_groups after insert or update or delete on pos.extra_groups for each row execute function pos.log_change('extra_group');
create trigger trg_log_floors after insert or update or delete on pos.floors for each row execute function pos.log_change('floor');
create trigger trg_log_tables after insert or update or delete on pos.tables for each row execute function pos.log_change('table');
create trigger trg_log_suppliers after insert or update or delete on pos.suppliers for each row execute function pos.log_change('supplier');
create trigger trg_log_accounts after insert or update or delete on pos.accounts for each row execute function pos.log_change('account');
create trigger trg_log_loyalty_rules after insert or update or delete on pos.loyalty_rules for each row execute function pos.log_change('loyalty_rules');
create trigger trg_log_price_schedules after insert or update or delete on pos.price_schedules for each row execute function pos.log_change('price_schedule');
create trigger trg_log_customer_groups after insert or update or delete on pos.customer_groups for each row execute function pos.log_change('customer_group');
create trigger trg_log_org_members after insert or update or delete on pos.org_members for each row execute function pos.log_change('member');

create or replace function pos.activity_list(p_from timestamptz default null, p_to timestamptz default null, p_entity text default null, p_limit int default 200)
returns table(id uuid, created_at timestamptz, action text, entity text, entity_id uuid, outlet_id uuid, actor_user_id uuid, actor_email text, detail jsonb)
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  return query
  select l.id, l.created_at, l.action, l.entity, l.entity_id, l.outlet_id, l.actor_user_id,
         (select u.email::text from auth.users u where u.id = l.actor_user_id), l.detail
    from pos.activity_logs l
   where l.org_id in (select pos.user_org_ids())
     and l.created_at >= coalesce(p_from, now() - interval '30 days')
     and l.created_at < coalesce(p_to, now() + interval '1 day')
     and (p_entity is null or l.entity = p_entity)
     and pos.can_manage(l.org_id)
     and (l.outlet_id is null or pos.can_see_outlet(l.org_id, l.outlet_id))
   order by l.created_at desc, l.id
   limit greatest(1, least(coalesce(p_limit, 200), 500));
end $$;
revoke all on function pos.activity_list(timestamptz, timestamptz, text, int) from public, anon;
grant execute on function pos.activity_list(timestamptz, timestamptz, text, int) to authenticated, service_role;

commit;
