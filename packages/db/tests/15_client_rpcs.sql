grant select on t_ctx to authenticated;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

-- ---------- verify_pin: hanya dari perangkat milik sendiri, hanya karyawan outlet itu ----------
do $$
declare ok boolean; r boolean;
begin
  perform pos.set_employee_pin(ctx('emp'), '654321');
  update employees set pin_failed_count = 0, pin_locked_until = null where id = ctx('emp');
  insert into employee_outlets(employee_id, outlet_id, org_id)
    values (ctx('emp'), ctx('out1'), ctx('o1')) on conflict do nothing;

  -- perangkat sendiri: PIN benar dan salah
  perform set_config('request.jwt.claim.sub', ctx('ud')::text, true);
  set local role authenticated;
  perform pg_temp.ok(pos.verify_pin(ctx('dev'), ctx('emp'), '654321'), 'verify_pin benar dari perangkat sendiri');
  perform pg_temp.ok(not pos.verify_pin(ctx('dev'), ctx('emp'), '000000'), 'verify_pin salah ditolak');
  reset role;

  -- pengguna lain tidak bisa memakai perangkat ini
  perform set_config('request.jwt.claim.sub', ctx('u2')::text, true);
  set local role authenticated;
  begin r := pos.verify_pin(ctx('dev'), ctx('emp'), '654321'); ok := false;
  exception when others then ok := sqlerrm like '%not your device%'; end;
  reset role;
  perform pg_temp.ok(ok, 'perangkat milik pengguna lain ditolak');

  -- fungsi dasar tidak bisa dipanggil klien
  perform set_config('request.jwt.claim.sub', ctx('ud')::text, true);
  set local role authenticated;
  begin r := pos.verify_employee_pin(ctx('emp'), '654321'); ok := false;
  exception when insufficient_privilege then ok := true; end;
  reset role;
  perform pg_temp.ok(ok, 'verify_employee_pin tidak bisa dipanggil klien');

  -- karyawan yang tidak terdaftar di outlet perangkat -> false
  perform set_config('request.jwt.claim.sub', ctx('ud')::text, true);
  set local role authenticated;
  perform pg_temp.ok(not pos.verify_pin(ctx('dev'), gen_random_uuid(), '654321'), 'karyawan asing -> false');
  reset role;
  update employees set pin_failed_count = 0, pin_locked_until = null where id = ctx('emp');
end $$;

-- ---------- admin_set_pin: hanya pengelola org yang sama ----------
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', ctx('u1')::text, true);
  set local role authenticated;
  perform pos.admin_set_pin(ctx('emp'), '112233');
  reset role;
  perform pg_temp.ok(pos.verify_employee_pin(ctx('emp'), '112233'), 'admin_set_pin mengganti PIN');

  perform set_config('request.jwt.claim.sub', ctx('u2')::text, true);
  set local role authenticated;
  begin perform pos.admin_set_pin(ctx('emp'), '999999'); ok := false;
  exception when others then ok := sqlerrm like '%no access%'; end;
  reset role;
  perform pg_temp.ok(ok, 'pemilik org lain tidak bisa mengganti PIN');

  perform set_config('request.jwt.claim.sub', ctx('ud')::text, true);
  set local role authenticated;
  begin perform pos.admin_set_pin(ctx('emp'), '999999'); ok := false;
  exception when others then ok := sqlerrm like '%no access%'; end;
  reset role;
  perform pg_temp.ok(ok, 'akun perangkat tidak bisa mengganti PIN');
  perform pg_temp.ok(pos.verify_employee_pin(ctx('emp'), '112233'), 'PIN tidak berubah setelah percobaan ditolak');
end $$;

-- ---------- kolom rahasia employees tertutup bagi klien ----------
do $$
declare ok boolean; n bigint;
begin
  perform set_config('request.jwt.claim.sub', ctx('u1')::text, true);
  set local role authenticated;
  perform pg_temp.ok((select count(*) from employees) >= 1, 'pemilik tetap bisa membaca daftar karyawan');
  begin perform pin_hash from employees limit 1; ok := false;
  exception when insufficient_privilege then ok := true; end;
  perform pg_temp.ok(ok, 'pin_hash tidak bisa dibaca klien');
  begin perform qr_code from employees limit 1; ok := false;
  exception when insufficient_privilege then ok := true; end;
  perform pg_temp.ok(ok, 'qr_code tidak bisa dibaca klien');
  begin update employees set pin_hash = 'x' where id = ctx('emp'); ok := false;
  exception when insufficient_privilege then ok := true; end;
  perform pg_temp.ok(ok, 'pin_hash tidak bisa ditulis klien');
  begin update employees set pin_failed_count = 0, pin_locked_until = null where id = ctx('emp'); ok := false;
  exception when insufficient_privilege then ok := true; end;
  perform pg_temp.ok(ok, 'pembuka kunci PIN tidak bisa ditulis klien');
  update employees set name = name where id = ctx('emp');
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'kolom biasa tetap bisa diubah pengelola');
  reset role;
end $$;

-- ---------- sync_pull tetap bekerja (security definer) ----------
-- sync_pull sengaja mengabaikan baris yang berubah <5 detik lalu (menghindari baca setengah-commit);
-- jeda harus di luar blok DO karena now() beku selama satu transaksi
select pg_sleep(6) as menunggu_jendela_sync;
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claim.sub', ctx('ud')::text, true);
  set local role authenticated;
  r := pos.sync_pull(ctx('dev'), 0, 500);
  reset role;
  perform pg_temp.ok(jsonb_array_length(r->'data'->'employees') >= 1, 'sync_pull masih mengirim karyawan');
end $$;
