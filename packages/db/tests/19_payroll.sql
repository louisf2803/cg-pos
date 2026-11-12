-- Payroll (migrasi 0037): hanya pemilik/manajer yang boleh membaca atau menulis; gaji bulanan hanya lewat fungsi; periode terkunci;
-- gaji bersih harus konsisten; potongan kasbon tercatat saat kunci dan hilang saat buka kunci; org lain tidak melihat apa pun.
create or replace function pg_temp.ok37(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails37(sql text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return true;
end $$;
create or replace function pg_temp.row37(p_emp uuid, p_deduction numeric default 200000) returns jsonb language sql as $$
  select jsonb_build_object('employee_id', p_emp, 'employment_status', 'permanent', 'basic_salary', 3000000, 'meal_allowance', 300000, 'bpjs_allowance', 100000,
    'lateness_count', 0, 'lateness_bonus', 50000, 'stockan_incentive', 100000, 'cash_advance_deduction', p_deduction,
    'net_salary', 3000000 + 300000 - 100000 + 50000 + 100000 - p_deduction);
$$;

do $$
declare
  o1 uuid := ctx('o1'); emp uuid := ctx('emp'); ud uuid := ctx('ud');
  adm uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  emp2 uuid := gen_random_uuid(); o2 uuid; bad jsonb; bal numeric;
begin
  insert into auth.users(id, email) values (adm, 'adm-pay@x'), (mgr, 'mgr-pay@x'), (cash, 'cash-pay@x'), (stranger, 'stranger-pay@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, mgr, 'manager'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;
  insert into employees(id, org_id, name, role) values (emp2, o1, 'Karyawan Dua', 'cashier');

  -- pengelola (admin): CRUD data dasar
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  insert into pos.employee_compensation(employee_id, org_id, status, basic_salary, meal_allowance, bpjs_allowance, cash_advance_installment) values (emp, o1, 'permanent', 3000000, 300000, 100000, 200000);
  insert into pos.employee_schedules(employee_id, org_id, weekday, start_time) values (emp, o1, 1, '08:00'), (emp, o1, 2, '08:00');
  insert into pos.payroll_rules(org_id, rules) values (o1, '{"noLatenessBonus": 40000}');
  insert into pos.employee_incidents(org_id, employee_id, incident_date, kind, count, notes) values (o1, emp, current_date, 'OPERATIONAL_MISTAKE', 2, 'gelas pecah');
  insert into pos.cash_advances(org_id, employee_id, kind, amount, notes) values (o1, emp, 'BORROW', 500000, 'kasbon awal');
  perform pg_temp.ok37((select count(*) from pos.employee_compensation) = 1 and (select count(*) from pos.employee_schedules) = 2, 'admin membaca kompensasi dan jadwal');
  perform pg_temp.ok37(pg_temp.fails37(format('insert into pos.cash_advances(org_id, employee_id, kind, amount) values (%L, %L, ''PAYMENT_PAYROLL'', 1000)', o1, emp)), 'potong gaji tidak boleh dicatat langsung');
  perform pg_temp.ok37(pg_temp.fails37(format('insert into pos.payroll_records(org_id, employee_id, period_month, period_year) values (%L, %L, 11, 2026)', o1, emp)), 'gaji bulanan tidak boleh ditulis langsung');
  -- bentuk data dijaga database
  perform pg_temp.ok37(pg_temp.fails37(format('insert into pos.employee_schedules(employee_id, org_id, weekday, start_time) values (%L, %L, 7, ''08:00'')', emp, o1)), 'hari 7 ditolak');
  perform pg_temp.ok37(pg_temp.fails37(format('update pos.employee_compensation set basic_salary = -1 where employee_id = %L', emp)), 'gaji negatif ditolak');
  perform pg_temp.ok37(pg_temp.fails37(format('insert into pos.employee_incidents(org_id, employee_id, incident_date, kind, count) values (%L, %L, current_date, ''LATENESS'', 0)', o1, emp)), 'jumlah catatan 0 ditolak');
  perform pg_temp.ok37(pg_temp.fails37(format('update pos.payroll_rules set rules = ''[1]''::jsonb where org_id = %L', o1)), 'aturan harus objek');
  reset role;

  -- kasir (anggota org tetapi bukan pengelola) dan akun perangkat: tidak melihat dan tidak menulis
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok37((select count(*) from pos.employee_compensation) = 0 and (select count(*) from pos.cash_advances) = 0 and (select count(*) from pos.employee_incidents) = 0, 'kasir tidak membaca gaji, kasbon, atau catatan');
  perform pg_temp.ok37(pg_temp.fails37(format('insert into pos.cash_advances(org_id, employee_id, kind, amount) values (%L, %L, ''BORROW'', 1000)', o1, emp)), 'kasir tidak boleh mencatat kasbon');
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.payroll_save_period(%L, 11, 2026, ''[]''::jsonb)', o1)), 'kasir tidak boleh menyimpan gaji');
  reset role;
  perform set_config('request.jwt.claim.sub', ud::text, true);
  set local role authenticated;
  perform pg_temp.ok37((select count(*) from pos.employee_compensation) = 0 and (select count(*) from pos.payroll_records) = 0, 'akun perangkat tidak membaca payroll');
  reset role;

  -- simpan draf, ditolak bila gaji bersih tidak cocok, dan atomik
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pos.payroll_save_period(o1, 11, 2026, jsonb_build_array(pg_temp.row37(emp)));
  perform pg_temp.ok37((select status = 'DRAFT' and net_salary = 3150000 from pos.payroll_records where employee_id = emp and period_month = 11), 'draf tersimpan dengan gaji bersih benar');
  bad := pg_temp.row37(emp2) || jsonb_build_object('net_salary', 1);
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.payroll_save_period(%L, 11, 2026, %L::jsonb)', o1, jsonb_build_array(pg_temp.row37(emp2), bad)::text)), 'gaji bersih tidak cocok ditolak');
  perform pg_temp.ok37((select count(*) from pos.payroll_records where employee_id = emp2) = 0, 'penolakan atomik: tidak ada baris karyawan lain tersimpan');
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.payroll_save_period(%L, 13, 2026, ''[]''::jsonb)', o1)), 'bulan 13 ditolak');
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.payroll_save_period(%L, 11, 2026, %L::jsonb)', o1, jsonb_build_array(pg_temp.row37(gen_random_uuid()))::text)), 'karyawan tidak ada ditolak');
  -- potongan melebihi saldo ditolak saat kunci; saldo kasbon 500000
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.payroll_save_period(%L, 11, 2026, %L::jsonb, true)', o1, jsonb_build_array(pg_temp.row37(emp, 600000))::text)), 'potongan melebihi saldo ditolak saat kunci');
  -- kunci periode: PAID dan potongan kasbon tercatat
  perform pos.payroll_save_period(o1, 11, 2026, jsonb_build_array(pg_temp.row37(emp, 200000)), true);
  perform pg_temp.ok37((select status = 'PAID' and paid_at is not null from pos.payroll_records where employee_id = emp and period_month = 11), 'periode terkunci PAID');
  perform pg_temp.ok37((select count(*) = 1 and sum(amount) = 200000 from pos.cash_advances where employee_id = emp and kind = 'PAYMENT_PAYROLL' and payroll_period = '11/2026'), 'potongan kasbon dicatat');
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.payroll_save_period(%L, 11, 2026, %L::jsonb)', o1, jsonb_build_array(pg_temp.row37(emp))::text)), 'periode terkunci tidak bisa diubah');
  perform pg_temp.ok37(pg_temp.fails37(format('select pos.payroll_unlock(%L, 11, 2026)', o1)), 'manajer (bukan admin) tidak boleh buka kunci');
  reset role;

  -- admin buka kunci: status DRAFT dan potongan kasbon periode itu dihapus
  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  perform pg_temp.ok37(pos.payroll_unlock(o1, 11, 2026) = 1, 'admin membuka kunci satu catatan');
  perform pg_temp.ok37((select status = 'DRAFT' and paid_at is null from pos.payroll_records where employee_id = emp and period_month = 11), 'status kembali DRAFT');
  perform pg_temp.ok37((select count(*) from pos.cash_advances where kind = 'PAYMENT_PAYROLL') = 0, 'potongan kasbon dihapus saat buka kunci');
  -- simpan ulang draf mengganti baris yang sama (satu baris per karyawan per periode)
  perform pos.payroll_save_period(o1, 11, 2026, jsonb_build_array(pg_temp.row37(emp, 100000)));
  perform pg_temp.ok37((select count(*) from pos.payroll_records where employee_id = emp and period_month = 11) = 1 and (select net_salary from pos.payroll_records where employee_id = emp and period_month = 11) = 3250000, 'simpan ulang mengganti baris yang sama');
  reset role;

  -- org lain tidak melihat dan tidak menulis
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok37((select count(*) from pos.payroll_records) = 0 and (select count(*) from pos.employee_compensation) = 0 and (select count(*) from pos.cash_advances) = 0, 'org lain tidak melihat payroll');
    perform pg_temp.ok37(pg_temp.fails37(format('select pos.payroll_save_period(%L, 11, 2026, ''[]''::jsonb)', o1)), 'org lain tidak boleh menyimpan gaji');
    reset role;
  end if;
end $$;
