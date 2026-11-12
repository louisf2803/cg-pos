-- CG POS · 0041_recurring_bills_approvals
-- Batch 2 sisi server (aditif): tagihan/biaya rutin terjadwal dan alur persetujuan pembelian/keuangan.
-- Rancangan Claude atas arahan Louis (12 Nov 2026: bila Majoo tidak bisa dilihat, rancang sendiri). ASUMSI belum dicek ke Majoo:
--  * "Mitra" memakai tabel pos.suppliers yang sudah ada (tidak ada tabel baru).
--  * Tagihan rutin: satu baris per tagihan dengan jatuh tempo berikutnya; "bayar" membuat jurnal Dr akun biaya, Cr akun kas/bank, mencatat
--    satu baris riwayat, lalu memajukan jatuh tempo (mingguan +7 hari, bulanan +1 bulan, tahunan +1 tahun). Tidak ada jurnal otomatis tanpa orang.
--  * Persetujuan: pengaju membuat permintaan (tipe purchase/finance); penyetuju harus pemilik/admin/manajer dan BUKAN pengaju, kecuali pemilik.

create table pos.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  outlet_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  supplier_id uuid,
  amount numeric(18,0) not null check (amount > 0 and amount <= 1000000000000),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  next_due date not null,
  expense_account_id uuid not null,
  is_active boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (outlet_id, org_id) references pos.outlets(id, org_id) on delete set null (outlet_id),
  foreign key (supplier_id, org_id) references pos.suppliers(id, org_id) on delete set null (supplier_id),
  foreign key (expense_account_id, org_id) references pos.accounts(id, org_id)
);
create index recurring_bills_due on pos.recurring_bills (org_id, is_active, next_due);

create table pos.recurring_bill_runs (
  bill_id uuid not null references pos.recurring_bills(id) on delete cascade,
  due_date date not null,
  paid_on date not null,
  amount numeric(18,0) not null,
  journal_entry_id uuid,
  primary key (bill_id, due_date)
);

create table pos.approval_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  kind text not null check (kind in ('purchase', 'finance')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  amount numeric(18,0) not null default 0 check (amount >= 0 and amount <= 1000000000000),
  ref_type text check (ref_type is null or char_length(ref_type) <= 40),
  ref_id uuid,
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null) or status = 'cancelled')
);
create index approval_requests_org on pos.approval_requests (org_id, status, created_at desc);

-- RLS: hanya pemilik/admin/manajer; penulisan lewat fungsi (kecuali pengaturan tagihan rutin yang boleh langsung oleh pengelola)
alter table pos.recurring_bills enable row level security;
alter table pos.recurring_bill_runs enable row level security;
alter table pos.approval_requests enable row level security;
create policy sel on pos.recurring_bills for select to authenticated using (pos.can_manage(org_id));
create policy ins on pos.recurring_bills for insert to authenticated with check (pos.can_manage(org_id));
create policy upd on pos.recurring_bills for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id));
create policy del on pos.recurring_bills for delete to authenticated using (pos.can_manage(org_id));
create policy sel on pos.recurring_bill_runs for select to authenticated using (exists (select 1 from pos.recurring_bills b where b.id = bill_id and pos.can_manage(b.org_id)));
create policy sel on pos.approval_requests for select to authenticated using (pos.can_manage(org_id));
revoke all on pos.recurring_bills, pos.recurring_bill_runs, pos.approval_requests from anon;
grant select, insert, update, delete on pos.recurring_bills to authenticated;
grant select on pos.recurring_bill_runs, pos.approval_requests to authenticated;
create trigger trg_touch_recurring_bills before update on pos.recurring_bills for each row execute function pos.touch_updated_at();

