-- CG POS · 0042_stock_requests
-- Permintaan barang (barang jual/bahan) antar lokasi: lokasi peminta meminta stok dari lokasi sumber. Alur: diminta -> disetujui/ditolak ->
-- dipenuhi (membuat transfer stok lewat pos.stock_transfer_create dari 0024, jadi stok keluar dari sumber dan masuk saat diterima) atau dibatalkan.
-- Rancangan Claude atas arahan Louis (12 Nov 2026; Majoo tidak bisa dilihat). ASUMSI belum dicek ke Majoo: persetujuan oleh pengelola di
-- lokasi sumber/pusat (pemilik/admin/manajer), tidak ada tautan ke PO/uang muka (menyusul bila Louis mengonfirmasi alur Majoo).
-- Tabel hanya bisa diubah lewat fungsi di bawah; pengelola (pos.can_manage) boleh membaca.

create table pos.stock_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  number text not null,
  requester_location_id uuid not null,
  source_location_id uuid not null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'fulfilled', 'cancelled')),
  note text check (note is null or char_length(note) <= 300),
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  transfer_id uuid,
  created_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (requester_location_id, org_id) references pos.locations(id, org_id),
  foreign key (source_location_id, org_id) references pos.locations(id, org_id),
  unique (org_id, number),
  unique (id, org_id),
  check (requester_location_id <> source_location_id)
);
create index stock_requests_org on pos.stock_requests (org_id, status, created_at desc);

