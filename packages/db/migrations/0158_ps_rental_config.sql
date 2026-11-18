-- CG POS · 0158_ps_rental_config
-- Rental PS di kafe (docs/queue/SPEK-PS-RENTAL.md), tahap 1: pengaturan di backend.
-- Station PS = meja pada lantai berjenis 'ps' (memakai ulang denah dan peta di kasir); konfigurasi sewa ada di ps_stations.
--  * floors.kind               : 'cafe' (bawaan) atau 'ps'; kasir memisahkan tampilan Kafe dan PS menurut jenis lantai.
--  * ps_stations               : tipe konsol, tarif per jam, perawatan, daftar game (per station).
--  * ps_rate_bands             : pita jam dengan tarif berbeda (menit dari tengah malam; pita lewat tengah malam dipecah dua); hari opsional.
--  * ps_packages               : paket biasa (durasi + harga) atau paket jendela jam (mis. 18.00-21.00, harga tetap, selesai tepat di akhir jendela).
--  * outlet_settings           : tenggang awal (menit), batas hangus booking (menit), teks pesan booking WhatsApp.
-- Tulis station/pita/pengaturan lewat fungsi (validasi pita tidak bertumpuk); paket lewat RLS pengelola. Semua anggota org boleh membaca.
alter table pos.floors add column kind text not null default 'cafe' check (kind in ('cafe', 'ps'));

create table pos.ps_stations (
  table_id uuid primary key,
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid not null,
  console_label text not null default 'PS' check (char_length(btrim(console_label)) between 1 and 30),
  rate_per_hour numeric(18,0) not null default 0 check (rate_per_hour between 0 and 100000000),
  is_maintenance boolean not null default false,
  games text[] not null default '{}' check (cardinality(games) <= 80 and char_length(array_to_string(games, '|')) <= 4000),
  updated_at timestamptz not null default now(),
  unique (table_id, org_id),
  foreign key (table_id, org_id) references pos.tables(id, org_id) on delete cascade
);

create table pos.ps_rate_bands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  table_id uuid not null,
  start_min smallint not null check (start_min between 0 and 1439),
  end_min smallint not null check (end_min between 1 and 1440),
  rate_per_hour numeric(18,0) not null check (rate_per_hour between 0 and 100000000),
  weekdays smallint[],                       -- 0 = Minggu ... 6 = Sabtu; null = setiap hari
  check (end_min > start_min),
  check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[])),
  foreign key (table_id, org_id) references pos.ps_stations(table_id, org_id) on delete cascade
);
create index ps_rate_bands_table on pos.ps_rate_bands (table_id);

create table pos.ps_packages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  duration_minutes int check (duration_minutes is null or duration_minutes between 5 and 1440),
  price numeric(18,0) not null check (price between 0 and 100000000),
  window_start_min smallint check (window_start_min is null or window_start_min between 0 and 1439),
  window_end_min smallint check (window_end_min is null or window_end_min between 1 and 1440),
  table_ids uuid[] not null default '{}',     -- kosong = semua station di outlet
  weekdays smallint[],
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  check ((window_start_min is null) = (window_end_min is null)),
  check (window_end_min is null or window_end_min > window_start_min),
  check ((window_start_min is null) = (duration_minutes is not null)),   -- paket jendela tanpa durasi; paket biasa wajib durasi
  check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[])),
  foreign key (outlet_id, org_id) references pos.outlets(id, org_id) on delete cascade
);
create index ps_packages_outlet on pos.ps_packages (outlet_id) where is_active;

alter table pos.outlet_settings
  add column ps_grace_minutes int not null default 5 check (ps_grace_minutes between 0 and 30),
  add column ps_booking_expiry_minutes int not null default 120 check (ps_booking_expiry_minutes between 15 and 1440),
  add column ps_booking_message text check (ps_booking_message is null or char_length(ps_booking_message) <= 600);

do $$
declare t text;
begin
  foreach t in array array['ps_stations', 'ps_rate_bands', 'ps_packages'] loop
    execute format('alter table pos.%I enable row level security', t);
    execute format('create policy sel on pos.%I for select to authenticated using (org_id in (select pos.user_org_ids()))', t);
    execute format('revoke all on pos.%I from anon', t);
    execute format('grant select on pos.%I to authenticated', t);
    execute format('grant all on pos.%I to service_role', t);
  end loop;
end $$;
create policy ins on pos.ps_packages for insert to authenticated with check (pos.can_manage(org_id));
create policy upd on pos.ps_packages for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id));
create policy del on pos.ps_packages for delete to authenticated using (pos.can_manage(org_id));
grant insert, update, delete on pos.ps_packages to authenticated;

