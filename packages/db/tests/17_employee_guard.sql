-- Hanya pemilik yang boleh memberi/mengubah peran owner dan mengatur PIN pemilik (migrasi 0011).
do $$
declare mgr uuid := gen_random_uuid(); o1 uuid := ctx('o1'); owner_emp uuid := ctx('emp'); e1 uuid := gen_random_uuid(); e2 uuid := gen_random_uuid();
        ok boolean; n int;
begin
  insert into auth.users(id,email) values (mgr,'mgr@x');
  insert into org_members(org_id,user_id,role) values (o1, mgr, 'manager');

  -- manajer: boleh kelola kasir/manajer
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  insert into employees(id,org_id,name,role) values (e1, o1, 'Kasir Uji', 'cashier');
  update employees set role = 'manager' where id = e1;
  -- tidak boleh: membuat owner, mengangkat jadi owner, mengubah owner, mengatur PIN owner
  begin insert into employees(id,org_id,name,role) values (e2, o1, 'Owner Palsu', 'owner'); ok := false;
  exception when others then ok := sqlerrm like '%only owner can grant owner role%'; end;
  if not ok then raise exception 'ASSERT GAGAL: manajer membuat owner'; end if;
  begin update employees set role = 'owner' where id = e1; ok := false;
  exception when others then ok := sqlerrm like '%only owner can change an owner employee%'; end;
  if not ok then raise exception 'ASSERT GAGAL: manajer mengangkat owner'; end if;
  begin update employees set is_active = false where id = owner_emp; ok := false;
  exception when others then ok := sqlerrm like '%only owner can change an owner employee%'; end;
  if not ok then raise exception 'ASSERT GAGAL: manajer menonaktifkan owner'; end if;
  begin perform pos.admin_set_pin(owner_emp, '482916'); ok := false;
  exception when others then ok := sqlerrm like '%no access%'; end;
  if not ok then raise exception 'ASSERT GAGAL: manajer mengatur PIN owner'; end if;
  perform pos.admin_set_pin(e1, '482916');    -- PIN karyawan biasa tetap boleh
  reset role;

  -- pemilik: boleh semuanya
  perform set_config('request.jwt.claim.sub', ctx('u1')::text, true);
  set local role authenticated;
  update employees set role = 'owner' where id = e1;
  perform pos.admin_set_pin(owner_emp, '482916');
  reset role;
  select count(*) into n from employees where id = e1 and role = 'owner';
  if n <> 1 then raise exception 'ASSERT GAGAL: pemilik tidak bisa mengangkat owner'; end if;
end $$;
