-- Grup Pelanggan, Harga Grosir Bertingkat, dan Penjadwalan Harga (migrasi 0097)
create or replace function pg_temp.ok97(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails97(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;

do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  grp_id uuid := gen_random_uuid(); cust_id uuid := gen_random_uuid(); prod_id uuid;
  sched_id uuid := gen_random_uuid(); tier_id uuid := gen_random_uuid();
  r_grp pos.customer_groups%rowtype; r_tier pos.tiered_prices%rowtype; r_sched pos.price_schedules%rowtype;
begin
  insert into auth.users(id, email) values (adm, 'adm-grp@test'), (stranger, 'stranger-grp@test');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;

  select id into prod_id from pos.products where org_id = o1 and deleted_at is null limit 1;
  insert into pos.customers (id, org_id, name, phone) values (cust_id, o1, 'Pelanggan Uji Grosir', '081234567890');

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;

  -- 1. Uji Buat & Ubah Grup Pelanggan
  r_grp := pos.customer_group_save(o1, grp_id, 'Reseller VIP', 'Mitra grosir utama');
  perform pg_temp.ok97(r_grp.name = 'Reseller VIP' and r_grp.description = 'Mitra grosir utama', 'grup pelanggan tersimpan');

  r_grp := pos.customer_group_save(o1, grp_id, 'Reseller Super VIP', 'Deskripsi diperbarui');
  perform pg_temp.ok97(r_grp.name = 'Reseller Super VIP', 'grup pelanggan berhasil diubah');

  -- 2. Uji Penetapan Pelanggan ke Grup
  perform pos.customer_group_assign(o1, cust_id, grp_id);
  perform pg_temp.ok97((select group_id from pos.customer_group_members where customer_id = cust_id) = grp_id, 'anggota grup terdaftar di customer_group_members');
  perform pg_temp.ok97((select group_id from pos.customers where id = cust_id) = grp_id, 'customers.group_id tersinkron');

  -- 3. Uji Harga Grosir Bertingkat
  r_tier := pos.tiered_price_save(
    o1,
    tier_id,
    grp_id,
    prod_id,
    '[{"tier": 1, "minQty": 5, "unitPrice": 18000}, {"tier": 2, "minQty": 10, "unitPrice": 16000}]'::jsonb
  );
  perform pg_temp.ok97(jsonb_array_length(r_tier.tiers) = 2, 'harga bertingkat 2 tingkat tersimpan');

  -- Validasi maksimal 5 tingkat
  perform pg_temp.ok97(pg_temp.fails97(format(
    'select pos.tiered_price_save(%L, gen_random_uuid(), %L, %L, ''[{"tier":1,"minQty":1,"unitPrice":100},{"tier":2,"minQty":2,"unitPrice":90},{"tier":3,"minQty":3,"unitPrice":80},{"tier":4,"minQty":4,"unitPrice":70},{"tier":5,"minQty":5,"unitPrice":60},{"tier":6,"minQty":6,"unitPrice":50}]''::jsonb)',
    o1, grp_id, prod_id
  ), 'invalid tiers count'), 'lebih dari 5 tingkat ditolak');

  -- 4. Uji Penjadwalan Harga
  r_sched := pos.price_schedule_save(
    o1,
    sched_id,
    prod_id,
    15000,
    now() + interval '1 hour',
    now() + interval '5 hours',
    'Promo Sore Hari'
  );
  perform pg_temp.ok97(r_sched.price = 15000 and r_sched.note = 'Promo Sore Hari', 'jadwal harga tersimpan');

  -- Validasi waktu selesai harus setelah waktu mulai
  perform pg_temp.ok97(pg_temp.fails97(format(
    'select pos.price_schedule_save(%L, gen_random_uuid(), %L, 10000, now() + interval ''2 hours'', now() + interval ''1 hour'', ''Galat'')',
    o1, prod_id
  ), 'end time must be after start time'), 'jadwal berakhir sebelum mulai ditolak');

  -- 5. Hapus
  perform pos.price_schedule_delete(o1, sched_id);
  perform pg_temp.ok97((select count(*) from pos.price_schedules where id = sched_id) = 0, 'jadwal harga terhapus');

  perform pos.tiered_price_delete(o1, tier_id);
  perform pg_temp.ok97((select count(*) from pos.tiered_prices where id = tier_id) = 0, 'harga bertingkat terhapus');

  perform pos.customer_group_assign(o1, cust_id, null);
  perform pg_temp.ok97((select count(*) from pos.customer_group_members where customer_id = cust_id) = 0, 'anggota dilepas dari grup');

  perform pos.customer_group_delete(o1, grp_id);
  perform pg_temp.ok97((select count(*) from pos.customer_groups where id = grp_id) = 0, 'grup pelanggan terhapus');
end $$;

