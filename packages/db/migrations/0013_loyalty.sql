-- CG POS · 0013_loyalty
-- Poin loyalti dikerjakan di server lewat trigger, supaya kasir tidak perlu izin menulis buku poin (loyalty_ledger hanya bisa lewat fungsi).
--   * saldo pelanggan (customers.points_balance) = jumlah buku poin; satu-satunya yang mengubahnya adalah trigger buku poin
--   * pesanan lunas: tukar poin (kind 'redeem', dari baris order_discounts sumber 'points') dan poin didapat (kind 'earn')
--   * refund selesai: poin didapat dikurangi dan poin tukar dikembalikan, sebanding dengan bagian yang di-refund (kind 'refund_reverse')
--   * diskon poin ditolak saat disimpan bila loyalti mati, pesanan tanpa pelanggan, nilai tidak sesuai aturan, atau saldo kurang
--   * pos.loyalty_adjust: koreksi manual oleh manajer/pemilik (kind 'adjust')
-- Kegagalan poin saat pesanan lunas tidak boleh menggagalkan pembayaran: dicatat di activity_logs.
begin;
set local search_path = pos, extensions, public;

alter table loyalty_ledger add column if not exists refund_id uuid;
create unique index if not exists loyalty_ledger_order_kind on loyalty_ledger (order_id, kind) where kind in ('earn', 'redeem');
create unique index if not exists loyalty_ledger_refund_kind on loyalty_ledger (refund_id, kind) where refund_id is not null;

create or replace function pos.loyalty_ledger_apply() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  update customers set points_balance = points_balance + new.points_delta, updated_at = now()
   where id = new.customer_id and org_id = new.org_id;
  return new;
end $$;
drop trigger if exists loyalty_ledger_balance on loyalty_ledger;
create trigger loyalty_ledger_balance after insert on loyalty_ledger for each row execute function pos.loyalty_ledger_apply();

-- Penjaga: diskon poin harus sesuai aturan dan saldo.
create or replace function pos.loyalty_guard_discount() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare o orders%rowtype; r loyalty_rules%rowtype; v_bal bigint; v_other int;
begin
  if new.source <> 'points' then return new; end if;
  select * into o from orders where id = new.order_id and org_id = new.org_id;
  if o.customer_id is null then raise exception 'points discount needs a customer on the order'; end if;
  select * into r from loyalty_rules where org_id = new.org_id;
  if not found or not r.is_active then raise exception 'loyalty is not active'; end if;
  if coalesce(new.points_used, 0) <= 0 then raise exception 'points_used must be positive'; end if;
  if new.amount <> new.points_used * r.redeem_value_per_point then
    raise exception 'points discount % does not match rule (% points x %)', new.amount, new.points_used, r.redeem_value_per_point;
  end if;
  select points_balance into v_bal from customers where id = o.customer_id and org_id = new.org_id;
  select coalesce(sum(points_used), 0) into v_other from order_discounts where order_id = new.order_id and source = 'points';
  if coalesce(v_bal, 0) < new.points_used + v_other then
    raise exception 'not enough points: % available', coalesce(v_bal, 0);
  end if;
  return new;
end $$;
drop trigger if exists loyalty_guard on order_discounts;
create trigger loyalty_guard before insert on order_discounts for each row execute function pos.loyalty_guard_discount();

