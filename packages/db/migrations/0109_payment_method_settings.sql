-- CG POS · 0109_payment_method_settings
-- Menambahkan penyimpanan server untuk pengaturan metode pembayaran per outlet/organisasi:
-- 1. Tabel pos.payment_method_settings (penyesuaian nama, kanal, biaya MDR persen & tetap, akun/rekening, catatan pencairan, status aktif)
-- 2. RPC pos.save_payment_method_config (validasi, simpan konfigurasi, sinkronisasi ke pos.payment_methods)
-- 3. RPC pos.delete_payment_method_config (hapus metode kustom, tolak metode bawaan)
-- 4. RLS dan hak akses hanya pemilik/manajer

create table if not exists pos.payment_method_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid references pos.outlets(id) on delete cascade,
  method_id uuid references pos.payment_methods(id) on delete cascade,
  code text not null,
  name text not null,
  channel text not null check (channel in ('cash','qris','ewallet','edc','va','complimentary')),
  base_kind text not null default 'noncash' check (base_kind in ('cash','noncash','gateway','complimentary','deposit')),
  is_active boolean not null default true,
  fee_pct numeric(5,2) not null default 0 check (fee_pct >= 0 and fee_pct <= 25),
  fee_fixed numeric(18,2) not null default 0 check (fee_fixed >= 0 and fee_fixed <= 500000),
  account_name text,
  account_number text,
  settlement_note text,
  requires_online boolean not null default false,
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

alter table pos.payment_method_settings enable row level security;
drop policy if exists sel on pos.payment_method_settings;
create policy sel on pos.payment_method_settings for select to authenticated using (pos.can_manage(org_id));
drop policy if exists ins on pos.payment_method_settings;
create policy ins on pos.payment_method_settings for insert to authenticated with check (pos.can_manage(org_id));
drop policy if exists upd on pos.payment_method_settings;
create policy upd on pos.payment_method_settings for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id));
drop policy if exists del on pos.payment_method_settings;
create policy del on pos.payment_method_settings for delete to authenticated using (pos.can_manage(org_id));

revoke all on pos.payment_method_settings from anon;
grant select, insert, update, delete on pos.payment_method_settings to authenticated;

-- Trigger updated_at
drop trigger if exists trg_touch_payment_method_settings on pos.payment_method_settings;
create trigger trg_touch_payment_method_settings before update on pos.payment_method_settings
  for each row execute function pos.touch();

-- RPC untuk simpan konfigurasi metode pembayaran
create or replace function pos.save_payment_method_config(
  p_org uuid,
  p_outlet uuid,
  p_id uuid,
  p_code text,
  p_name text,
  p_channel text,
  p_is_active boolean,
  p_fee_pct numeric,
  p_fee_fixed numeric,
  p_account_name text,
  p_account_number text,
  p_settlement_note text
)
returns jsonb
language plpgsql
security definer
set search_path = pos, extensions, pg_temp
as $$
declare
  v_res pos.payment_method_settings%rowtype;
  v_method_id uuid;
  v_builtin boolean;
  v_base_kind text;
  v_active boolean;
  v_acc uuid;
