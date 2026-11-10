-- Kode otorisasi (migrasi 0020): terbit oleh manajer, sekali pakai, kedaluwarsa, salah bertubi-tubi dikunci, outlet dan tindakan harus cocok.
create or replace function pg_temp.ok7(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails7(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); out1 uuid := ctx('out1'); dev uuid := ctx('dev'); ud uuid := ctx('ud');
  mgr uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); cashier uuid := gen_random_uuid();
  r jsonb; c1 text; id1 uuid; c2 text; id2 uuid; c3 text; got uuid; i int;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-code@x'), (stranger, 'stranger-code@x'), (cashier, 'cashier-code@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o2, stranger, 'owner'), (o1, cashier, 'cashier');
  insert into member_outlets(org_id, user_id, outlet_id) values (o1, mgr, out1), (o1, cashier, out1);

  -- hanya pemilik/admin/manajer yang boleh menerbitkan
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  perform pg_temp.ok7(pg_temp.fails7(format('select pos.auth_code_issue(%L, ''void_order'')', out1)), 'kasir tidak boleh menerbitkan');
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform pg_temp.ok7(pg_temp.fails7(format('select pos.auth_code_issue(%L, ''void_order'')', out1)), 'org lain tidak boleh menerbitkan');

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  perform pg_temp.ok7(pg_temp.fails7(format('select pos.auth_code_issue(%L, ''hapus_semua'')', out1)), 'tindakan asing ditolak');
  perform pg_temp.ok7(pg_temp.fails7(format('select pos.auth_code_issue(%L, ''void_order'', 0)', out1)), 'masa berlaku 0 ditolak');
  perform pg_temp.ok7(pg_temp.fails7(format('select pos.auth_code_issue(%L, ''void_order'', 241)', out1)), 'masa berlaku 241 menit ditolak');
  r := pos.auth_code_issue(out1, 'void_order', 15, '  untuk meja 4  ');
  c1 := r->>'code'; id1 := (r->>'id')::uuid;
  perform pg_temp.ok7(c1 ~ '^[0-9]{8}$', 'kode 8 angka: ' || c1);
  perform pg_temp.ok7((select code_hash from auth_codes where id = id1) <> c1 and (select code_hash from auth_codes where id = id1) !~ c1, 'kode tidak disimpan sebagai teks');
  perform pg_temp.ok7((select note from auth_codes where id = id1) = 'untuk meja 4', 'catatan dipangkas');

  -- kasir menukar kode
  perform set_config('request.jwt.claim.sub', ud::text, true);
  perform pg_temp.ok7(pos.auth_code_use(dev, '00000000', 'void_order') is null or c1 = '00000000', 'kode salah ditolak');
  perform pg_temp.ok7(pos.auth_code_use(dev, c1, 'refund') is null, 'tindakan tidak cocok ditolak');
  perform pg_temp.ok7(pg_temp.fails7(format('select pos.auth_code_use(%L, %L, ''void_order'')', gen_random_uuid(), c1)), 'perangkat tak dikenal ditolak');
  got := pos.auth_code_use(dev, ' ' || c1 || ' ', 'void_order', null);
  perform pg_temp.ok7(got = mgr, 'kode benar mengembalikan penerbit');
  perform pg_temp.ok7(pos.auth_code_use(dev, c1, 'void_order') is null, 'kode sekali pakai');
  perform pg_temp.ok7((select used_at is not null and used_device = dev from auth_codes where id = id1), 'pemakaian tercatat');

  -- kedaluwarsa
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  r := pos.auth_code_issue(out1, 'void_order', 1); c2 := r->>'code'; id2 := (r->>'id')::uuid;
  update auth_codes set issued_at = now() - interval '10 minutes', expires_at = now() - interval '1 minute' where id = id2;
  perform set_config('request.jwt.claim.sub', ud::text, true);
  perform pg_temp.ok7(pos.auth_code_use(dev, c2, 'void_order') is null, 'kode kedaluwarsa ditolak');

  -- dibatalkan
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  r := pos.auth_code_issue(out1, 'complimentary'); c3 := r->>'code'; id2 := (r->>'id')::uuid;
  perform set_config('request.jwt.claim.sub', cashier::text, true);
  perform pg_temp.ok7(pg_temp.fails7(format('select pos.auth_code_revoke(%L)', id2)), 'kasir tidak boleh membatalkan');
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  perform pg_temp.ok7(pos.auth_code_revoke(id2) is true, 'manajer membatalkan kode');
  perform pg_temp.ok7(pos.auth_code_revoke(id2) is false, 'membatalkan dua kali tidak berubah');
  perform set_config('request.jwt.claim.sub', ud::text, true);
  perform pg_temp.ok7(pos.auth_code_use(dev, c3, 'complimentary') is null, 'kode dibatalkan ditolak');

  -- riwayat
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  perform pg_temp.ok7((select count(*) from pos.auth_code_list(out1)) = 3, 'tiga kode di riwayat');
  perform pg_temp.ok7((select status from pos.auth_code_list(out1) where id = id1) = 'used', 'status used');
  perform pg_temp.ok7((select count(*) from pos.auth_code_list(out1) where status = 'expired') = 1, 'satu kedaluwarsa');
  perform pg_temp.ok7((select count(*) from pos.auth_code_list(out1) where status = 'revoked') = 1, 'satu dibatalkan');
  perform pg_temp.ok7((select issuer_email from pos.auth_code_list(out1) where id = id1) = 'mgr-code@x', 'email penerbit tampil');
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform pg_temp.ok7(pg_temp.fails7(format('select * from pos.auth_code_list(%L)', out1)), 'org lain tidak boleh melihat riwayat');

  -- terlalu banyak salah: dikunci walau kode berikutnya benar
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  r := pos.auth_code_issue(out1, 'void_order'); c1 := r->>'code';
  perform set_config('request.jwt.claim.sub', ud::text, true);
  delete from auth_code_fails;
  for i in 1..5 loop perform pos.auth_code_use(dev, case when c1 = '11111111' then '22222222' else '11111111' end, 'void_order'); end loop;
  perform pg_temp.ok7(pos.auth_code_use(dev, c1, 'void_order') is null, 'dikunci setelah 5 salah');
  update auth_code_fails set failed_at = now() - interval '11 minutes';
  perform pg_temp.ok7(pos.auth_code_use(dev, c1, 'void_order') = mgr, 'terbuka lagi setelah 10 menit');
end $$;
