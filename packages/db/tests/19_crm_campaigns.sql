-- Kampanye CRM (migrasi 0132): draf bisa diubah/dihapus; peluncuran membekukan penerima; tandai dihubungi hanya saat aktif; akhiri; kasir dan org lain ditolak.
create or replace function pg_temp.ok32(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails32(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;
do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); cu1 uuid := gen_random_uuid(); cu2 uuid := gen_random_uuid(); r jsonb;
begin
  insert into auth.users(id, email) values (adm, 'adm-cm@x'), (cash, 'cash-cm@x'), (stranger, 'stranger-cm@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  insert into customers(id, org_id, name) values (cu1, o1, 'Pelanggan Satu'), (cu2, o1, 'Pelanggan Dua');

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  perform pos.crm_campaign_save(c1, o1, 'Diskon ulang tahun', 'Selamat ulang tahun', date '2026-11-01', date '2026-11-30', '{"birthdayMonth":true}');
  perform pos.crm_campaign_save(c1, o1, 'Diskon ulang tahun bulan ini', 'Selamat ulang tahun', date '2026-11-01', date '2026-11-30', '{"birthdayMonth":true}');
  perform pg_temp.ok32((select name from pos.crm_campaigns where id = c1) = 'Diskon ulang tahun bulan ini', 'draf bisa diubah');
  perform pg_temp.ok32(pg_temp.fails32(format('select pos.crm_campaign_save(%L, %L, '' '', null, null, null, null)', gen_random_uuid(), o1), 'name required'), 'nama kosong ditolak');
  perform pg_temp.ok32(pg_temp.fails32(format('select pos.crm_campaign_save(%L, %L, ''X'', null, date ''2026-12-01'', date ''2026-11-01'', null)', gen_random_uuid(), o1), 'invalid period'), 'periode terbalik ditolak');
  perform pg_temp.ok32(pg_temp.fails32(format('select pos.crm_campaign_launch(%L, ''{}'')', c1), 'no recipients'), 'tanpa penerima ditolak');
  perform pg_temp.ok32(pg_temp.fails32(format('select pos.crm_campaign_contact(%L, %L, true)', c1, cu1), 'campaign not active'), 'tandai dihubungi hanya saat aktif');
  r := pos.crm_campaign_launch(c1, array[cu1, cu2, gen_random_uuid()]);
  perform pg_temp.ok32((r->>'recipients')::int = 2 and r->>'status' = 'active', 'penerima dibekukan, id asing diabaikan');
  perform pg_temp.ok32((pos.crm_campaign_launch(c1, array[cu1])->>'already')::boolean, 'peluncuran idempoten');
  perform pg_temp.ok32(pg_temp.fails32(format('select pos.crm_campaign_save(%L, %L, ''Ubah'', null, null, null, null)', c1, o1), 'campaign not draft'), 'yang aktif tidak bisa diubah');
  perform pg_temp.ok32(pg_temp.fails32(format('select pos.crm_campaign_delete(%L)', c1), 'campaign not draft'), 'yang aktif tidak bisa dihapus');
  perform pos.crm_campaign_contact(c1, cu1, true);
  perform pg_temp.ok32((select count(*) from pos.crm_campaign_recipients where campaign_id = c1 and contacted_at is not null) = 1, 'satu pelanggan sudah dihubungi');
  perform pos.crm_campaign_contact(c1, cu1, false);
  perform pg_temp.ok32((select count(*) from pos.crm_campaign_recipients where campaign_id = c1 and contacted_at is not null) = 0, 'tanda bisa dicabut');
  perform pg_temp.ok32(pg_temp.fails32(format('select pos.crm_campaign_contact(%L, %L, true)', c1, gen_random_uuid()), 'recipient not found'), 'bukan penerima ditolak');
  perform pos.crm_campaign_end(c1);
  perform pg_temp.ok32((select status from pos.crm_campaigns where id = c1) = 'ended', 'kampanye berakhir');
  perform pos.crm_campaign_save(c2, o1, 'Draf', null, null, null, null);
  perform pg_temp.ok32((pos.crm_campaign_delete(c2)->>'deleted')::boolean, 'draf bisa dihapus');
  reset role;
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok32(pg_temp.fails32(format('select pos.crm_campaign_save(%L, %L, ''X'', null, null, null, null)', gen_random_uuid(), o1), 'not allowed'), 'kasir tidak boleh');
  reset role;
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok32(pg_temp.fails32(format('select pos.crm_campaign_end(%L)', c1), 'not allowed'), 'org lain tidak boleh');
    reset role;
  end if;
  delete from pos.crm_campaigns where org_id = o1;
  delete from pos.customers where id in (cu1, cu2);
end $$;
