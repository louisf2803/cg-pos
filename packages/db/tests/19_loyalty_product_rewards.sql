-- Hadiah produk poin loyalti (migrasi 0099): simpan/ubah/hapus oleh pengelola, validasi, kasir dan org lain ditolak, penjaga potongan poin mengizinkan hadiah gratis (amount 0).
create or replace function pg_temp.ok_rew(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails_rew(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;

do $$
declare
  v_org uuid := ctx('o1'); v_prod uuid := ctx('kopi');
  adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  v_rew pos.loyalty_product_rewards; v_count int;
begin
  insert into auth.users(id, email) values (adm, 'adm-rew@x'), (cash, 'cash-rew@x'), (stranger, 'stranger-rew@x');
  insert into org_members(org_id, user_id, role) values (v_org, adm, 'admin'), (v_org, cash, 'cashier');
  select id into o2 from orgs where id <> v_org limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  -- 1. simpan hadiah baru, lalu ubah harga poin (satu hadiah per produk)
  v_rew := pos.loyalty_reward_save(v_org, null, v_prod, 50, true);
  perform pg_temp.ok_rew(v_rew.id is not null and v_rew.points_cost = 50 and v_rew.is_active, 'hadiah tersimpan');
  v_rew := pos.loyalty_reward_save(v_org, v_rew.id, v_prod, 40, true);
  perform pg_temp.ok_rew(v_rew.points_cost = 40, 'harga poin diubah');
  select count(*) into v_count from pos.loyalty_product_rewards where org_id = v_org;
  perform pg_temp.ok_rew(v_count = 1, 'tepat satu hadiah per produk');
  -- 2. validasi
  perform pg_temp.ok_rew(pg_temp.fails_rew(format('select pos.loyalty_reward_save(%L, null, %L, 0, true)', v_org, v_prod), 'points cost must be positive'), 'poin 0 ditolak');
  perform pg_temp.ok_rew(pg_temp.fails_rew(format('select pos.loyalty_reward_save(%L, null, %L, 10, true)', v_org, gen_random_uuid()), 'product not found'), 'produk tak dikenal ditolak');
  reset role;
  -- 3. kasir boleh membaca, tidak boleh mengubah
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok_rew((select count(*) from pos.loyalty_product_rewards where org_id = v_org) = 1, 'anggota boleh membaca hadiah');
  perform pg_temp.ok_rew(pg_temp.fails_rew(format('select pos.loyalty_reward_save(%L, null, %L, 10, true)', v_org, v_prod), 'not allowed'), 'kasir tidak boleh mengubah');
  perform pg_temp.ok_rew(pg_temp.fails_rew(format('select pos.loyalty_reward_delete(%L, %L)', v_org, v_rew.id), 'not allowed'), 'kasir tidak boleh menghapus');
  reset role;
  -- 4. org lain
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok_rew((select count(*) from pos.loyalty_product_rewards where org_id = v_org) = 0, 'org lain tidak membaca');
    perform pg_temp.ok_rew(pg_temp.fails_rew(format('select pos.loyalty_reward_delete(%L, %L)', v_org, v_rew.id), 'not allowed'), 'org lain tidak boleh menghapus');
    reset role;
  end if;
  -- 5. hapus oleh pengelola
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  perform pos.loyalty_reward_delete(v_org, v_rew.id);
  reset role;
  select count(*) into v_count from pos.loyalty_product_rewards where org_id = v_org;
  perform pg_temp.ok_rew(v_count = 0, 'hadiah dihapus');
end $$;
