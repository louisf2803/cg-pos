-- CG POS · 0037_payroll
-- Payroll (rancangan: docs/PAYROLL-DESIGN.md). Semua tabel HANYA untuk pemilik/manajer (pos.can_manage): kasir dan akun perangkat
-- tidak boleh membaca gaji. Uang dalam rupiah bulat. Aturan hitung ada di klien (packages/shared/src/payroll.ts) dengan angka dari
-- payroll_rules; server menjaga bentuk data, periode terkunci, dan konsistensi gaji bersih, bukan menghitung ulang aturan bisnis.
-- Sengaja TANPA pos.log_change: log aktivitas bisa terbaca peran lain dan akan membocorkan nominal gaji.

-- Gaji pokok dan tunjangan per karyawan. status: tetap, probasi (tanpa bonus/denda/komisi), admin (tanpa gaji pokok dan bonus/denda).
create table pos.employee_compensation (
  employee_id uuid primary key,
  org_id uuid not null references pos.orgs(id) on delete cascade,
  status text not null default 'permanent' check (status in ('permanent', 'probation', 'admin')),
  basic_salary numeric(18,0) not null default 0 check (basic_salary between 0 and 1000000000),
  meal_allowance numeric(18,0) not null default 0 check (meal_allowance between 0 and 1000000000),
  bpjs_allowance numeric(18,0) not null default 0 check (bpjs_allowance between 0 and 1000000000),
  cash_advance_installment numeric(18,0) not null default 0 check (cash_advance_installment between 0 and 1000000000),
  updated_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references pos.employees(id, org_id) on delete cascade
);

-- Jadwal kerja mingguan: satu baris per hari kerja dengan jam mulai shift (jam lokal outlet). Dasar telat dan absen otomatis.
create table pos.employee_schedules (
  employee_id uuid not null,
  org_id uuid not null references pos.orgs(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  primary key (employee_id, weekday),
  foreign key (employee_id, org_id) references pos.employees(id, org_id) on delete cascade
);

-- Aturan payroll per org (angka bonus/denda/kuota) sebagai jsonb; kunci yang tidak ada memakai nilai bawaan di klien.
create table pos.payroll_rules (
  org_id uuid primary key references pos.orgs(id) on delete cascade,
  rules jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object' and pg_column_size(rules) <= 2048),
  updated_at timestamptz not null default now()
);

-- Catatan harian: kesalahan operasional, penyesuaian manual telat/absen, dan EXCUSED = hari kerja terjadwal yang diizinkan (cuti/izin/libur).
create table pos.employee_incidents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  employee_id uuid not null,
  incident_date date not null,
  kind text not null check (kind in ('LATENESS', 'ABSENCE', 'OPERATIONAL_MISTAKE', 'EXCUSED')),
  count integer not null default 1 check (count between 1 and 31),
  notes text check (notes is null or char_length(notes) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references pos.employees(id, org_id) on delete cascade
);
create index employee_incidents_emp_date on pos.employee_incidents (employee_id, incident_date);

-- Kasbon: pinjam, bayar transfer, dan potong gaji. Entri PAYMENT_PAYROLL hanya dibuat/dihapus oleh payroll_save_period/unlock.
create table pos.cash_advances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  employee_id uuid not null,
  kind text not null check (kind in ('BORROW', 'PAYMENT_TRANSFER', 'PAYMENT_PAYROLL')),
  amount numeric(18,0) not null check (amount > 0 and amount <= 1000000000),
  entry_date date not null default current_date,
  notes text check (notes is null or char_length(notes) <= 300),
  payroll_period text,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references pos.employees(id, org_id) on delete cascade
);
create index cash_advances_emp on pos.cash_advances (employee_id, entry_date);

-- Gaji bulanan per karyawan. Ditulis hanya lewat pos.payroll_save_period.
create table pos.payroll_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  employee_id uuid not null,
  period_month smallint not null check (period_month between 1 and 12),
  period_year smallint not null check (period_year between 2000 and 2100),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PAID')),
  employment_status text not null default 'permanent' check (employment_status in ('permanent', 'probation', 'admin')),
  basic_salary numeric(18,0) not null default 0,
  meal_allowance numeric(18,0) not null default 0,
  bpjs_allowance numeric(18,0) not null default 0,
  lateness_count integer not null default 0 check (lateness_count >= 0),
  lateness_bonus numeric(18,0) not null default 0,
  lateness_penalty numeric(18,0) not null default 0,
  absence_count integer not null default 0 check (absence_count >= 0),
  absence_penalty numeric(18,0) not null default 0,
  operational_mistakes_count integer not null default 0 check (operational_mistakes_count >= 0),
  operational_mistakes_penalty numeric(18,0) not null default 0,
  stock_opname_penalty numeric(18,0) not null default 0,
  stockan_incentive numeric(18,0) not null default 0,
  deep_cleaning_incentive numeric(18,0) not null default 0,
  commission numeric(18,0) not null default 0,
  cash_advance_deduction numeric(18,0) not null default 0 check (cash_advance_deduction >= 0),
  net_salary numeric(18,0) not null default 0,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references pos.employees(id, org_id) on delete cascade,
  unique (employee_id, period_month, period_year)
);
create index payroll_records_period on pos.payroll_records (org_id, period_year, period_month);

