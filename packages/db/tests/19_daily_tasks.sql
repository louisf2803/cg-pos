-- Tugas harian (migrasi 0152): templat hanya ditulis pengelola, kasir/karyawan membuat baris hari ini dan menyelesaikan tugas,
-- tugas foto wajib jalur foto di folder organisasi, "tidak bisa" wajib alasan dan hanya bila diizinkan, gerbang Tutup kasir, buka lagi hanya pengelola.
create or replace function pg_temp.ok52(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails52(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;

do $$
declare
  o1 uuid := ctx('o1'); out1 uuid := ctx('out1'); emp uuid := ctx('emp');
  mgr uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  ta uuid := gen_random_uuid(); tb uuid := gen_random_uuid(); tc uuid := gen_random_uuid(); td uuid := gen_random_uuid();
  run_o uuid; run_c uuid; ia uuid; ib uuid; ic uuid; id_ uuid; ti uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (mgr, 'mgr-tk@x'), (cash, 'cash-tk@x'), (stranger, 'stranger-tk@x');
  insert into org_members(org_id, user_id, role) values (o1, mgr, 'manager'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok52(pg_temp.fails52(format('insert into pos.task_templates(org_id, outlet_id, phase, title, kind) values (%L, %L, ''opening'', ''x'', ''check'')', o1, out1)), 'kasir tidak boleh membuat templat');
  reset role;

  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  insert into pos.task_templates(id, org_id, outlet_id, phase, title, kind, required, allow_skip, sort) values
    (ta, o1, out1, 'opening', 'Pintu belakang dibuka', 'check', true, true, 1),
    (tb, o1, out1, 'opening', 'Foto mesin espresso bersih', 'photo', true, true, 2),
    (tc, o1, out1, 'closing', 'Laci kas dikunci', 'check', true, false, 1),
    (td, o1, out1, 'closing', 'Foto freezer (opsional)', 'photo', false, true, 2);
  reset role;

  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok52((select count(*) from pos.task_templates where outlet_id = out1) = 4, 'kasir membaca templat');
  run_o := pos.task_run_ensure(out1, 'opening');
  run_c := pos.task_run_ensure(out1, 'closing');
  perform pg_temp.ok52(pos.task_run_ensure(out1, 'opening') = run_o, 'ensure idempoten');
  perform pg_temp.ok52((select count(*) from pos.task_items where run_id = run_o) = 2 and (select count(*) from pos.task_items where run_id = run_c) = 2, 'tugas tersalin ke baris hari ini');
  perform pg_temp.ok52((select count(*) from pos.task_close_gate(out1)) = 3, 'gerbang: 3 tugas wajib belum selesai (yang opsional tidak dihitung)');
  select id into ia from pos.task_items where run_id = run_o and template_id = ta;
  select id into ib from pos.task_items where run_id = run_o and template_id = tb;
  select id into ic from pos.task_items where run_id = run_c and template_id = tc;

  perform pos.task_item_complete(ia, null, emp);
  perform pg_temp.ok52((select count(*) from pos.task_close_gate(out1)) = 2, 'centang menyelesaikan satu tugas');
  perform pg_temp.ok52(pg_temp.fails52(format('select pos.task_item_complete(%L, null)', ib)), 'tugas foto tanpa foto ditolak');
  perform pg_temp.ok52(pg_temp.fails52(format('select pos.task_item_complete(%L, %L)', ib, gen_random_uuid()::text || '/x.jpg')), 'foto di folder organisasi lain ditolak');
  perform pg_temp.ok52(pg_temp.fails52(format('select pos.task_item_skip(%L, '''')', ib)), 'tidak bisa wajib alasan');
  perform pg_temp.ok52(pg_temp.fails52(format('select pos.task_item_skip(%L, ''macet'')', ic)), 'tugas yang tidak mengizinkan tidak bisa dilewati');
  perform pos.task_item_complete(ib, o1::text || '/' || out1::text || '/2026-11-17/' || ib::text || '.jpg', emp);
  perform pg_temp.ok52((select status from pos.task_items where id = ib) = 'done', 'tugas foto selesai dengan jalur foto yang sah');
  perform pg_temp.ok52((select count(*) from pos.task_close_gate(out1)) = 1, 'tersisa satu tugas wajib (laci kas)');
  perform pos.task_item_complete(ic, null, emp);
  perform pg_temp.ok52((select count(*) from pos.task_close_gate(out1)) = 0, 'semua wajib selesai: gerbang kosong');

  -- tugas yang boleh dilewati
  perform pg_temp.ok52(pg_temp.fails52(format('select pos.task_item_reopen(%L)', ic)), 'kasir tidak boleh membuka lagi');
  reset role;
  perform set_config('request.jwt.claim.sub', mgr::text, true);
  set local role authenticated;
  perform pos.task_item_reopen(ic);
  perform pg_temp.ok52((select count(*) from pos.task_close_gate(out1)) = 1, 'dibuka lagi oleh pengelola: gerbang terisi lagi');
  -- templat baru siang hari ikut masuk saat ensure berikutnya
  insert into pos.task_templates(id, org_id, outlet_id, phase, title, kind, required, allow_skip, sort) values (ti, o1, out1, 'closing', 'Lampu dimatikan', 'check', true, true, 3);
  perform pos.task_run_ensure(out1, 'closing');
  perform pg_temp.ok52((select count(*) from pos.task_close_gate(out1)) = 2, 'templat baru ikut tersalin');
  select i.id into id_ from pos.task_items i join pos.task_runs r on r.id = i.run_id where r.outlet_id = out1 and i.template_id = ti;
  perform pos.task_item_skip(id_, 'listrik padam');
  perform pg_temp.ok52((select status from pos.task_items where id = id_) = 'skipped' and (select count(*) from pos.task_close_gate(out1)) = 1, 'tidak bisa dengan alasan dianggap selesai');
  -- catatan buka paksa
  perform pos.task_gate_override_log(out1, emp, 'Tim sudah pulang, laci sudah dikunci manajer', 1);
  reset role;
  perform pg_temp.ok52((select count(*) from pos.activity_logs where action = 'shift.close_forced_tasks' and actor_employee_id = emp) = 1, 'buka paksa tercatat dengan nama pemberi izin');

  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok52(pg_temp.fails52(format('select pos.task_run_ensure(%L, ''opening'')', out1)), 'org lain tidak boleh membuat baris');
    perform pg_temp.ok52(pg_temp.fails52(format('select * from pos.task_close_gate(%L)', out1)), 'org lain tidak boleh membaca gerbang');
    perform pg_temp.ok52((select count(*) from pos.task_items) = 0, 'org lain tidak membaca tugas');
    reset role;
  end if;
  delete from pos.activity_logs where action = 'shift.close_forced_tasks';
  delete from pos.task_runs where org_id = o1;
  delete from pos.task_templates where org_id = o1;
end $$;
