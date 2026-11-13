-- CG POS · 0099_loyalty_product_rewards
-- Tabel dan fungsi penukaran poin loyalti menjadi produk gratis (hadiah produk).
begin;
set local search_path = pos, extensions, public;

create table if not exists pos.loyalty_product_rewards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.organizations(id) on delete cascade,
  product_id uuid not null references pos.products(id) on delete cascade,
  points_cost integer not null check (points_cost > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, product_id)
);

create index if not exists idx_loyalty_product_rewards_org on pos.loyalty_product_rewards (org_id);

alter table pos.loyalty_product_rewards enable row level security;

drop policy if exists loyalty_product_rewards_org on pos.loyalty_product_rewards;
create policy loyalty_product_rewards_org on pos.loyalty_product_rewards
  for select to authenticated
  using (org_id in (select org_id from pos.memberships where user_id = auth.uid()));

drop policy if exists loyalty_product_rewards_manage on pos.loyalty_product_rewards;
create policy loyalty_product_rewards_manage on pos.loyalty_product_rewards
  for all to authenticated
  using (pos.can_manage(org_id))
  with check (pos.can_manage(org_id));

create or replace function pos.loyalty_reward_save(
  p_org uuid,
  p_id uuid,
  p_product_id uuid,
  p_points_cost int,
  p_is_active boolean
) returns pos.loyalty_product_rewards
language plpgsql security definer set search_path = pos, pg_temp as $$
declare
  v_res pos.loyalty_product_rewards;
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if not exists (select 1 from pos.products where id = p_product_id and org_id = p_org and deleted_at is null) then
    raise exception 'product not found';
  end if;
  if p_points_cost is null or p_points_cost <= 0 then
    raise exception 'points cost must be positive';
  end if;

  insert into pos.loyalty_product_rewards (id, org_id, product_id, points_cost, is_active, updated_at)
  values (coalesce(p_id, gen_random_uuid()), p_org, p_product_id, p_points_cost, coalesce(p_is_active, true), now())
  on conflict (org_id, product_id) do update
     set points_cost = excluded.points_cost,
         is_active = excluded.is_active,
         updated_at = now()
  returning * into v_res;
  return v_res;
end $$;

create or replace function pos.loyalty_reward_delete(
  p_org uuid,
  p_id uuid
) returns void
language plpgsql security definer set search_path = pos, pg_temp as $$
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  delete from pos.loyalty_product_rewards where id = p_id and org_id = p_org;
end $$;

-- Penjaga potongan poin diperbarui agar mengizinkan penukaran produk gratis (amount = 0 dengan points_used > 0)
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
  if new.amount > 0 and new.amount <> new.points_used * r.redeem_value_per_point then
    raise exception 'points discount % does not match rule (% points x %)', new.amount, new.points_used, r.redeem_value_per_point;
  end if;
  select points_balance into v_bal from customers where id = o.customer_id and org_id = new.org_id;
  select coalesce(sum(points_used), 0) into v_other from order_discounts
   where order_id = new.order_id and source = 'points' and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if coalesce(v_bal, 0) < new.points_used + v_other then
    raise exception 'not enough points: % available', coalesce(v_bal, 0);
  end if;
  return new;
end $$;

grant select on pos.loyalty_product_rewards to authenticated;
grant execute on function pos.loyalty_reward_save to authenticated;
grant execute on function pos.loyalty_reward_delete to authenticated;

commit;
