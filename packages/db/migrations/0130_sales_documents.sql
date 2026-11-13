-- CG POS · 0130_sales_documents
-- Dokumen penjualan berantai (A130): penawaran -> pesanan -> pengiriman -> penerimaan -> faktur (faktur dari 0129).
-- Satu tabel dokumen + baris. Dokumen turunan dibuat dari induknya (baris disalin, induk menjadi 'converted'). Dokumen tidak membuat jurnal
-- dan tidak menggerakkan stok (asumsi belum dicek ke Majoo); jurnal dibuat saat faktur. Tabel hanya berubah lewat fungsi.

create table pos.sales_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  doc_type text not null check (doc_type in ('quote', 'order', 'delivery', 'receipt')),
  number text not null,
  customer_id uuid,
  parent_id uuid,
  invoice_id uuid,
  doc_date date not null,
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'open' check (status in ('open', 'converted', 'cancelled')),
  total numeric(18,2) not null default 0 check (total >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (customer_id, org_id) references pos.customers(id, org_id),
  foreign key (parent_id, org_id) references pos.sales_documents(id, org_id),
  foreign key (invoice_id, org_id) references pos.sales_invoices(id, org_id),
  unique (org_id, number),
  unique (id, org_id)
);
create index sales_documents_org on pos.sales_documents (org_id, doc_type, doc_date desc);

create table pos.sales_document_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  doc_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  qty numeric(18,4) not null check (qty > 0 and qty <= 1000000000),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  line_total numeric(18,2) not null check (line_total >= 0),
  foreign key (doc_id, org_id) references pos.sales_documents(id, org_id) on delete cascade
);
create index sales_document_lines_doc on pos.sales_document_lines (doc_id);

alter table pos.sales_documents enable row level security;
alter table pos.sales_document_lines enable row level security;
create policy sel on pos.sales_documents for select to authenticated using (pos.can_manage(org_id));
create policy sel on pos.sales_document_lines for select to authenticated using (pos.can_manage(org_id));
revoke all on pos.sales_documents, pos.sales_document_lines from anon;
grant select on pos.sales_documents, pos.sales_document_lines to authenticated;

-- Buat dokumen. p_parent null = dokumen baru (hanya boleh untuk penawaran atau pesanan; p_lines wajib).
-- p_parent diisi = turunan: jenis harus sesuai urutan (pesanan dari penawaran, pengiriman dari pesanan, penerimaan dari pengiriman),
-- induk harus 'open'; baris disalin dari induk bila p_lines null. Idempoten menurut p_id.
create or replace function pos.sales_doc_create(p_id uuid, p_org uuid, p_type text, p_customer uuid, p_date date, p_note text, p_parent uuid, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  d sales_documents%rowtype; par sales_documents%rowtype; ln jsonb; v_num bigint; v_prefix text; v_total numeric := 0; v_n int := 0;
  v_cust uuid := p_customer; v_qty numeric; v_price numeric; v_name text; src record; v_need text;
begin
  if p_id is null then raise exception 'id required'; end if;
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  select * into d from sales_documents where id = p_id;
  if found then
    if d.org_id <> p_org then raise exception 'not allowed'; end if;
    return jsonb_build_object('id', d.id, 'number', d.number, 'already', true);
  end if;
  if p_type not in ('quote', 'order', 'delivery', 'receipt') then raise exception 'invalid type'; end if;
  if p_parent is null then
    if p_type not in ('quote', 'order') then raise exception 'parent required'; end if;
    if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'document has no lines'; end if;
  else
    select * into par from sales_documents where id = p_parent and org_id = p_org for update;
    if not found then raise exception 'parent not found'; end if;
    v_need := case p_type when 'order' then 'quote' when 'delivery' then 'order' else 'delivery' end;
    if par.doc_type <> v_need then raise exception 'wrong parent type'; end if;
    if par.status <> 'open' then raise exception 'parent not open'; end if;
    v_cust := coalesce(v_cust, par.customer_id);
  end if;
  if p_lines is not null and jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 300 then raise exception 'too many lines'; end if;
  if v_cust is not null and not exists (select 1 from customers where id = v_cust and org_id = p_org and deleted_at is null) then raise exception 'customer not found'; end if;
  v_prefix := case p_type when 'quote' then 'PNW' when 'order' then 'PSN' when 'delivery' then 'PGR' else 'PNR' end;
  v_num := pos.next_doc_number(p_org, 'SD-' || p_type, 0);
  insert into sales_documents(id, org_id, doc_type, number, customer_id, parent_id, doc_date, note, created_by)
  values (p_id, p_org, p_type, v_prefix || '-' || lpad(v_num::text, 6, '0'), v_cust, p_parent, coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date),
          nullif(left(btrim(coalesce(p_note, '')), 300), ''), auth.uid())
  returning * into d;
  if p_lines is not null and jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0 then
    for ln in select * from jsonb_array_elements(p_lines) loop
      v_qty := (ln->>'qty')::numeric; v_price := (ln->>'unit_price')::numeric; v_name := btrim(coalesce(ln->>'name', ''));
      if v_qty is null or v_qty <= 0 or v_qty > 1000000000 or v_qty <> round(v_qty, 4) then raise exception 'invalid line'; end if;
      if v_price is null or v_price < 0 or v_price > 1000000000000 or v_price <> round(v_price, 2) then raise exception 'invalid line'; end if;
      if char_length(v_name) < 1 or char_length(v_name) > 120 then raise exception 'invalid line'; end if;
      insert into sales_document_lines(org_id, doc_id, name, qty, unit_price, line_total) values (p_org, d.id, v_name, v_qty, v_price, round(v_qty * v_price, 2));
      v_total := v_total + round(v_qty * v_price, 2); v_n := v_n + 1;
    end loop;
  else
    for src in select name, qty, unit_price, line_total from sales_document_lines where doc_id = p_parent loop
      insert into sales_document_lines(org_id, doc_id, name, qty, unit_price, line_total) values (p_org, d.id, src.name, src.qty, src.unit_price, src.line_total);
      v_total := v_total + src.line_total; v_n := v_n + 1;
    end loop;
  end if;
  update sales_documents set total = v_total where id = d.id;
  if p_parent is not null then update sales_documents set status = 'converted' where id = p_parent; end if;
  return jsonb_build_object('id', d.id, 'number', d.number, 'total', v_total, 'lines', v_n);