create table pos.stock_request_lines (
  request_id uuid not null,
  product_id uuid not null,
  org_id uuid not null references pos.orgs(id) on delete cascade,
  qty numeric(18,4) not null check (qty > 0 and qty <= 1000000000),
  primary key (request_id, product_id),
  foreign key (request_id, org_id) references pos.stock_requests(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references pos.products(id, org_id)
);

alter table pos.stock_requests enable row level security;
alter table pos.stock_request_lines enable row level security;
create policy sel on pos.stock_requests for select to authenticated using (pos.can_manage(org_id));
create policy sel on pos.stock_request_lines for select to authenticated using (pos.can_manage(org_id));
revoke all on pos.stock_requests, pos.stock_request_lines from anon;
grant select on pos.stock_requests, pos.stock_request_lines to authenticated;

-- Buat permintaan. p_lines = [{product_id, qty}]. Idempoten menurut p_id.
create or replace function pos.stock_request_create(p_id uuid, p_requester uuid, p_source uuid, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare a pos.locations%rowtype; b pos.locations%rowtype; r pos.stock_requests%rowtype; ln jsonb; v_pid uuid; v_qty numeric; v_seen uuid[] := '{}'; v_num bigint; v_n int := 0;
begin
  if auth.uid() is null then raise exception 'no access'; end if;
  if p_id is null then raise exception 'id required'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'lines required'; end if;
  if jsonb_array_length(p_lines) > 200 then raise exception 'too many lines'; end if;
  select * into a from pos.locations where id = p_requester and is_active;
  select * into b from pos.locations where id = p_source and is_active;
  if a.id is null or b.id is null then raise exception 'location not found'; end if;
  if a.org_id <> b.org_id then raise exception 'locations belong to different organizations'; end if;
  if a.id = b.id then raise exception 'from and to must differ'; end if;
  if not pos.can_manage(a.org_id) then raise exception 'not allowed'; end if;
  select * into r from pos.stock_requests where id = p_id;
  if found then
    if r.org_id <> a.org_id then raise exception 'not allowed'; end if;
    return jsonb_build_object('id', r.id, 'number', r.number, 'status', r.status, 'duplicate', true);
  end if;
  v_num := pos.next_doc_number(a.org_id, 'SRQ', 0);
  insert into pos.stock_requests(id, org_id, number, requester_location_id, source_location_id, note, created_by)
  values (p_id, a.org_id, 'REQ-' || lpad(v_num::text, 6, '0'), a.id, b.id, nullif(left(trim(coalesce(p_note, '')), 300), ''), auth.uid()) returning * into r;
  for ln in select * from jsonb_array_elements(p_lines) loop
    v_pid := (ln->>'product_id')::uuid; v_qty := (ln->>'qty')::numeric;
    if v_pid is null or v_qty is null or v_qty <= 0 or v_qty > 1000000000 or v_qty <> round(v_qty, 4) then raise exception 'invalid line'; end if;
    if v_pid = any(v_seen) then raise exception 'duplicate product in lines'; end if;
    v_seen := v_seen || v_pid;
    if not exists (select 1 from pos.products where id = v_pid and org_id = a.org_id and deleted_at is null and track_stock and kind in ('goods', 'ingredient')) then raise exception 'product does not track stock'; end if;
    insert into pos.stock_request_lines(request_id, product_id, org_id, qty) values (r.id, v_pid, a.org_id, v_qty);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('id', r.id, 'number', r.number, 'status', r.status, 'duplicate', false, 'lines', v_n);
end $$;

-- Setujui atau tolak (pengelola). Keputusan final; hanya permintaan berstatus diminta.
create or replace function pos.stock_request_decide(p_id uuid, p_approve boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare r pos.stock_requests%rowtype; v_status text;
begin
  select * into r from pos.stock_requests where id = p_id for update;
  if not found then raise exception 'request not found'; end if;
  if not pos.can_manage(r.org_id) then raise exception 'not allowed'; end if;
  if r.status <> 'requested' then raise exception 'request already decided'; end if;
  v_status := case when p_approve then 'approved' else 'rejected' end;
  update pos.stock_requests set status = v_status, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(left(trim(coalesce(p_note, '')), 300), '') where id = p_id;
  return jsonb_build_object('id', p_id, 'status', v_status);
end $$;

-- Penuhi permintaan yang disetujui: membuat transfer stok dari lokasi sumber ke lokasi peminta dengan seluruh baris permintaan.
create or replace function pos.stock_request_fulfill(p_id uuid, p_transfer_id uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare r pos.stock_requests%rowtype; v_lines jsonb; v_t jsonb;
begin
  select * into r from pos.stock_requests where id = p_id for update;
  if not found then raise exception 'request not found'; end if;
  if not pos.can_manage(r.org_id) then raise exception 'not allowed'; end if;
  if r.status <> 'approved' then raise exception 'request not approved'; end if;
  select jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty) order by product_id) into v_lines from pos.stock_request_lines where request_id = r.id;
  v_t := pos.stock_transfer_create(p_transfer_id, r.source_location_id, r.requester_location_id, 'Permintaan ' || r.number, v_lines);
  update pos.stock_requests set status = 'fulfilled', transfer_id = (v_t->>'id')::uuid where id = r.id;
  return jsonb_build_object('id', r.id, 'status', 'fulfilled', 'transfer_id', v_t->>'id', 'transfer_number', v_t->>'number');
end $$;

-- Batalkan selama diminta atau disetujui (pengelola).
create or replace function pos.stock_request_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare r pos.stock_requests%rowtype;
begin
  select * into r from pos.stock_requests where id = p_id for update;
  if not found then raise exception 'request not found'; end if;
  if not pos.can_manage(r.org_id) then raise exception 'not allowed'; end if;
  if r.status not in ('requested', 'approved') then raise exception 'request already decided'; end if;
  update pos.stock_requests set status = 'cancelled', decided_by = auth.uid(), decided_at = now() where id = p_id;
  return jsonb_build_object('id', p_id, 'status', 'cancelled');
end $$;

revoke all on function pos.stock_request_create(uuid, uuid, uuid, text, jsonb), pos.stock_request_decide(uuid, boolean, text),
  pos.stock_request_fulfill(uuid, uuid), pos.stock_request_cancel(uuid) from public, anon;
grant execute on function pos.stock_request_create(uuid, uuid, uuid, text, jsonb), pos.stock_request_decide(uuid, boolean, text),
  pos.stock_request_fulfill(uuid, uuid), pos.stock_request_cancel(uuid) to authenticated, service_role;
