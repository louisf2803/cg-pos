-- CG POS · 0020_auth_codes
-- Kode otorisasi: manajer atau pemilik membuat kode sekali pakai di dashboard, lalu memberikannya ke kasir
-- (telepon, pesan) sebagai pengganti PIN saat manajer tidak berada di depan kasir.
--   * pos.auth_codes          : kode disimpan hanya sebagai hash (id + kode), dengan tindakan yang diizinkan, outlet, masa berlaku,
--                               penerbit, dan jejak pemakaian. Tulis/baca langsung dicabut; hanya fungsi di bawah.
--   * pos.auth_code_issue     : penerbit (pemilik/admin/manajer yang melihat outlet) membuat kode 8 angka; teks kode hanya dikembalikan sekali.
--   * pos.auth_code_use       : perangkat kasir menukar kode dengan identitas penerbit; sekali pakai, hanya untuk outlet dan tindakan yang cocok,
--                               dibatasi 5 kesalahan per 10 menit per perangkat.
--   * pos.auth_code_list      : riwayat kode satu outlet (tanpa teks kode) untuk dashboard.
--   * pos.auth_code_revoke    : batalkan kode yang belum dipakai.
begin;

create table pos.auth_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid not null,
  permission text not null check (permission in ('void_order', 'complimentary', 'refund', 'manual_discount')),
  code_hash text not null,
  note text,
  issued_by uuid not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_device uuid,
  used_order uuid,
  revoked_at timestamptz,
  foreign key (outlet_id, org_id) references pos.outlets(id, org_id) on delete cascade,
  check (expires_at > issued_at)
);
create index auth_codes_active on pos.auth_codes (outlet_id, expires_at) where used_at is null and revoked_at is null;
create index auth_codes_outlet_time on pos.auth_codes (outlet_id, issued_at desc);
alter table pos.auth_codes enable row level security;
revoke all on pos.auth_codes from anon, authenticated;

create table pos.auth_code_fails (
  device_id uuid not null,
  failed_at timestamptz not null default now()
);
create index auth_code_fails_device on pos.auth_code_fails (device_id, failed_at);
alter table pos.auth_code_fails enable row level security;
revoke all on pos.auth_code_fails from anon, authenticated;

create or replace function pos.auth_code_issue(p_outlet uuid, p_permission text, p_ttl_minutes int default 15, p_note text default null)
returns jsonb language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_id uuid := gen_random_uuid(); v_code text; v_exp timestamptz;
begin
  select org_id into v_org from pos.outlets where id = p_outlet;
  if v_org is null or auth.uid() is null or not pos.can_manage(v_org) or not pos.can_see_outlet(v_org, p_outlet) then
    raise exception 'no access';
  end if;
  if p_permission is null or p_permission not in ('void_order', 'complimentary', 'refund', 'manual_discount') then
    raise exception 'invalid permission';
  end if;
  if p_ttl_minutes is null or p_ttl_minutes < 1 or p_ttl_minutes > 240 then
    raise exception 'ttl must be between 1 and 240 minutes';
  end if;
  v_code := lpad((abs(('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 100000000)::text, 8, '0');
  v_exp := now() + make_interval(mins => p_ttl_minutes);
  insert into pos.auth_codes(id, org_id, outlet_id, permission, code_hash, note, issued_by, expires_at)
  values (v_id, v_org, p_outlet, p_permission, encode(digest(v_id::text || ':' || v_code, 'sha256'), 'hex'),
          nullif(btrim(coalesce(left(p_note, 120), '')), ''), auth.uid(), v_exp);
  return jsonb_build_object('id', v_id, 'code', v_code, 'expires_at', v_exp);
end $$;

create or replace function pos.auth_code_use(p_device uuid, p_code text, p_permission text, p_order uuid default null)
returns uuid language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare d pos.devices%rowtype; r pos.auth_codes%rowtype; v_fails int;
begin
  select * into d from pos.devices where id = p_device and is_active;
  if not found or auth.uid() is null or d.user_id is distinct from auth.uid() then raise exception 'not your device'; end if;
  delete from pos.auth_code_fails where failed_at < now() - interval '1 day';
  select count(*) into v_fails from pos.auth_code_fails where device_id = p_device and failed_at > now() - interval '10 minutes';
  if v_fails >= 5 then return null; end if;
  select * into r from pos.auth_codes c
   where c.org_id = d.org_id and c.outlet_id = d.outlet_id and c.permission = p_permission
     and c.used_at is null and c.revoked_at is null and c.expires_at > now()
     and c.code_hash = encode(digest(c.id::text || ':' || btrim(coalesce(p_code, '')), 'sha256'), 'hex')
   order by c.issued_at limit 1 for update;
  if not found then
    insert into pos.auth_code_fails(device_id) values (p_device);
    return null;
  end if;
  update pos.auth_codes set used_at = now(), used_device = p_device, used_order = p_order where id = r.id;
  delete from pos.auth_code_fails where device_id = p_device;
  return r.issued_by;
end $$;

create or replace function pos.auth_code_list(p_outlet uuid, p_limit int default 50)
returns table(id uuid, permission text, note text, issued_by uuid, issuer_email text, issued_at timestamptz, expires_at timestamptz,
              used_at timestamptz, used_order_number text, revoked_at timestamptz, status text)
language plpgsql stable security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid;
begin
  select ot.org_id into v_org from pos.outlets ot where ot.id = p_outlet;
  if v_org is null or auth.uid() is null or not pos.can_manage(v_org) or not pos.can_see_outlet(v_org, p_outlet) then
    raise exception 'no access';
  end if;
  return query
  select c.id, c.permission, c.note, c.issued_by, (select u.email::text from auth.users u where u.id = c.issued_by), c.issued_at, c.expires_at,
         c.used_at, (select o.number from pos.orders o where o.id = c.used_order and o.org_id = c.org_id), c.revoked_at,
         case when c.used_at is not null then 'used' when c.revoked_at is not null then 'revoked' when c.expires_at <= now() then 'expired' else 'active' end
    from pos.auth_codes c
   where c.outlet_id = p_outlet and c.org_id = v_org
   order by c.issued_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;

create or replace function pos.auth_code_revoke(p_id uuid) returns boolean
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_outlet uuid; n int;
begin
  select org_id, outlet_id into v_org, v_outlet from pos.auth_codes where id = p_id;
  if v_org is null or auth.uid() is null or not pos.can_manage(v_org) or not pos.can_see_outlet(v_org, v_outlet) then
    raise exception 'no access';
  end if;
  update pos.auth_codes set revoked_at = now() where id = p_id and used_at is null and revoked_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function pos.auth_code_issue(uuid, text, int, text), pos.auth_code_use(uuid, text, text, uuid),
  pos.auth_code_list(uuid, int), pos.auth_code_revoke(uuid) from public, anon;
grant execute on function pos.auth_code_issue(uuid, text, int, text), pos.auth_code_use(uuid, text, text, uuid),
  pos.auth_code_list(uuid, int), pos.auth_code_revoke(uuid) to authenticated, service_role;

commit;
