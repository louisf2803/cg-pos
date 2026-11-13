-- CG POS · 0105_appointments
-- Reservasi dan appointment dengan kalender (A143):
-- Tabel appointments, pencegahan bentrok jadwal di server, dan RLS untuk pemilik/manajer.
begin;
set local search_path = pos, extensions, public;

create table pos.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid not null references pos.outlets(id) on delete cascade,
  customer_id uuid references pos.customers(id) on delete set null,
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 120),
  customer_phone text not null check (char_length(btrim(customer_phone)) between 1 and 40),
  kind text not null check (kind in ('service', 'facility', 'table')),
  target_id uuid,
  target_name text not null check (char_length(btrim(target_name)) between 1 and 120),
  date date not null,
  start_time text not null check (start_time ~ '^[0-9]{2}:[0-9]{2}$'),
  end_time text not null check (end_time ~ '^[0-9]{2}:[0-9]{2}$'),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  note text,
  sync_seq bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time),
  check (start_at < end_at)
);

create index appointments_org_date on pos.appointments (org_id, date) where deleted_at is null;
create index appointments_target on pos.appointments (org_id, kind, target_id, date) where deleted_at is null;

-- Trigger pencegahan bentrok jadwal di sisi server (A143)
create or replace function pos.check_appointment_conflict() returns trigger language plpgsql set search_path = pos, extensions, pg_temp as $$
declare
  conflict_id uuid;
begin
  if new.deleted_at is not null or new.status = 'cancelled' then
    return new;
  end if;

  select id into conflict_id
  from pos.appointments
  where org_id = new.org_id
    and outlet_id = new.outlet_id
    and kind = new.kind
    and date = new.date
    and status <> 'cancelled'
    and deleted_at is null
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and (
      (new.target_id is not null and target_id = new.target_id)
      or (new.target_id is null and lower(btrim(target_name)) = lower(btrim(new.target_name)))
    )
    and (start_time < new.end_time and new.start_time < end_time)
  limit 1;

  if conflict_id is not null then
    raise exception 'Jadwal bentrok: % sudah dipesan pada waktu % - %', new.target_name, new.start_time, new.end_time;
  end if;

  return new;
end $$;

create trigger trg_appointment_conflict
before insert or update on pos.appointments
for each row execute function pos.check_appointment_conflict();

create trigger trg_touch_appointments before update on pos.appointments for each row execute function pos.touch_updated_at();
create trigger trg_seq_appointments before insert or update on pos.appointments for each row execute function pos.set_sync_seq();
create trigger trg_log_appointments after insert or update or delete on pos.appointments for each row execute function pos.log_change('appointment');

alter table pos.appointments enable row level security;
create policy sel on pos.appointments for select to authenticated using (org_id in (select pos.user_org_ids()));
create policy ins on pos.appointments for insert to authenticated with check (pos.can_manage(org_id));
create policy upd on pos.appointments for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id));
create policy del on pos.appointments for delete to authenticated using (pos.can_manage(org_id));

revoke all on pos.appointments from anon;
grant select, insert, update, delete on pos.appointments to authenticated, service_role;

commit;

