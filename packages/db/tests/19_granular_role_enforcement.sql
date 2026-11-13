-- Penegakan izin granular peran (migrasi 0103):
-- 1. Status PIN, kunci akun, dan fungsi unlock_employee_pin
-- 2. Pemeriksaan otorisasi void & refund (can_employee_authorize_void / can_employee_authorize_refund)
-- 3. Penegakan granular (can_user_perform & triggers) pada produk & pelanggan
create or replace function pg_temp.okr(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1'); out1 uuid := ctx('out1');
  mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid();
  emp_mgr uuid; emp_cash uuid;
  role_limited uuid; role_can_void uuid;
  n int; ok boolean; locked_until timestamptz;
  stat record;
begin
  insert into auth.users(id, email) values (mgr, 'mgr-a142@x'), (cash, 'cash-a142@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cash, 'cashier');
  insert into member_outlets(org_id, user_id, outlet_id) values (o1, mgr, out1), (o1, cash, out1);

  insert into employees(org_id, user_id, name, role, qr_code, pin_failed_count, pin_locked_until)
  values (o1, mgr, 'Manager Andi', 'manager', 'QR-MGR-01', 0, null)
  returning id into emp_mgr;

  insert into employees(org_id, user_id, name, role, qr_code, pin_failed_count, pin_locked_until)
  values (o1, cash, 'Kasir Budi', 'cashier', 'QR-CSH-02', 5, now() + interval '5 minutes')
  returning id into emp_cash;

  -- fungsi pengelola dipanggil sebagai manajer (pos.can_manage membutuhkan pengguna masuk)
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  -- 1. Uji unlock_employee_pin
  perform pos.unlock_employee_pin(emp_cash);
  reset role;
  select pin_failed_count, pin_locked_until into n, locked_until from employees where id = emp_cash;
  set local role authenticated;
  perform pg_temp.okr(n = 0 and locked_until is null, 'unlock_employee_pin mereset kegagalan dan kunci');

  -- 2. Uji list_managed_employees_status
  select * into stat from pos.list_managed_employees_status(o1) where id = emp_mgr;
  perform pg_temp.okr(stat.qr_id = 'QR-MGR-01', 'qr_id terbaca pengelola lewat fungsi status');
  -- klien tidak boleh membaca atau menulis kolom qr_code langsung; pengelola mengubahnya lewat employee_set_qr
  begin perform qr_code from pos.employees where id = emp_mgr; ok := false; exception when insufficient_privilege then ok := true; end;
  perform pg_temp.okr(ok, 'klien tidak boleh membaca employees.qr_code');
  begin update pos.employees set qr_code = 'X' where id = emp_mgr; ok := false; exception when insufficient_privilege then ok := true; end;
  perform pg_temp.okr(ok, 'klien tidak boleh menulis employees.qr_code');
  perform pos.employee_set_qr(emp_cash, '  QR-BARU-03 ');
  select * into stat from pos.list_managed_employees_status(o1) where id = emp_cash;
  perform pg_temp.okr(stat.qr_id = 'QR-BARU-03', 'employee_set_qr menyimpan QR yang dirapikan');
  reset role;

  -- 3. Uji can_employee_authorize_void & can_employee_authorize_refund
  perform pg_temp.okr(pos.can_employee_authorize_void(emp_mgr) = true, 'manager bawaan boleh authorize void');
  perform pg_temp.okr(pos.can_employee_authorize_void(emp_cash) = false, 'cashier bawaan tidak boleh authorize void');

  -- Buat peran kustom yang boleh void
  insert into roles(org_id, name, base_role, can_authorize_void, can_authorize_refund)
  values (o1, 'Kasir Senior Berwenang', 'cashier', true, false)
  returning id into role_can_void;

  update employees set role_id = role_can_void where id = emp_cash;
  perform pg_temp.okr(pos.can_employee_authorize_void(emp_cash) = true, 'kasir dengan peran can_authorize_void=true boleh void');
  perform pg_temp.okr(pos.can_employee_authorize_refund(emp_cash) = false, 'kasir dengan peran can_authorize_refund=false tidak boleh refund');

  -- 4. Uji penegakan izin produk: peran terbatas tanpa izin buat produk
  insert into roles(org_id, name, base_role)
  values (o1, 'Peran Terbatas', 'cashier')
  returning id into role_limited;

  insert into role_dashboard_perms(role_id, module_id, enabled)
  values (role_limited, 'penjualan', true);

  -- hanya can_view, tidak ada can_create
  insert into role_dashboard_feature_perms(role_id, module_id, feature_id, sub_feature_id, can_view, can_create, can_edit, can_delete, can_void)
  values (role_limited, 'penjualan', 'dash-produk', '', true, false, false, false, false);

  update employees set role_id = role_limited where id = emp_cash;

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;

  -- Mencoba buat produk dengan peran terbatas harus gagal ditolak trigger
  begin
    insert into products(org_id, name, price) values (o1, 'Kopi Rahasia', 25000);
    ok := false;
  exception when others then
    ok := true;
  end;
  perform pg_temp.okr(ok, 'user tanpa can_create ditolak trigger guard produk');

  reset role;

  -- bersihkan data uji agar tes lain (mis. daftar peran) tidak terpengaruh
  delete from role_dashboard_feature_perms where role_id in (role_limited, role_can_void);
  update employees set role_id = null where id in (emp_mgr, emp_cash);
  delete from roles where id in (role_limited, role_can_void);
  delete from employees where id in (emp_mgr, emp_cash);
end $$;
