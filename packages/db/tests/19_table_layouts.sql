-- Denah meja di server (migrasi 0143): pengelola menyimpan, semua anggota org membaca, org lain dan anon tidak, batas ukuran dan bentuk.
create or replace function pg_temp.ok_tl(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails_tl(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); out1 uuid := ctx('out1'); o2 uuid;
  mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); ok boolean;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-tl@x'), (cash, 'cash-tl@x'), (stranger, 'stranger-tl@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;

  -- pengelola menyimpan dan menimpa
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pos.table_layout_save(out1, '{"cgpos_custom_table_positions":{"t1":{"x":10,"y":20}},"cgpos_inactive_tables":["t9"]}'::jsonb);
  perform pg_temp.ok_tl((select data->'cgpos_inactive_tables'->>0 from pos.table_layouts where outlet_id = out1) = 't9', 'tersimpan');
  perform pos.table_layout_save(out1, '{"cgpos_custom_table_positions":{"t1":{"x":99,"y":1}}}'::jsonb);
  perform pg_temp.ok_tl((select data->'cgpos_custom_table_positions'->'t1'->>'x' from pos.table_layouts where outlet_id = out1) = '99', 'terakhir menyimpan menang');
  perform pg_temp.ok_tl((select count(*) from pos.table_layouts where outlet_id = out1) = 1, 'satu dokumen per outlet');
  -- bentuk dan ukuran
  perform pg_temp.ok_tl(pg_temp.fails_tl(format('select pos.table_layout_save(%L, ''[1,2]''::jsonb)', out1)), 'bukan objek ditolak');
  perform pg_temp.ok_tl(pg_temp.fails_tl(format('select pos.table_layout_save(%L, jsonb_build_object(''x'', repeat(''a'', 300000)))', out1)), 'terlalu besar ditolak');
  perform pg_temp.ok_tl(pg_temp.fails_tl(format('select pos.table_layout_save(%L, ''{}''::jsonb)', gen_random_uuid())), 'outlet tak dikenal ditolak');
  reset role;

  -- kasir membaca tetapi tidak menulis
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok_tl((select count(*) from pos.table_layouts where outlet_id = out1) = 1, 'kasir membaca denah');
  perform pg_temp.ok_tl(pg_temp.fails_tl(format('select pos.table_layout_save(%L, ''{}''::jsonb)', out1)), 'kasir tidak boleh menyimpan');
  begin update pos.table_layouts set data = '{}'::jsonb where outlet_id = out1; ok := (select data ? 'cgpos_custom_table_positions' from pos.table_layouts where outlet_id = out1); exception when others then ok := true; end;
  perform pg_temp.ok_tl(ok, 'kasir tidak boleh mengubah langsung');
  reset role;

  -- org lain dan anon
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok_tl((select count(*) from pos.table_layouts where outlet_id = out1) = 0, 'org lain tidak membaca');
    perform pg_temp.ok_tl(pg_temp.fails_tl(format('select pos.table_layout_save(%L, ''{}''::jsonb)', out1)), 'org lain tidak boleh menyimpan');
    reset role;
  end if;
  set local role anon;
  begin perform 1 from pos.table_layouts; ok := false; exception when insufficient_privilege then ok := true; end;
  reset role;
  perform pg_temp.ok_tl(ok, 'anon tertutup');

  delete from pos.table_layouts where outlet_id = out1;
end $$;