-- RLS: hanya pemilik/manajer org
do $$
declare t text;
begin
  foreach t in array array['employee_compensation', 'employee_schedules', 'payroll_rules', 'employee_incidents', 'cash_advances', 'payroll_records'] loop
    execute format('alter table pos.%I enable row level security', t);
    execute format('create policy sel on pos.%I for select to authenticated using (pos.can_manage(org_id))', t);
    execute format('revoke all on pos.%I from anon', t);
  end loop;
  foreach t in array array['employee_compensation', 'employee_schedules', 'payroll_rules', 'employee_incidents'] loop
    execute format('create policy ins on pos.%I for insert to authenticated with check (pos.can_manage(org_id))', t);
    execute format('create policy upd on pos.%I for update to authenticated using (pos.can_manage(org_id)) with check (pos.can_manage(org_id))', t);
    execute format('create policy del on pos.%I for delete to authenticated using (pos.can_manage(org_id))', t);
    execute format('grant select, insert, update, delete on pos.%I to authenticated', t);
  end loop;
end $$;
-- kasbon: pengelola boleh mencatat pinjam dan bayar transfer; potong gaji hanya lewat fungsi
create policy ins on pos.cash_advances for insert to authenticated with check (pos.can_manage(org_id) and kind <> 'PAYMENT_PAYROLL');
create policy upd on pos.cash_advances for update to authenticated using (pos.can_manage(org_id) and kind <> 'PAYMENT_PAYROLL') with check (pos.can_manage(org_id) and kind <> 'PAYMENT_PAYROLL');
create policy del on pos.cash_advances for delete to authenticated using (pos.can_manage(org_id) and kind <> 'PAYMENT_PAYROLL');
grant select, insert, update, delete on pos.cash_advances to authenticated;
-- gaji bulanan: hanya baca langsung
revoke insert, update, delete on pos.payroll_records from authenticated;
grant select on pos.payroll_records to authenticated;

create trigger trg_touch_comp before update on pos.employee_compensation for each row execute function pos.touch_updated_at();
create trigger trg_touch_rules before update on pos.payroll_rules for each row execute function pos.touch_updated_at();
create trigger trg_touch_payroll before update on pos.payroll_records for each row execute function pos.touch_updated_at();

-- Saldo kasbon karyawan (pinjam - bayar)
create or replace function pos._cash_advance_balance(p_org uuid, p_employee uuid) returns numeric
language sql stable set search_path = pos, extensions, pg_temp as $$
  select coalesce(sum(case when kind = 'BORROW' then amount else -amount end), 0)
    from cash_advances where org_id = p_org and employee_id = p_employee
$$;

-- Simpan gaji satu periode untuk banyak karyawan secara atomik. p_rows = array objek dengan kunci snake_case sesuai kolom.
-- p_lock = true: kunci periode (status PAID) dan catat potongan kasbon sebagai PAYMENT_PAYROLL. Periode yang sudah PAID tidak bisa diubah.
create or replace function pos.payroll_save_period(p_org uuid, p_month int, p_year int, p_rows jsonb, p_lock boolean default false) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  r jsonb; v_emp uuid; v_net numeric; v_calc numeric; v_n int := 0; v_ded numeric; v_bal numeric; v_id uuid;
  v_period text := lpad(p_month::text, 2, '0') || '/' || p_year::text; v_status text;