-- Simpan konfigurasi satu station beserta pita tarifnya secara atomik. p_bands = array {start_min, end_min, rate_per_hour, weekdays|null}.
-- Pita pada hari yang sama tidak boleh bertumpuk. Meja harus berada di lantai berjenis 'ps'.
create or replace function pos.ps_station_save(p_table uuid, p_label text, p_rate numeric, p_maintenance boolean, p_games text[], p_bands jsonb) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare t pos.tables%rowtype; f_kind text; n int; i int; j int; v_days smallint[]; a jsonb; c jsonb;
  s1 int; e1 int; s2 int; e2 int; d1 int[]; d2 int[];
begin
  select * into t from pos.tables where id = p_table and deleted_at is null;
  if not found then raise exception 'table not found'; end if;
  if not pos.can_manage(t.org_id) then raise exception 'not allowed'; end if;
  select kind into f_kind from pos.floors where id = t.floor_id and deleted_at is null;
  if f_kind is distinct from 'ps' then raise exception 'not a ps floor'; end if;
  if p_bands is null then p_bands := '[]'::jsonb; end if;
  if jsonb_typeof(p_bands) <> 'array' or jsonb_array_length(p_bands) > 40 then raise exception 'invalid bands'; end if;
  n := jsonb_array_length(p_bands);
  for i in 0 .. n - 1 loop
    a := p_bands -> i;
    s1 := (a->>'start_min')::int; e1 := (a->>'end_min')::int;
    if s1 is null or e1 is null or s1 < 0 or s1 > 1439 or e1 < 1 or e1 > 1440 or e1 <= s1 then raise exception 'invalid band time'; end if;
    d1 := case when a->'weekdays' is null or jsonb_typeof(a->'weekdays') = 'null' then array[0,1,2,3,4,5,6] else array(select jsonb_array_elements_text(a->'weekdays')::int) end;
    for j in i + 1 .. n - 1 loop
      c := p_bands -> j;
      s2 := (c->>'start_min')::int; e2 := (c->>'end_min')::int;
      d2 := case when c->'weekdays' is null or jsonb_typeof(c->'weekdays') = 'null' then array[0,1,2,3,4,5,6] else array(select jsonb_array_elements_text(c->'weekdays')::int) end;
      if d1 && d2 and s1 < e2 and s2 < e1 then raise exception 'bands overlap'; end if;
    end loop;
  end loop;
  insert into pos.ps_stations(table_id, org_id, outlet_id, console_label, rate_per_hour, is_maintenance, games)
  values (p_table, t.org_id, t.outlet_id, btrim(coalesce(nullif(btrim(p_label), ''), 'PS')), coalesce(p_rate, 0), coalesce(p_maintenance, false), coalesce(p_games, '{}'))
  on conflict (table_id) do update set console_label = excluded.console_label, rate_per_hour = excluded.rate_per_hour,
    is_maintenance = excluded.is_maintenance, games = excluded.games, updated_at = now();
  delete from pos.ps_rate_bands where table_id = p_table;
  for i in 0 .. n - 1 loop
    a := p_bands -> i;
    v_days := case when a->'weekdays' is null or jsonb_typeof(a->'weekdays') = 'null' then null else array(select jsonb_array_elements_text(a->'weekdays')::smallint) end;
    insert into pos.ps_rate_bands(org_id, table_id, start_min, end_min, rate_per_hour, weekdays)
    values (t.org_id, p_table, (a->>'start_min')::smallint, (a->>'end_min')::smallint, (a->>'rate_per_hour')::numeric, v_days);
  end loop;
end $$;

-- Pengaturan PS per outlet: tenggang awal, batas hangus booking, teks pesan booking.
create or replace function pos.ps_settings_save(p_outlet uuid, p_grace int, p_expiry int, p_message text) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid;
begin
  select org_id into v_org from pos.outlets where id = p_outlet;
  if v_org is null then raise exception 'outlet not found'; end if;
  if not pos.can_manage(v_org) then raise exception 'not allowed'; end if;
  update pos.outlet_settings set ps_grace_minutes = p_grace, ps_booking_expiry_minutes = p_expiry, ps_booking_message = nullif(btrim(coalesce(p_message, '')), '') where outlet_id = p_outlet;
end $$;

revoke all on function pos.ps_station_save(uuid, text, numeric, boolean, text[], jsonb), pos.ps_settings_save(uuid, int, int, text) from public, anon;
grant execute on function pos.ps_station_save(uuid, text, numeric, boolean, text[], jsonb), pos.ps_settings_save(uuid, int, int, text) to authenticated, service_role;
