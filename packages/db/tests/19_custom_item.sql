-- Item bebas (migrasi 0025): satu produk sistem per org, tersembunyi dari menu, anggota (termasuk kasir) boleh, orang luar tidak.
create or replace function pg_temp.ok25(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails25(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); o2 uuid := ctx('o2'); cashier uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); id1 uuid; id2 uuid;
begin
  insert into auth.users(id, email) values (cashier, 'cashier-ci@x'), (stranger, 'stranger-ci@x');
  insert into org_members(org_id, user_id, role) values (o1, cashier, 'cashier'), (o2, stranger, 'owner');

  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.ok25(pg_temp.fails25(format('select pos.custom_item_product(%L)', o1)), 'tanpa login ditolak');
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform pg_temp.ok25(pg_temp.fails25(format('select pos.custom_item_product(%L)', o1)), 'org lain ditolak');

  perform set_config('request.jwt.claim.sub', cashier::text, true);
  id1 := pos.custom_item_product(o1);
  id2 := pos.custom_item_product(o1);
  perform pg_temp.ok25(id1 = id2, 'idempoten: id sama');
  perform pg_temp.ok25((select count(*) from products where org_id = o1 and name = 'Item bebas') = 1, 'hanya satu produk per org');
  perform pg_temp.ok25((select not show_in_menu and not track_stock and is_sellable from products where id = id1), 'tersembunyi, tanpa stok, bisa dijual');
  perform pg_temp.ok25((select count(*) from product_units where product_id = id1 and is_base) = 1, 'punya satu satuan dasar');
end $$;
