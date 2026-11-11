-- Peran kustom & hak akses granular (migrasi 0033): manajer boleh buat/ubah lewat save_role_permissions,
-- kasir hanya baca, org lain tidak melihat, peran bawaan tidak bisa dihapus, hapus peran melepas role_id karyawan,
-- owner_app_access tidak bisa dipaksa true oleh non-admin, anon tertutup.
create or replace function pg_temp.okr(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); out1 uuid := ctx('out1');
  mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); admin uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  emp1 uuid; role1 uuid; builtin uuid; ok boolean; n int;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-role@x'), (cash, 'cash-role@x'), (admin, 'admin-role@x'), (other, 'other-role@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cash, 'cashier'), (o1, admin, 'admin'), (o2, other, 'owner');
  insert into member_outlets(org_id, user_id, outlet_id) values (o1, mgr, out1), (o1, cash, out1), (o1, admin, out1);
  insert into employees(org_id, name, role) values (o1, 'Barista A', 'cashier') returning id into emp1;
  insert into roles(org_id, name, is_built_in, base_role) values (o1, 'Kasir (bawaan)', true, 'cashier') returning id into builtin;

  -- manajer: buat peran baru lewat fungsi atomik, dengan modul+fitur granular
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  select pos.save_role_permissions(
    null, o1, 'Barista Senior', 'Boleh ubah menu', 'cashier', false, '/kasir', '/kasir',
    true, false, false,
    '[{"moduleId":"produk","enabled":true}]'::jsonb,
    '[{"moduleId":"kasir","enabled":true}]'::jsonb,
    '[{"moduleId":"produk","featureId":"ubah_harga","subFeatureId":"","canView":true,"canEdit":true}]'::jsonb,
    '[{"moduleId":"kasir","featureId":"jual","subFeatureId":"","canView":true,"canCreate":true}]'::jsonb,
    '{"produk":"write"}'::jsonb, '{"jual":"allow"}'::jsonb, true
  ) into role1;
  perform pg_temp.okr(role1 is not null, 'peran baru tersimpan');
  perform pg_temp.okr((select dashboard_perms_legacy from roles where id = role1) = '{"produk":"write"}'::jsonb, 'peta lama dashboard tersimpan apa adanya');
  select count(*) into n from role_dashboard_feature_perms where role_id = role1;
  perform pg_temp.okr(n = 1, 'fitur dashboard granular tersimpan');
  select count(*) into n from role_pos_feature_perms where role_id = role1;
  perform pg_temp.okr(n = 1, 'fitur pos granular tersimpan');

  -- non-admin (manajer) tidak bisa memaksa owner_app_access jadi true
  perform pg_temp.okr((select owner_app_access from roles where id = role1) = false, 'manajer tidak bisa aktifkan akses Owner');

  -- pakai peran untuk karyawan
  update employees set role_id = role1 where id = emp1;

  -- ubah peran yang sudah ada (ganti seluruh fitur, bukan tambah)
  perform pos.save_role_permissions(
    role1, o1, 'Barista Senior', 'Boleh ubah menu', 'cashier', false, '/kasir', '/kasir',
    true, true, false,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  );
  select count(*) into n from role_dashboard_feature_perms where role_id = role1;
  perform pg_temp.okr(n = 0, 'simpan ulang mengganti seluruh baris granular, bukan menambah');
  reset role;

  -- kasir: boleh baca, tidak boleh menyimpan
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  select count(*) into n from roles where org_id = o1;
  perform pg_temp.okr(n = 2, 'kasir bisa membaca peran orgnya (bawaan + baru)');
  begin perform pos.save_role_permissions(null, o1, 'Peran kasir', null, 'cashier', false, null, null, false, false, false, '[]','[]','[]','[]'); ok := false;
  exception when others then ok := true; end;
  perform pg_temp.okr(ok, 'kasir tidak boleh membuat peran');
  reset role;

  -- admin (org_members.role='admin'): boleh hidupkan owner_app_access
  perform set_config('request.jwt.claim.sub', admin::text, true);
  set local role authenticated;
  perform pos.save_role_permissions(role1, o1, 'Barista Senior', null, 'cashier', true, null, null, true, true, false, '[]','[]','[]','[]');
  perform pg_temp.okr((select owner_app_access from roles where id = role1) = true, 'admin boleh aktifkan akses Owner');

  -- peran bawaan tidak bisa dihapus
  begin perform pos.delete_role(builtin); ok := false; exception when others then ok := true; end;
  perform pg_temp.okr(ok, 'peran bawaan tidak bisa dihapus');

  -- hapus peran kustom melepas role_id karyawan yang memakainya
  perform pos.delete_role(role1);
  perform pg_temp.okr((select role_id from employees where id = emp1) is null, 'hapus peran melepas role_id karyawan');
  perform pg_temp.okr((select deleted_at from roles where id = role1) is not null, 'peran soft-deleted');
  reset role;

  -- org lain tidak melihat
  perform set_config('request.jwt.claim.sub', other::text, true);
  set local role authenticated;
  select count(*) into n from roles where org_id = o1;
  perform pg_temp.okr(n = 0, 'org lain tidak melihat peran org1');
  reset role;

  -- anon tertutup
  set local role anon;
  begin perform 1 from pos.roles; ok := false; exception when insufficient_privilege then ok := true; end;
  reset role;
  perform pg_temp.okr(ok, 'anon tidak punya akses ke roles');

  perform pg_temp.okr((select count(*) from activity_logs where entity = 'role') >= 1, 'perubahan peran tercatat di log aktivitas');
end $$;
