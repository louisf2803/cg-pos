-- Hadiah Produk Poin Loyalti (migrasi 0099)
create or replace function pg_temp.ok_rew(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  v_org uuid := ctx('o1');
  v_prod uuid := ctx('kopi');
  v_rew pos.loyalty_product_rewards;
  v_count int;
begin
  -- 1. Simpan hadiah produk baru
  v_rew := pos.loyalty_reward_save(v_org, null, v_prod, 50, true);
  perform pg_temp.ok_rew(v_rew.id is not null, 'reward id terisi');
  perform pg_temp.ok_rew(v_rew.points_cost = 50, 'points cost 50');
  perform pg_temp.ok_rew(v_rew.is_active = true, 'is_active true');

  -- 2. Update points_cost hadiah produk yang sama
  v_rew := pos.loyalty_reward_save(v_org, v_rew.id, v_prod, 40, true);
  perform pg_temp.ok_rew(v_rew.points_cost = 40, 'points cost diupdate jadi 40');

  select count(*) into v_count from pos.loyalty_product_rewards where org_id = v_org;
  perform pg_temp.ok_rew(v_count = 1, 'tepat 1 reward tersimpan');

  -- 3. Points cost negatif ditolak
  begin
    perform pos.loyalty_reward_save(v_org, null, v_prod, 0, true);
    raise exception 'seharusnya ditolak points <= 0';
  exception when others then
    perform pg_temp.ok_rew(sqlerrm like '%points cost must be positive%', 'validasi points cost > 0: ' || sqlerrm);
  end;

  -- 4. Hapus hadiah produk
  perform pos.loyalty_reward_delete(v_org, v_rew.id);
  select count(*) into v_count from pos.loyalty_product_rewards where org_id = v_org;
  perform pg_temp.ok_rew(v_count = 0, 'reward berhasil dihapus');
end $$;
