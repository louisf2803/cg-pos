-- Pajak per produk dan per jenis order (migrasi 0101): kolom ada dan tersimpan, tax_settings_save mengubah pajak dan mode outlet,
-- validasi tarif dan mode, kasir dan org lain ditolak. Data pajak asli dikembalikan.
create or replace function pg_temp.ok_tax(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails_tax(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;

do $$
declare
  o1 uuid := ctx('o1'); out1 uuid := ctx('out1'); adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  pr uuid := gen_random_uuid(); tax pos.taxes%rowtype; old_mode text; old_calc text;
begin
  insert into auth.users(id, email) values (adm, 'adm-tx@x'), (cash, 'cash-tx@x'), (stranger, 'stranger-tx@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  select tax_mode, tax_calc into old_mode, old_calc from outlet_settings where outlet_id = out1;
  select * into tax from taxes where org_id = o1 and deleted_at is null order by created_at limit 1;

  -- kolom tarif khusus produk dan batasnya
  insert into products(id, org_id, name, kind, tax_rate) values (pr, o1, 'Kopi Bebas Pajak', 'goods', 0);
  perform pg_temp.ok_tax((select tax_rate from products where id = pr) = 0, 'tarif 0 (bebas pajak) tersimpan');
  update products set tax_rate = 5.5 where id = pr;
  perform pg_temp.ok_tax((select tax_rate from products where id = pr) = 5.5, 'tarif 5,5 tersimpan');
  perform pg_temp.ok_tax(pg_temp.fails_tax(format('update products set tax_rate = 150 where id = %L', pr), 'new row for relation "products" violates check constraint "products_tax_rate_check"'), 'tarif di atas 100 ditolak');

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  perform pos.tax_settings_save(out1, 'PB1 Dine-in Saja', 10, true, false, 'per_product', array['dine_in']::text[], '{"dine_in": 10, "takeaway": 0}'::jsonb);
  perform pg_temp.ok_tax((select tax_mode from pos.outlet_settings where outlet_id = out1) = 'per_product' and (select tax_calc from pos.outlet_settings where outlet_id = out1) = 'after_discount', 'mode dan perhitungan pajak outlet berubah');
  perform pg_temp.ok_tax((select order_type_rates->>'takeaway' from pos.taxes where org_id = o1 and deleted_at is null order by created_at limit 1) = '0', 'tarif per jenis order tersimpan');
  perform pg_temp.ok_tax(pg_temp.fails_tax(format('select pos.tax_settings_save(%L, '' '', 10, true, false, ''per_order'', null, null)', out1), 'Nama pajak wajib diisi'), 'nama kosong ditolak');
  perform pg_temp.ok_tax(pg_temp.fails_tax(format('select pos.tax_settings_save(%L, ''X'', 101, true, false, ''per_order'', null, null)', out1), 'Tarif pajak harus antara 0 dan 100'), 'tarif 101 ditolak');
  perform pg_temp.ok_tax(pg_temp.fails_tax(format('select pos.tax_settings_save(%L, ''X'', 10, true, false, ''lain'', null, null)', out1), 'Mode pajak tidak valid'), 'mode tak dikenal ditolak');
  reset role;

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok_tax(pg_temp.fails_tax(format('select pos.tax_settings_save(%L, ''Kasir'', 10, true, false, ''per_order'', null, null)', out1), 'not allowed'), 'kasir tidak boleh mengubah pajak');
  reset role;
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok_tax(pg_temp.fails_tax(format('select pos.tax_settings_save(%L, ''Org lain'', 10, true, false, ''per_order'', null, null)', out1), 'not allowed'), 'org lain tidak boleh mengubah pajak');
    reset role;
  end if;

  -- kembalikan pajak dan pengaturan outlet asli, bersihkan produk uji
  update taxes set name = tax.name, rate = tax.rate, is_default = tax.is_default, order_types = tax.order_types, order_type_rates = tax.order_type_rates where id = tax.id;
  update outlet_settings set tax_mode = old_mode, tax_calc = old_calc where outlet_id = out1;
  delete from products where id = pr;
end $$;
