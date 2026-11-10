-- Catatan siap pakai (migrasi 0030): manajer membuat, kasir hanya membaca, org lain tidak melihat, duplikat ditolak, anon tertutup.
create or replace function pg_temp.ok7(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); out1 uuid := ctx('out1');
  mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  ok boolean; n int;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-np@x'), (cash, 'cash-np@x'), (other, 'other-np@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cash, 'cashier'), (o2, other, 'owner');
  insert into member_outlets(org_id, user_id, outlet_id) values (o1, mgr, out1), (o1, cash, out1);

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  insert into pos.note_presets(org_id, outlet_id, category, text, sort) values (o1, out1, 'Level pedas', 'Sedang', 1), (o1, out1, 'Level pedas', 'Pedas', 2), (o1, out1, 'Gula', 'Kurang manis', 1);
  begin insert into pos.note_presets(org_id, outlet_id, category, text) values (o1, out1, 'level PEDAS', ' sedang '); ok := false; exception when unique_violation then ok := true; end;
  perform pg_temp.ok7(ok, 'duplikat (huruf besar/kecil, spasi) ditolak');
  begin insert into pos.note_presets(org_id, outlet_id, category, text) values (o1, out1, '   ', 'x'); ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ok7(ok, 'kategori kosong ditolak');
  begin insert into pos.note_presets(org_id, outlet_id, category, text) values (o1, out1, 'Panjang', repeat('x', 61)); ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ok7(ok, 'teks lebih dari 60 huruf ditolak');
  reset role;

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  select count(*) into n from pos.note_presets;
  perform pg_temp.ok7(n = 3, 'kasir bisa membaca tiga catatan');
  begin insert into pos.note_presets(org_id, outlet_id, category, text) values (o1, out1, 'Dilarang', 'x'); ok := false; exception when others then ok := true; end;
  perform pg_temp.ok7(ok, 'kasir tidak boleh membuat catatan');
  update pos.note_presets set text = 'Diubah kasir';
  reset role;
  perform pg_temp.ok7((select count(*) from pos.note_presets where text = 'Diubah kasir') = 0, 'kasir tidak bisa mengubah');

  perform set_config('request.jwt.claim.sub', other::text, true);
  set local role authenticated;
  select count(*) into n from pos.note_presets;
  perform pg_temp.ok7(n = 0, 'org lain tidak melihat');
  reset role;

  set local role anon;
  begin perform 1 from pos.note_presets; ok := false; exception when insufficient_privilege then ok := true; end;
  reset role;
  perform pg_temp.ok7(ok, 'anon tidak punya akses');
  perform pg_temp.ok7((select count(*) from activity_logs where entity = 'note_preset') >= 3, 'perubahan tercatat di log aktivitas');
end $$;