-- Pesanan lunas: tukar poin lalu hitung poin didapat.
create or replace function pos.loyalty_on_paid() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare r loyalty_rules%rowtype; v_has boolean; v_used int; v_earn int;
begin
  if new.customer_id is null then return new; end if;
  begin
    select * into r from loyalty_rules where org_id = new.org_id;
    v_has := found;
    select coalesce(sum(points_used), 0) into v_used from order_discounts where order_id = new.id and source = 'points';
    if v_used > 0 then
      insert into loyalty_ledger(org_id, customer_id, order_id, points_delta, kind, note)
      values (new.org_id, new.customer_id, new.id, -v_used, 'redeem', 'Tukar poin ' || new.number) on conflict do nothing;
    end if;
    if v_has and r.is_active and r.earn_amount > 0 and r.earn_points > 0 then
      v_earn := floor(new.total / r.earn_amount)::int * r.earn_points;
      if v_earn > 0 then
        insert into loyalty_ledger(org_id, customer_id, order_id, points_delta, kind, note)
        values (new.org_id, new.customer_id, new.id, v_earn, 'earn', 'Belanja ' || new.number) on conflict do nothing;
      end if;
    end if;
  exception when others then
    insert into activity_logs(org_id, outlet_id, action, entity, entity_id, detail)
    values (new.org_id, new.outlet_id, 'loyalty.paid_failed', 'order', new.id, jsonb_build_object('error', sqlerrm));
  end;
  return new;
end $$;
drop trigger if exists loyalty_paid on orders;
create trigger loyalty_paid after update of status on orders
  for each row when (new.status = 'paid' and old.status is distinct from 'paid') execute function pos.loyalty_on_paid();

-- Refund selesai: poin didapat dikurangi dan poin tukar dikembalikan sebanding bagian yang di-refund.
create or replace function pos.loyalty_on_refund() returns trigger
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare o orders%rowtype; v_earned int; v_redeemed int; v_delta int;
begin
  begin
    select * into o from orders where id = new.order_id;
    if o.customer_id is null or o.paid_total <= 0 then return new; end if;
    select coalesce(sum(points_delta), 0) into v_earned from loyalty_ledger where order_id = o.id and kind = 'earn';
    select coalesce(-sum(points_delta), 0) into v_redeemed from loyalty_ledger where order_id = o.id and kind = 'redeem';
    v_delta := floor(v_redeemed * new.total / o.paid_total)::int - floor(v_earned * new.total / o.paid_total)::int;
    if v_delta <> 0 then
      insert into loyalty_ledger(org_id, customer_id, order_id, refund_id, points_delta, kind, note)
      values (new.org_id, o.customer_id, o.id, new.id, v_delta, 'refund_reverse', 'Refund ' || new.number) on conflict do nothing;
    end if;
  exception when others then
    insert into activity_logs(org_id, outlet_id, action, entity, entity_id, detail)
    values (new.org_id, new.outlet_id, 'loyalty.refund_failed', 'refund', new.id, jsonb_build_object('error', sqlerrm));
  end;
  return new;
end $$;
drop trigger if exists loyalty_refund_ins on refunds;
create trigger loyalty_refund_ins after insert on refunds
  for each row when (new.status = 'completed') execute function pos.loyalty_on_refund();
drop trigger if exists loyalty_refund_upd on refunds;
create trigger loyalty_refund_upd after update of status on refunds
  for each row when (new.status = 'completed' and old.status is distinct from 'completed') execute function pos.loyalty_on_refund();

-- Koreksi manual. Saldo tidak boleh jadi negatif.
create or replace function pos.loyalty_adjust(p_customer uuid, p_delta int, p_note text) returns bigint
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer and deleted_at is null;
  if not found then raise exception 'customer not found'; end if;
  if not pos.can_manage(c.org_id) then raise exception 'not allowed'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'delta must not be zero'; end if;
  if c.points_balance + p_delta < 0 then raise exception 'balance would become negative'; end if;
  insert into loyalty_ledger(org_id, customer_id, points_delta, kind, note)
  values (c.org_id, c.id, p_delta, 'adjust', nullif(left(trim(coalesce(p_note, '')), 200), ''));
  return (select points_balance from customers where id = c.id);
end $$;
revoke all on function pos.loyalty_adjust(uuid, int, text) from public;
grant execute on function pos.loyalty_adjust(uuid, int, text) to authenticated, service_role;

-- fungsi trigger tidak untuk dipanggil klien
revoke all on function pos.loyalty_ledger_apply(), pos.loyalty_guard_discount(), pos.loyalty_on_paid(), pos.loyalty_on_refund() from public, anon, authenticated;

commit;
