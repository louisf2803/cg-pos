-- CG POS · 0132_crm_campaigns
-- Kampanye CRM (A132), TANPA kirim pesan (keputusan Louis: tanpa WhatsApp, email, SMS). Kampanye = nama, naskah pesan, periode, kriteria sasaran.
-- Saat diluncurkan, daftar penerima dibekukan (snapshot) dari pelanggan yang cocok; pengelola menandai "sudah dihubungi" per pelanggan secara manual
-- (hasil kampanye di aplikasi). Tabel hanya berubah lewat fungsi; pengelola (pos.can_manage) boleh membaca.

create table pos.crm_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  message text check (message is null or char_length(message) <= 500),
  starts_on date,
  ends_on date,
  criteria jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  launched_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  check (starts_on is null or ends_on is null or ends_on >= starts_on)
);
create table pos.crm_campaign_recipients (
  campaign_id uuid not null,
  customer_id uuid not null,
  org_id uuid not null references pos.orgs(id) on delete cascade,
  contacted_at timestamptz,
  primary key (campaign_id, customer_id),
  foreign key (campaign_id, org_id) references pos.crm_campaigns(id, org_id) on delete cascade,
  foreign key (customer_id, org_id) references pos.customers(id, org_id)
);
alter table pos.crm_campaigns enable row level security;
alter table pos.crm_campaign_recipients enable row level security;
create policy sel on pos.crm_campaigns for select to authenticated using (pos.can_manage(org_id));
create policy sel on pos.crm_campaign_recipients for select to authenticated using (pos.can_manage(org_id));
revoke all on pos.crm_campaigns, pos.crm_campaign_recipients from anon;
grant select on pos.crm_campaigns, pos.crm_campaign_recipients to authenticated;

-- Simpan (buat atau ubah) kampanye. Hanya yang masih draf yang bisa diubah. Idempoten menurut p_id.
create or replace function pos.crm_campaign_save(p_id uuid, p_org uuid, p_name text, p_message text, p_start date, p_end date, p_criteria jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare c crm_campaigns%rowtype;
begin
  if p_id is null then raise exception 'id required'; end if;
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'name required'; end if;
  if p_start is not null and p_end is not null and p_end < p_start then raise exception 'invalid period'; end if;
  if p_criteria is not null and jsonb_typeof(p_criteria) <> 'object' then raise exception 'invalid criteria'; end if;
  select * into c from crm_campaigns where id = p_id for update;
  if found then
    if c.org_id <> p_org then raise exception 'not allowed'; end if;
    if c.status <> 'draft' then raise exception 'campaign not draft'; end if;
    update crm_campaigns set name = btrim(p_name), message = nullif(left(btrim(coalesce(p_message, '')), 500), ''), starts_on = p_start, ends_on = p_end, criteria = coalesce(p_criteria, '{}'::jsonb) where id = p_id;
  else
    insert into crm_campaigns(id, org_id, name, message, starts_on, ends_on, criteria, created_by)
    values (p_id, p_org, btrim(p_name), nullif(left(btrim(coalesce(p_message, '')), 500), ''), p_start, p_end, coalesce(p_criteria, '{}'::jsonb), auth.uid());
  end if;
  return jsonb_build_object('id', p_id);
end $$;

-- Luncurkan: kampanye draf menjadi aktif dan penerima dibekukan dari p_customers (id pelanggan yang cocok menurut layar). Idempoten.
create or replace function pos.crm_campaign_launch(p_id uuid, p_customers uuid[]) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare c crm_campaigns%rowtype; v_n int;
begin
  select * into c from crm_campaigns where id = p_id for update;
  if not found then raise exception 'campaign not found'; end if;
  if not pos.can_manage(c.org_id) then raise exception 'not allowed'; end if;
  if c.status = 'active' then return jsonb_build_object('id', c.id, 'status', 'active', 'already', true); end if;
  if c.status <> 'draft' then raise exception 'campaign not draft'; end if;
  if p_customers is null or coalesce(array_length(p_customers, 1), 0) = 0 then raise exception 'no recipients'; end if;
  if array_length(p_customers, 1) > 20000 then raise exception 'too many recipients'; end if;
  insert into crm_campaign_recipients(campaign_id, customer_id, org_id)
  select c.id, cu.id, c.org_id from customers cu where cu.org_id = c.org_id and cu.deleted_at is null and cu.id = any(p_customers)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'no recipients'; end if;
  update crm_campaigns set status = 'active', launched_at = now() where id = c.id;
  return jsonb_build_object('id', c.id, 'status', 'active', 'recipients', v_n);
end $$;

-- Tandai pelanggan sudah (atau belum) dihubungi pada kampanye aktif.
create or replace function pos.crm_campaign_contact(p_id uuid, p_customer uuid, p_contacted boolean) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare c crm_campaigns%rowtype;
begin
  select * into c from crm_campaigns where id = p_id;
  if not found then raise exception 'campaign not found'; end if;
  if not pos.can_manage(c.org_id) then raise exception 'not allowed'; end if;
  if c.status <> 'active' then raise exception 'campaign not active'; end if;
  update crm_campaign_recipients set contacted_at = case when p_contacted then coalesce(contacted_at, now()) else null end
   where campaign_id = p_id and customer_id = p_customer;
  if not found then raise exception 'recipient not found'; end if;
  return jsonb_build_object('id', p_id, 'customer_id', p_customer, 'contacted', p_contacted);
end $$;

-- Akhiri kampanye aktif.
create or replace function pos.crm_campaign_end(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare c crm_campaigns%rowtype;
begin
  select * into c from crm_campaigns where id = p_id for update;
  if not found then raise exception 'campaign not found'; end if;
  if not pos.can_manage(c.org_id) then raise exception 'not allowed'; end if;
  if c.status = 'ended' then return jsonb_build_object('id', c.id, 'status', 'ended', 'already', true); end if;
  if c.status <> 'active' then raise exception 'campaign not active'; end if;
  update crm_campaigns set status = 'ended' where id = c.id;
  return jsonb_build_object('id', c.id, 'status', 'ended');
end $$;

-- Hapus kampanye draf (yang sudah diluncurkan disimpan sebagai riwayat).
create or replace function pos.crm_campaign_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare c crm_campaigns%rowtype;
begin
  select * into c from crm_campaigns where id = p_id for update;
  if not found then return jsonb_build_object('id', p_id, 'deleted', false); end if;
  if not pos.can_manage(c.org_id) then raise exception 'not allowed'; end if;
  if c.status <> 'draft' then raise exception 'campaign not draft'; end if;
  delete from crm_campaigns where id = c.id;
  return jsonb_build_object('id', p_id, 'deleted', true);
end $$;

revoke all on function pos.crm_campaign_save(uuid, uuid, text, text, date, date, jsonb), pos.crm_campaign_launch(uuid, uuid[]),
  pos.crm_campaign_contact(uuid, uuid, boolean), pos.crm_campaign_end(uuid), pos.crm_campaign_delete(uuid) from public, anon;
grant execute on function pos.crm_campaign_save(uuid, uuid, text, text, date, date, jsonb), pos.crm_campaign_launch(uuid, uuid[]),
  pos.crm_campaign_contact(uuid, uuid, boolean), pos.crm_campaign_end(uuid), pos.crm_campaign_delete(uuid) to authenticated, service_role;