begin
  if not pos.can_manage(p_org) then
    raise exception 'forbidden';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Nama metode pembayaran wajib diisi';
  end if;
  if length(p_name) > 50 then
    raise exception 'Nama metode pembayaran maksimal 50 karakter';
  end if;

  if trim(coalesce(p_code, '')) = '' or not (upper(trim(p_code)) ~ '^[A-Z0-9_-]{2,20}$') then
    raise exception 'Kode metode tidak valid';
  end if;

  if p_fee_pct < 0 or p_fee_pct > 25 then
    raise exception 'Persentase MDR harus antara 0%% dan 25%%';
  end if;

  if p_fee_fixed < 0 or p_fee_fixed > 500000 then
    raise exception 'Biaya tetap MDR maksimal 500.000';
  end if;

  -- Cari apakah method bawaan
  select id, kind into v_method_id, v_base_kind
    from pos.payment_methods
   where org_id = p_org and upper(code) = upper(trim(p_code)) and deleted_at is null
   limit 1;

  v_builtin := v_method_id is not null;
  if v_base_kind is null then
    v_base_kind := 'noncash';
  end if;

  -- Penjagaan gateway QRIS: tetap nonaktif sesuai aturan repo
  if v_base_kind = 'gateway' then
    v_active := false;
  else
    v_active := coalesce(p_is_active, true);
  end if;

  -- Jika p_id disediakan dan ada di payment_method_settings
  if p_id is not null and exists (select 1 from pos.payment_method_settings where id = p_id and org_id = p_org) then
    update pos.payment_method_settings
       set name = trim(p_name),
           channel = p_channel,
           is_active = v_active,
           fee_pct = round(p_fee_pct, 2),
           fee_fixed = round(p_fee_fixed),
           account_name = nullif(trim(p_account_name), ''),
           account_number = nullif(trim(p_account_number), ''),
           settlement_note = nullif(trim(p_settlement_note), ''),
           updated_at = now()
     where id = p_id and org_id = p_org
     returning * into v_res;
  else
    -- Upsert berdasarkan (org_id, code)
    insert into pos.payment_method_settings (
      id, org_id, outlet_id, method_id, code, name, channel, base_kind,
      is_active, fee_pct, fee_fixed, account_name, account_number, settlement_note, is_builtin
    ) values (
      coalesce(p_id, gen_random_uuid()),
      p_org,
      p_outlet,
      v_method_id,
      upper(trim(p_code)),
      trim(p_name),
      p_channel,
      v_base_kind,
      v_active,
      round(p_fee_pct, 2),
      round(p_fee_fixed),
      nullif(trim(p_account_name), ''),
      nullif(trim(p_account_number), ''),
      nullif(trim(p_settlement_note), ''),
      v_builtin
    )
    on conflict (org_id, code) do update
       set name = trim(excluded.name),
           channel = excluded.channel,
           is_active = excluded.is_active,
           fee_pct = excluded.fee_pct,
           fee_fixed = excluded.fee_fixed,
           account_name = excluded.account_name,
           account_number = excluded.account_number,
           settlement_note = excluded.settlement_note,
           updated_at = now()
    returning * into v_res;
  end if;

  -- Sinkronisasi ke pos.payment_methods agar POS kasir otomatis mendapat pembaruan
  if v_method_id is not null then
    update pos.payment_methods
       set name = trim(p_name),
           is_active = v_active,
           updated_at = now()
     where id = v_method_id and org_id = p_org;
  else
    -- Tambah metode baru ke payment_methods
    v_acc := pos.account_id(p_org, 'bank_main');
    if v_acc is null then
      select id into v_acc from pos.accounts where org_id = p_org and category in ('cash_bank', 'receivable') and is_active limit 1;
    end if;

    if v_acc is not null then
      insert into pos.payment_methods (
        org_id, code, name, kind, account_id, requires_online, is_active
      ) values (
        p_org, upper(trim(p_code)), trim(p_name), 'noncash', v_acc, false, v_active
      )
      on conflict (org_id, code) do update
         set name = trim(excluded.name),
             is_active = excluded.is_active,
             updated_at = now()
      returning id into v_method_id;

      update pos.payment_method_settings
         set method_id = v_method_id
       where id = v_res.id;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_res.id,
    'code', v_res.code,
    'name', v_res.name,
    'channel', v_res.channel,
    'baseKind', v_res.base_kind,
    'isActive', v_res.is_active,
    'feePct', v_res.fee_pct,
    'feeFixed', v_res.fee_fixed,
    'accountName', v_res.account_name,
    'accountNumber', v_res.account_number,
    'settlementNote', v_res.settlement_note,
    'requiresOnline', v_res.requires_online,
    'isBuiltIn', v_res.is_builtin
  );
end;
$$;

revoke all on function pos.save_payment_method_config(uuid, uuid, uuid, text, text, text, boolean, numeric, numeric, text, text, text) from public, anon;
grant execute on function pos.save_payment_method_config(uuid, uuid, uuid, text, text, text, boolean, numeric, numeric, text, text, text) to authenticated;

-- RPC untuk hapus metode pembayaran kustom
create or replace function pos.delete_payment_method_config(
  p_org uuid,
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pos, extensions, pg_temp
as $$
declare
  v_cfg pos.payment_method_settings%rowtype;
begin
  if not pos.can_manage(p_org) then
    raise exception 'forbidden';
  end if;

  select * into v_cfg from pos.payment_method_settings where id = p_id and org_id = p_org;
  if not found then
    return false;
  end if;

  if v_cfg.is_builtin then
    raise exception 'Metode pembayaran bawaan tidak dapat dihapus';
  end if;

  delete from pos.payment_method_settings where id = p_id and org_id = p_org;

  if v_cfg.method_id is not null then
    update pos.payment_methods
       set is_active = false, deleted_at = now(), updated_at = now()
     where id = v_cfg.method_id and org_id = p_org;
  end if;

  return true;
end;
$$;

revoke all on function pos.delete_payment_method_config(uuid, uuid) from public, anon;
grant execute on function pos.delete_payment_method_config(uuid, uuid) to authenticated;