-- Bayar tagihan rutin yang jatuh tempo berikutnya. Idempoten per tagihan per jatuh tempo (jurnal dan riwayat tidak ganda).
create or replace function pos.recurring_bill_pay(p_bill uuid, p_pay_account uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare b recurring_bills%rowtype; v_je uuid; v_next date;
begin
  select * into b from recurring_bills where id = p_bill for update;
  if not found then raise exception 'bill not found'; end if;
  if not pos.is_org_admin(b.org_id) then raise exception 'not allowed'; end if;
  if not b.is_active then raise exception 'bill inactive'; end if;
  if p_date is null or p_date > current_date then raise exception 'invalid date'; end if;
  if p_pay_account is null or not exists (select 1 from accounts where id = p_pay_account and org_id = b.org_id and kind = 'detail' and is_active) then raise exception 'account not found or not postable'; end if;
  if not exists (select 1 from accounts where id = b.expense_account_id and org_id = b.org_id and kind = 'detail' and is_active) then raise exception 'account not found or not postable'; end if;
  v_je := pos.post_journal(b.org_id, b.outlet_id, p_date, 'TR', left('Tagihan rutin: ' || b.name, 200), 'recurring_bill', b.id, 'bill:' || b.id || ':' || b.next_due,
    jsonb_build_array(jsonb_build_object('account_id', b.expense_account_id, 'debit', b.amount, 'credit', 0), jsonb_build_object('account_id', p_pay_account, 'debit', 0, 'credit', b.amount)));
  insert into recurring_bill_runs(bill_id, due_date, paid_on, amount, journal_entry_id) values (b.id, b.next_due, p_date, b.amount, v_je)
    on conflict (bill_id, due_date) do nothing;
  v_next := case b.frequency when 'weekly' then b.next_due + 7 when 'monthly' then (b.next_due + interval '1 month')::date else (b.next_due + interval '1 year')::date end;
  update recurring_bills set next_due = v_next where id = b.id;
  return jsonb_build_object('bill_id', b.id, 'paid_due', b.next_due, 'next_due', v_next, 'journal_id', v_je);
end $$;

-- Ajukan persetujuan (pengelola; kasir tidak).
create or replace function pos.approval_request(p_id uuid, p_org uuid, p_kind text, p_title text, p_amount numeric, p_ref_type text, p_ref_id uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  if p_id is null then raise exception 'id required'; end if;
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if exists (select 1 from approval_requests where id = p_id) then return jsonb_build_object('id', p_id, 'already', true); end if;
  insert into approval_requests(id, org_id, kind, title, amount, ref_type, ref_id, note, requested_by)
  values (p_id, p_org, p_kind, btrim(coalesce(p_title, '')), coalesce(p_amount, 0), p_ref_type, p_ref_id, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  return jsonb_build_object('id', p_id, 'status', 'pending');
end $$;

-- Putuskan permintaan: setuju/tolak. Penyetuju bukan pengaju, kecuali pemilik.
create or replace function pos.approval_decide(p_id uuid, p_approve boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare r approval_requests%rowtype; v_status text;
begin
  select * into r from approval_requests where id = p_id for update;
  if not found then raise exception 'request not found'; end if;
  if not pos.can_manage(r.org_id) then raise exception 'not allowed'; end if;
  if r.status <> 'pending' then raise exception 'request already decided'; end if;
  if r.requested_by is not distinct from auth.uid() and pos.member_role(r.org_id) <> 'owner' then raise exception 'cannot decide own request'; end if;
  v_status := case when p_approve then 'approved' else 'rejected' end;
  update approval_requests set status = v_status, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
  return jsonb_build_object('id', p_id, 'status', v_status);
end $$;

-- Pengaju boleh membatalkan permintaannya sendiri selama masih menunggu.
create or replace function pos.approval_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare r approval_requests%rowtype;
begin
  select * into r from approval_requests where id = p_id for update;
  if not found then raise exception 'request not found'; end if;
  if not pos.can_manage(r.org_id) then raise exception 'not allowed'; end if;
  if r.status <> 'pending' then raise exception 'request already decided'; end if;
  if r.requested_by is distinct from auth.uid() and not pos.is_org_admin(r.org_id) then raise exception 'not allowed'; end if;
  update approval_requests set status = 'cancelled', decided_by = auth.uid(), decided_at = now() where id = p_id;
  return jsonb_build_object('id', p_id, 'status', 'cancelled');
end $$;

revoke all on function pos.recurring_bill_pay(uuid, uuid, date), pos.approval_request(uuid, uuid, text, text, numeric, text, uuid, text),
  pos.approval_decide(uuid, boolean, text), pos.approval_cancel(uuid) from public, anon;
grant execute on function pos.recurring_bill_pay(uuid, uuid, date), pos.approval_request(uuid, uuid, text, text, numeric, text, uuid, text),
  pos.approval_decide(uuid, boolean, text), pos.approval_cancel(uuid) to authenticated, service_role;