begin
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if p_month < 1 or p_month > 12 or p_year < 2000 or p_year > 2100 then raise exception 'invalid period'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'too many rows'; end if;
  if exists (select 1 from payroll_records where org_id = p_org and period_month = p_month and period_year = p_year and status = 'PAID') then
    raise exception 'period locked';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_emp := (r->>'employee_id')::uuid;
    if not exists (select 1 from employees where id = v_emp and org_id = p_org and deleted_at is null) then raise exception 'employee not found'; end if;
    v_net := (r->>'net_salary')::numeric;
    v_calc := coalesce((r->>'basic_salary')::numeric, 0) + coalesce((r->>'meal_allowance')::numeric, 0) - coalesce((r->>'bpjs_allowance')::numeric, 0)
            + coalesce((r->>'lateness_bonus')::numeric, 0) - coalesce((r->>'lateness_penalty')::numeric, 0)
            - coalesce((r->>'absence_penalty')::numeric, 0) - coalesce((r->>'operational_mistakes_penalty')::numeric, 0)
            + coalesce((r->>'stockan_incentive')::numeric, 0) + coalesce((r->>'deep_cleaning_incentive')::numeric, 0)
            - coalesce((r->>'stock_opname_penalty')::numeric, 0) - coalesce((r->>'cash_advance_deduction')::numeric, 0)
            + coalesce((r->>'commission')::numeric, 0);
    if v_net is distinct from v_calc then raise exception 'net salary mismatch for %', v_emp; end if;
    v_ded := coalesce((r->>'cash_advance_deduction')::numeric, 0);
    if p_lock and v_ded > 0 then
      v_bal := pos._cash_advance_balance(p_org, v_emp);
      if v_ded > v_bal then raise exception 'cash advance deduction exceeds balance for %', v_emp; end if;
    end if;
    insert into payroll_records(org_id, employee_id, period_month, period_year, status, employment_status, basic_salary, meal_allowance, bpjs_allowance,
        lateness_count, lateness_bonus, lateness_penalty, absence_count, absence_penalty, operational_mistakes_count, operational_mistakes_penalty,
        stock_opname_penalty, stockan_incentive, deep_cleaning_incentive, commission, cash_advance_deduction, net_salary, paid_at, created_by)
    values (p_org, v_emp, p_month, p_year, case when p_lock then 'PAID' else 'DRAFT' end, coalesce(r->>'employment_status', 'permanent'),
        coalesce((r->>'basic_salary')::numeric, 0), coalesce((r->>'meal_allowance')::numeric, 0), coalesce((r->>'bpjs_allowance')::numeric, 0),
        coalesce((r->>'lateness_count')::int, 0), coalesce((r->>'lateness_bonus')::numeric, 0), coalesce((r->>'lateness_penalty')::numeric, 0),
        coalesce((r->>'absence_count')::int, 0), coalesce((r->>'absence_penalty')::numeric, 0),
        coalesce((r->>'operational_mistakes_count')::int, 0), coalesce((r->>'operational_mistakes_penalty')::numeric, 0),
        coalesce((r->>'stock_opname_penalty')::numeric, 0), coalesce((r->>'stockan_incentive')::numeric, 0), coalesce((r->>'deep_cleaning_incentive')::numeric, 0),
        coalesce((r->>'commission')::numeric, 0), v_ded, v_net, case when p_lock then now() end, auth.uid())
    on conflict (employee_id, period_month, period_year) do update set
        status = excluded.status, employment_status = excluded.employment_status, basic_salary = excluded.basic_salary, meal_allowance = excluded.meal_allowance,
        bpjs_allowance = excluded.bpjs_allowance, lateness_count = excluded.lateness_count, lateness_bonus = excluded.lateness_bonus,
        lateness_penalty = excluded.lateness_penalty, absence_count = excluded.absence_count, absence_penalty = excluded.absence_penalty,
        operational_mistakes_count = excluded.operational_mistakes_count, operational_mistakes_penalty = excluded.operational_mistakes_penalty,
        stock_opname_penalty = excluded.stock_opname_penalty, stockan_incentive = excluded.stockan_incentive,
        deep_cleaning_incentive = excluded.deep_cleaning_incentive, commission = excluded.commission,
        cash_advance_deduction = excluded.cash_advance_deduction, net_salary = excluded.net_salary, paid_at = excluded.paid_at
      returning id, status into v_id, v_status;
    delete from cash_advances where org_id = p_org and employee_id = v_emp and kind = 'PAYMENT_PAYROLL' and payroll_period = v_period;
    if p_lock and v_ded > 0 then
      insert into cash_advances(org_id, employee_id, kind, amount, entry_date, notes, payroll_period, created_by)
      values (p_org, v_emp, 'PAYMENT_PAYROLL', v_ded, current_date, 'Potong gaji ' || v_period, v_period, auth.uid());
    end if;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('saved', v_n, 'locked', p_lock);
end $$;

-- Buka kunci periode (hanya pemilik/admin): status kembali DRAFT dan potongan kasbon periode itu dihapus.
create or replace function pos.payroll_unlock(p_org uuid, p_month int, p_year int) returns int
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare v_n int; v_period text := lpad(p_month::text, 2, '0') || '/' || p_year::text;
begin
  if not pos.is_org_admin(p_org) then raise exception 'not allowed'; end if;
  delete from cash_advances where org_id = p_org and kind = 'PAYMENT_PAYROLL' and payroll_period = v_period;
  update payroll_records set status = 'DRAFT', paid_at = null where org_id = p_org and period_month = p_month and period_year = p_year and status = 'PAID';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function pos._cash_advance_balance(uuid, uuid) from public, anon, authenticated;
revoke all on function pos.payroll_save_period(uuid, int, int, jsonb, boolean), pos.payroll_unlock(uuid, int, int) from public, anon;
grant execute on function pos.payroll_save_period(uuid, int, int, jsonb, boolean), pos.payroll_unlock(uuid, int, int) to authenticated, service_role;
