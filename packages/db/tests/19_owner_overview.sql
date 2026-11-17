-- Pantauan pemilik (migrasi 0155): hanya pemilik/admin; bentuk hasil memuat outlet, deret 7 hari, dan hitungan pengajuan.
create or replace function pg_temp.ok55(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails55(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;
do $$
declare o1 uuid := ctx('o1'); u_adm uuid := gen_random_uuid(); u_mgr uuid := gen_random_uuid(); e_adm uuid := gen_random_uuid(); e_mgr uuid := gen_random_uuid(); j jsonb;
begin
  insert into auth.users(id, email) values (u_adm, 'adm-ov@x'), (u_mgr, 'mgr-ov@x');
  insert into org_members(org_id, user_id, role) values (o1, u_adm, 'admin'), (o1, u_mgr, 'manager');
  insert into employees(id, org_id, name, role, user_id) values (e_adm, o1, 'Pemilik OV', 'owner', u_adm), (e_mgr, o1, 'Manajer OV', 'manager', u_mgr);
  perform set_config('request.jwt.claim.sub', u_mgr::text, true); set local role authenticated;
  perform pg_temp.ok55(pg_temp.fails55('select pos.owner_overview()'), 'manajer tidak boleh melihat pantauan pemilik');
  reset role;
  perform set_config('request.jwt.claim.sub', u_adm::text, true); set local role authenticated;
  j := pos.owner_overview();
  perform pg_temp.ok55(jsonb_array_length(j->'series') = 7, 'deret 7 hari');
  perform pg_temp.ok55(jsonb_array_length(j->'outlets') >= 1, 'memuat outlet');
  perform pg_temp.ok55((j->'pending'->>'leave') is not null, 'memuat hitungan pengajuan');
  reset role;
  delete from employees where id in (e_adm, e_mgr);
  delete from org_members where user_id in (u_adm, u_mgr);
end $$;
