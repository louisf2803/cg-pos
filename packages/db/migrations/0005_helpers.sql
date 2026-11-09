-- CG POS · 0005_helpers
-- Semua objek ada di schema pos. Tidak menyentuh schema public.
begin;
set local search_path = pos, extensions, public;

-- ===== 10_helpers.sql =====
-- Bagian 10: fungsi bantu, pemicu pembayaran, pembuatan org beserta data bawaan

-- faktor konversi satuan penjualan ke satuan dasar
create or replace function pos.unit_factor(p_product_unit uuid) returns numeric
language sql stable as $$ select conversion from product_units where id = p_product_unit $$;

-- faktor konversi satuan resep/bahan ke satuan dasar bahan
create or replace function pos.ingredient_factor(p_product uuid, p_unit uuid) returns numeric
language plpgsql stable as $$
declare v numeric; v_base uuid;
begin
  select conversion into v from product_units where product_id = p_product and unit_id = p_unit and deleted_at is null;
  if v is not null then return v; end if;
  select base_unit_id into v_base from products where id = p_product;
  if v_base = p_unit then return 1; end if;
  raise exception 'unit % has no conversion for product %', p_unit, p_product;
end $$;

-- Daftar bahan/barang yang berkurang saat satu produk terjual (satuan dasar masing-masing).
-- Aturan: paket -> komponen; punya resep -> bahan resep; barang lacak stok -> dirinya sendiri; selain itu tidak ada.
create or replace function pos.sale_components(p_product uuid, p_qty numeric, p_depth int default 0)
returns table(component_id uuid, component_qty numeric)
language plpgsql stable as $$
declare p products%rowtype; b record;
begin
  if p_depth > 3 then raise exception 'bundle nesting too deep'; end if;
  select * into p from products where id = p_product;
  if not found then return; end if;
  if p.kind = 'bundle' then
    for b in select bi.product_id as pid, bi.qty as q from bundle_items bi where bi.bundle_id = p.id loop
      return query select * from pos.sale_components(b.pid, p_qty * b.q, p_depth + 1);
    end loop;
  elsif exists (select 1 from recipe_lines rl where rl.product_id = p.id) then
    return query
      select rl.ingredient_id, p_qty * rl.qty * pos.ingredient_factor(rl.ingredient_id, rl.unit_id)
        from recipe_lines rl join products ing on ing.id = rl.ingredient_id and ing.track_stock
       where rl.product_id = p.id;
  elsif p.kind = 'goods' and p.track_stock then
    return query select p.id, p_qty;
  end if;
end $$;

-- Setiap perubahan pembayaran menghitung ulang total bayar dan status order.
create or replace function pos.recalc_order_payments() returns trigger
language plpgsql as $$
declare v_order uuid; v_paid numeric; v_total numeric; v_status text;
begin
  v_order := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  select total, status into v_total, v_status from orders where id = v_order for update;
  if not found then return null; end if;           -- order sedang dihapus (hapus-org berantai)
  select coalesce(sum(amount), 0) into v_paid from payments where order_id = v_order and status = 'succeeded';
  if v_status = 'void' then
    if v_paid > 0 then raise exception 'void order cannot hold payments'; end if;
    return null;
  end if;
  if v_paid > v_total then raise exception 'payments % exceed order total %', v_paid, v_total; end if;
  update orders set
    paid_total = v_paid,
    status = case when v_paid = 0 then 'open' when v_paid >= v_total then 'paid' else 'partially_paid' end,
    closed_at = case when v_paid > 0 and v_paid >= v_total then coalesce(closed_at, now()) else null end,
    version = version + 1
  where id = v_order;
  return null;
end $$;
create trigger payments_recalc after insert or update or delete on payments
  for each row execute function pos.recalc_order_payments();

-- akun kas utama org = akun dari metode bayar tunai pertama yang aktif
create or replace function pos.cash_account(p_org uuid) returns uuid
language sql stable as $$
  select account_id from payment_methods where org_id = p_org and kind = 'cash' and is_active and deleted_at is null
  order by sort, created_at limit 1 $$;

