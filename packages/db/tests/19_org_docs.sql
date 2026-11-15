-- Dokumen pengaturan organisasi (migrasi 0144): pengelola menyimpan, semua anggota org membaca, org lain dan anon tidak, nama dan ukuran dibatasi.
create or replace function pg_temp.ok_od(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails_od(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid;
  mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); ok boolean;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-od@x'), (cash, 'cash-od@x'), (stranger, 'stranger-od@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pos.org_doc_save(o1, 'dashboard-prefs', '{"cgpos_commission_groups":[{"id":"g1"}]}'::jsonb);
  perform pg_temp.ok_od((select data->'cgpos_commission_groups'->0->>'id' from pos.org_docs where org_id = o1 and name = 'dashboard-prefs') = 'g1', 'tersimpan');
  perform pos.org_doc_save(o1, 'dashboard-prefs', '{"x":1}'::jsonb);
  perform pg_temp.ok_od((select count(*) from pos.org_docs where org_id = o1 and name = 'dashboard-prefs') = 1, 'satu dokumen per nama; menimpa');
  perform pg_temp.ok_od(pg_temp.fails_od(format('select pos.org_doc_save(%L, ''Nama Salah'', ''{}''::jsonb)', o1)), 'nama tak valid ditolak');
  perform pg_temp.ok_od(pg_temp.fails_od(format('select pos.org_doc_save(%L, ''ok'', ''[1]''::jsonb)', o1)), 'bukan objek ditolak');
  perform pg_temp.ok_od(pg_temp.fails_od(format('select pos.org_doc_save(%L, ''besar'', jsonb_build_object(''x'', repeat(''a'', 300000)))', o1)), 'terlalu besar ditolak');
  reset role;

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok_od((select count(*) from pos.org_docs where org_id = o1) = 1, 'kasir membaca');
  perform pg_temp.ok_od(pg_temp.fails_od(format('select pos.org_doc_save(%L, ''dashboard-prefs'', ''{}''::jsonb)', o1)), 'kasir tidak boleh menyimpan');
  begin update pos.org_docs set data = '{}'::jsonb where org_id = o1; ok := (select data ? 'x' from pos.org_docs where org_id = o1 and name = 'dashboard-prefs'); exception when others then ok := true; end;
  perform pg_temp.ok_od(ok, 'kasir tidak boleh mengubah langsung');
  reset role;

  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok_od((select count(*) from pos.org_docs where org_id = o1) = 0, 'org lain tidak membaca');
    perform pg_temp.ok_od(pg_temp.fails_od(format('select pos.org_doc_save(%L, ''dashboard-prefs'', ''{}''::jsonb)', o1)), 'org lain tidak boleh menyimpan');
    reset role;
  end if;
  set local role anon;
  begin perform 1 from pos.org_docs; ok := false; exception when insufficient_privilege then ok := true; end;
  reset role;
  perform pg_temp.ok_od(ok, 'anon tertutup');

  delete from pos.org_docs where org_id = o1;
end $$;