end $$;

-- Batalkan dokumen yang masih 'open'. Dokumen yang sudah dilanjutkan tidak bisa dibatalkan.
create or replace function pos.sales_doc_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare d sales_documents%rowtype;
begin
  select * into d from sales_documents where id = p_id for update;
  if not found then raise exception 'document not found'; end if;
  if not pos.can_manage(d.org_id) then raise exception 'not allowed'; end if;
  if d.status = 'cancelled' then return jsonb_build_object('id', d.id, 'status', 'cancelled', 'already', true); end if;
  if d.status <> 'open' then raise exception 'document already continued'; end if;
  update sales_documents set status = 'cancelled' where id = d.id;
  return jsonb_build_object('id', d.id, 'status', 'cancelled');
end $$;

-- Hubungkan dokumen ke faktur penjualan (0129). Hanya pesanan atau penerimaan yang masih 'open'; dokumen menjadi 'converted'.
create or replace function pos.sales_doc_link_invoice(p_doc uuid, p_invoice uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare d sales_documents%rowtype;
begin
  select * into d from sales_documents where id = p_doc for update;
  if not found then raise exception 'document not found'; end if;
  if not pos.can_manage(d.org_id) then raise exception 'not allowed'; end if;
  if d.doc_type not in ('order', 'receipt') then raise exception 'wrong document type'; end if;
  if d.status <> 'open' then raise exception 'document not open'; end if;
  if not exists (select 1 from sales_invoices where id = p_invoice and org_id = d.org_id) then raise exception 'invoice not found'; end if;
  update sales_documents set invoice_id = p_invoice, status = 'converted' where id = d.id;
  return jsonb_build_object('id', d.id, 'invoice_id', p_invoice);
end $$;

revoke all on function pos.sales_doc_create(uuid, uuid, text, uuid, date, text, uuid, jsonb), pos.sales_doc_cancel(uuid), pos.sales_doc_link_invoice(uuid, uuid) from public, anon;
grant execute on function pos.sales_doc_create(uuid, uuid, text, uuid, date, text, uuid, jsonb), pos.sales_doc_cancel(uuid), pos.sales_doc_link_invoice(uuid, uuid) to authenticated, service_role;