-- tanggal pembukuan dari waktu kejadian, memakai zona waktu outlet
create or replace function pos.book_date(p_outlet uuid, p_at timestamptz) returns date
language sql stable as $$
  select (p_at at time zone coalesce((select timezone from outlets where id = p_outlet), 'Asia/Jakarta'))::date $$;

-- bila periode sudah dikunci, transaksi terlambat dibukukan pada hari pertama yang masih terbuka
create or replace function pos.open_book_date(p_org uuid, p_date date) returns date
language sql stable as $$
  select case when o.books_locked_through is not null and p_date <= o.books_locked_through
              then o.books_locked_through + 1 else p_date end
    from orgs o where o.id = p_org $$;

---------------------------------------------------------------------------------------------------
-- Data bawaan org baru: daftar akun sendiri (bukan salinan), metode bayar, satuan, pajak
---------------------------------------------------------------------------------------------------
create or replace function pos.seed_org_defaults(p_org uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare a record; v_cash uuid; v_clr uuid; v_nclr uuid; v_comp uuid; v_dep uuid;
begin
  for a in select * from (values
    ('1-1000','Aset Lancar','header','other_current_asset',null),
    ('1-1100','Kas','detail','cash_bank','cash_main'),
    ('1-1200','Bank','detail','cash_bank','bank_main'),
    ('1-1300','Piutang Gateway (DOKU)','detail','receivable','gateway_clearing'),
    ('1-1310','Piutang Non-tunai (EDC/Transfer)','detail','receivable','noncash_clearing'),
    ('1-1400','Piutang Usaha','detail','receivable','accounts_receivable'),
    ('1-1500','Persediaan','detail','inventory','inventory'),
    ('1-1600','Uang Muka Pemasok','detail','other_current_asset','supplier_advance'),
    ('1-1700','Pajak Masukan','detail','other_current_asset','purchase_tax_input'),
    ('1-2000','Aset Tetap','header','fixed_asset',null),
    ('1-2100','Peralatan','detail','fixed_asset','fixed_asset_equipment'),
    ('1-2900','Akumulasi Penyusutan','detail','accumulated_depreciation','accumulated_depreciation'),
    ('2-1000','Kewajiban Jangka Pendek','header','short_term_liability',null),
    ('2-1100','Utang Usaha','detail','payable','accounts_payable'),
    ('2-1200','Pajak Penjualan Terutang','detail','short_term_liability','tax_payable'),
    ('2-1300','Deposit Pelanggan','detail','short_term_liability','customer_deposit'),
    ('3-1000','Modal Disetor','detail','equity','paid_in_capital'),
    ('3-2000','Saldo Awal Ekuitas','detail','equity','opening_balance_equity'),
    ('4-1000','Penjualan','detail','revenue','sales_revenue'),
    ('4-1100','Biaya Layanan','detail','revenue','service_revenue'),
    ('4-1900','Diskon Penjualan','detail','revenue','sales_discount'),
    ('4-1950','Retur Penjualan','detail','revenue','sales_returns'),
    ('5-1000','Harga Pokok Penjualan','detail','cogs','cogs'),
    ('5-2000','Selisih Persediaan','detail','cogs','inventory_adjustment'),
    ('6-1000','Beban Gaji','detail','expense',null),
    ('6-1100','Beban Sewa','detail','expense',null),
    ('6-1900','Beban Kas Keluar Lainnya','detail','expense','cash_out_expense'),
    ('6-2000','Beban Penyusutan','detail','expense','depreciation_expense'),
    ('6-2100','Biaya Gateway','detail','expense','gateway_fee_expense'),
    ('6-2200','Beban Gratis/Complimentary','detail','expense','complimentary_expense'),
    ('6-2300','Selisih Kas','detail','expense','cash_over_short'),
    ('6-2400','Selisih Rekonsiliasi','detail','expense','reconciliation_diff'),
    ('7-1000','Pendapatan Lain-lain','detail','other_income',null),
    ('7-1100','Pembulatan','detail','other_income','rounding'),
    ('7-1200','Kas Masuk Lainnya','detail','other_income','cash_in_other'),
    ('8-1000','Beban Lain-lain','detail','other_expense',null)
  ) as t(code, name, kind, category, system_key)
  loop
    insert into accounts(org_id, code, name, kind, category, system_key)
    values (p_org, a.code, a.name, a.kind, a.category, a.system_key);
  end loop;

  v_cash := pos.account_id(p_org, 'cash_main');
  v_clr  := pos.account_id(p_org, 'gateway_clearing');
  v_nclr := pos.account_id(p_org, 'noncash_clearing');
  v_comp := pos.account_id(p_org, 'complimentary_expense');
  v_dep  := pos.account_id(p_org, 'customer_deposit');
  insert into payment_methods(org_id, code, name, kind, account_id, requires_online, sort) values
    (p_org, 'CASH',  'Tunai',            'cash',          v_cash, false, 1),
    (p_org, 'QRIS',  'QRIS (DOKU)',      'gateway',       v_clr,  true,  2),
    (p_org, 'EDC',   'Kartu (EDC)',      'noncash',       v_nclr, false, 3),
    (p_org, 'TRF',   'Transfer Bank',    'noncash',       v_nclr, false, 4),
    (p_org, 'FREE',  'Gratis',           'complimentary', v_comp, false, 5),
    (p_org, 'DEP',   'Deposit Pelanggan','deposit',       v_dep,  false, 6);

  insert into units(org_id, name) values (p_org,'pcs'),(p_org,'porsi'),(p_org,'gram'),(p_org,'ml'),(p_org,'kg'),(p_org,'liter');
  insert into taxes(org_id, name, rate, is_default) values (p_org, 'PB1 Restoran', 10, false);
end $$;

-- Buat org baru lengkap: org, pemilik, outlet pertama, data bawaan. Dipanggil dari rute pendaftaran (service role).
create or replace function pos.create_org(p_name text, p_owner uuid, p_outlet_name text, p_outlet_code text)
returns uuid language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_org uuid; v_outlet uuid;
begin
  insert into orgs(name) values (p_name) returning id into v_org;
  insert into org_members(org_id, user_id, role) values (v_org, p_owner, 'owner');
  perform pos.seed_org_defaults(v_org);
  insert into outlets(org_id, code, name) values (v_org, upper(p_outlet_code), p_outlet_name) returning id into v_outlet;
  insert into employees(org_id, user_id, name, role) values (v_org, p_owner, 'Pemilik', 'owner');
  insert into employee_outlets(employee_id, outlet_id, org_id)
    select id, v_outlet, v_org from employees where org_id = v_org and role = 'owner';
  return v_org;
end $$;

---------------------------------------------------------------------------------------------------
-- PIN karyawan (bcrypt lewat pgcrypto). Gagal beruntun mengunci akun sementara.
---------------------------------------------------------------------------------------------------
create or replace function pos.set_employee_pin(p_employee uuid, p_pin text) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN must be exactly 6 digits'; end if;
  update employees set pin_hash = crypt(p_pin, gen_salt('bf', 10)), pin_failed_count = 0, pin_locked_until = null
   where id = p_employee;
  if not found then raise exception 'employee not found'; end if;
end $$;

-- mengembalikan true/false; tidak melempar galat saat salah, supaya penghitung gagal tetap tersimpan
create or replace function pos.verify_employee_pin(p_employee uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare e employees%rowtype; ok boolean;
begin
  select * into e from employees where id = p_employee and is_active and deleted_at is null for update;
  if not found or e.pin_hash is null then return false; end if;
  if e.pin_locked_until is not null and e.pin_locked_until > now() then return false; end if;
  ok := (e.pin_hash = crypt(p_pin, e.pin_hash));
  if ok then
    update employees set pin_failed_count = 0, pin_locked_until = null where id = e.id;
  else
    update employees set pin_failed_count = pin_failed_count + 1,
      pin_locked_until = case when pin_failed_count + 1 >= 5 then now() + interval '5 minutes' else null end
     where id = e.id;
  end if;
  return ok;
end $$;

-- Hapus seluruh data satu org (permintaan hapus data / penghentian akun). Pemeriksaan FK ditunda ke akhir
-- transaksi karena urutan penghapusan berantai antar tabel tidak ditentukan.
create or replace function pos.delete_org(p_org uuid) returns void
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
begin
  set constraints all deferred;
  delete from orgs where id = p_org;
  delete from sync_tombstones where org_id = p_org;
  delete from gateway_events where org_id = p_org;
end $$;


commit;
