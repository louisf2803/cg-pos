-- Produksi stok (migrasi 0137): acuan dengan validasi, perintah produksi mengurangi bahan dan menambah barang jadi dengan harga perolehan dari biaya bahan,
-- idempoten, stok kurang ditolak bila stok negatif dilarang, acuan yang sudah dipakai tidak bisa dihapus, kasir dan org lain ditolak.
create or replace function pg_temp.ok37(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails37(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;
do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  loc uuid; outl uuid; tpl uuid := gen_random_uuid(); run1 uuid := gen_random_uuid(); run2 uuid := gen_random_uuid(); run3 uuid := gen_random_uuid();
  flour uuid := gen_random_uuid(); sugar uuid := gen_random_uuid(); bread uuid := gen_random_uuid(); svc uuid := gen_random_uuid();
  r jsonb; v_avg numeric; v_allow boolean;
begin
  insert into auth.users(id, email) values (adm, 'adm-pr@x'), (cash, 'cash-pr@x'), (stranger, 'stranger-pr@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  select id, outlet_id into loc, outl from locations where org_id = o1 and is_active limit 1;
  select allow_negative_stock into v_allow from outlet_settings where outlet_id = outl;
  insert into products(id, org_id, kind, name, is_sellable, track_stock) values
    (flour, o1, 'ingredient', 'Tepung Uji Produksi', false, true), (sugar, o1, 'ingredient', 'Gula Uji Produksi', false, true),
    (bread, o1, 'goods', 'Roti Uji Produksi', true, true), (svc, o1, 'service', 'Jasa Uji Produksi', true, false);
  -- stok awal: tepung 10 @ 5000, gula 5 @ 10000
  insert into stock_movements(org_id, location_id, product_id, kind, qty_delta, unit_cost, ref_type, source_key) values
    (o1, loc, flour, 'opening', 10, 5000, 'test', 'pr-flour'), (o1, loc, sugar, 'opening', 5, 10000, 'test', 'pr-sugar');

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  -- acuan: 2 tepung + 1 gula = 4 roti
  perform pos.production_template_save(tpl, o1, 'Roti Tawar', bread, 4, 'Satu loyang', true,
    jsonb_build_array(jsonb_build_object('product_id', flour, 'qty', 2), jsonb_build_object('product_id', sugar, 'qty', 1)));
  perform pg_temp.ok37((select count(*) from pos.production_template_lines where template_id = tpl) = 2, 'acuan tersimpan dengan 2 bahan');
  perform pos.production_template_save(tpl, o1, 'Roti Tawar Besar', bread, 4, null, true,
    jsonb_build_array(jsonb_build_object('product_id', flour, 'qty', 2), jsonb_build_object('product_id', sugar, 'qty', 1)));
  perform pg_temp.ok37((select name from pos.production_templates where id = tpl) = 'Roti Tawar Besar', 'acuan bisa diubah');
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.production_template_save(%L, %L, ''X'', %L, 1, null, true, ''[]'')', gen_random_uuid(), o1, bread), 'template has no ingredients'), 'tanpa bahan ditolak');
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.production_template_save(%L, %L, ''X'', %L, 1, null, true, %L)', gen_random_uuid(), o1, bread, jsonb_build_array(jsonb_build_object('product_id', bread, 'qty', 1))), 'output cannot be an ingredient'), 'barang jadi sebagai bahan ditolak');
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.production_template_save(%L, %L, ''X'', %L, 1, null, true, %L)', gen_random_uuid(), o1, bread, jsonb_build_array(jsonb_build_object('product_id', flour, 'qty', 1), jsonb_build_object('product_id', flour, 'qty', 2))), 'duplicate ingredient'), 'bahan ganda ditolak');
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.production_template_save(%L, %L, ''X'', %L, 1, null, true, %L)', gen_random_uuid(), o1, svc, jsonb_build_array(jsonb_build_object('product_id', flour, 'qty', 1))), 'output product does not track stock'), 'jasa sebagai barang jadi ditolak');
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.production_template_save(%L, %L, ''roti tawar besar'', %L, 1, null, true, %L)', gen_random_uuid(), o1, bread, jsonb_build_array(jsonb_build_object('product_id', flour, 'qty', 1))), 'name already used'), 'nama kembar ditolak');
  -- produksi 2 batch: pakai tepung 4 (20000) + gula 2 (20000) = 40000 untuk 8 roti => 5000/roti
  r := pos.production_run(run1, o1, loc, tpl, 2, null, 'Pagi');
  perform pg_temp.ok37((r->>'number') like 'PRD-%' and (r->>'produced_qty')::numeric = 8 and (r->>'total_cost')::numeric = 40000, 'hasil produksi dan biaya');
  perform pg_temp.ok37((select qty from pos.stock_balances where location_id = loc and product_id = flour) = 6 and (select qty from pos.stock_balances where location_id = loc and product_id = sugar) = 3, 'bahan berkurang');
  select qty, avg_cost into v_avg from pos.stock_balances where location_id = loc and product_id = bread;
  perform pg_temp.ok37(v_avg = 8, 'barang jadi bertambah 8');
  perform pg_temp.ok37((select avg_cost from pos.stock_balances where location_id = loc and product_id = bread) = 5000, 'harga perolehan barang jadi = biaya bahan / jumlah');
  perform pg_temp.ok37((pos.production_run(run1, o1, loc, tpl, 2, null, 'Pagi')->>'already')::boolean, 'idempoten menurut id');
  perform pg_temp.ok37((select qty from pos.stock_balances where location_id = loc and product_id = flour) = 6, 'ulang id sama tidak mengurangi lagi');
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.production_run(%L, %L, %L, %L, 0, null, null)', gen_random_uuid(), o1, loc, tpl), 'invalid batches'), 'batch 0 ditolak');
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.production_template_delete(%L)', tpl), 'template has runs'), 'acuan yang sudah dipakai tidak bisa dihapus');
  if v_allow = false then
    perform pg_temp.ok37(pg_temp.fails37(format('select pos.production_run(%L, %L, %L, %L, 100, null, null)', run2, o1, loc, tpl), 'insufficient stock'), 'stok kurang ditolak');
  end if;
  reset role;
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.production_run(%L, %L, %L, %L, 1, null, null)', run3, o1, loc, tpl), 'not allowed'), 'kasir tidak boleh');
  reset role;
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok37(pg_temp.fails37(format('select pos.production_template_delete(%L)', tpl), 'not allowed'), 'org lain tidak boleh');
    reset role;
  end if;
end $$;
