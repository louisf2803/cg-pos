-- Kertas dan isi label barcode (migrasi 0138): simpan/ubah/hapus, label harus muat di kertas, nama unik, anggota biasa boleh membaca tapi tidak boleh mengubah, org lain ditolak.
create or replace function pg_temp.ok38(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;
create or replace function pg_temp.fails38(sql text, want text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when others then
  if sqlstate in ('42601', '42883', '42703', '42P01', '42P02', '22P02', '42804') then raise exception 'TES SALAH (% %): %', sqlstate, sqlerrm, sql; end if;
  return sqlerrm = want;
end $$;
do $$
declare
  o1 uuid := ctx('o1'); adm uuid := gen_random_uuid(); cash uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); o2 uuid;
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid();
  good jsonb := '{"name":"A4 tiga kolom","paper_w":165,"paper_h":210,"columns":3,"label_w":50,"label_h":18,"row_gap":2,"col_gap":5,"margin_left":3,"margin_top":7,"content":{"fontMm":2.4,"showBarcode":true}}';
begin
  insert into auth.users(id, email) values (adm, 'adm-lp@x'), (cash, 'cash-lp@x'), (stranger, 'stranger-lp@x');
  insert into org_members(org_id, user_id, role) values (o1, adm, 'admin'), (o1, cash, 'cashier');
  select id into o2 from orgs where id <> o1 limit 1;
  if o2 is not null then insert into org_members(org_id, user_id, role) values (o2, stranger, 'owner'); end if;

  perform set_config('request.jwt.claim.sub', adm::text, true);
  set local role authenticated;
  perform pos.label_paper_save(p1, o1, good);
  perform pg_temp.ok38((select columns from pos.label_papers where id = p1) = 3 and (select content->>'fontMm' from pos.label_papers where id = p1) = '2.4', 'kertas tersimpan beserta isi label');
  perform pos.label_paper_save(p1, o1, jsonb_set(good, '{label_w}', '45'));
  perform pg_temp.ok38((select label_w from pos.label_papers where id = p1) = 45, 'kertas bisa diubah (id sama)');
  perform pg_temp.ok38(pg_temp.fails38(format('select pos.label_paper_save(%L, %L, %L)', p2, o1, jsonb_set(good, '{name}', '"a4 TIGA KOLOM"')), 'name already used'), 'nama kembar ditolak');
  perform pg_temp.ok38(pg_temp.fails38(format('select pos.label_paper_save(%L, %L, %L)', p2, o1, jsonb_set(jsonb_set(good, '{name}', '"Lebar"'), '{label_w}', '60')), 'labels do not fit width'), 'label tidak muat lebar ditolak');
  perform pg_temp.ok38(pg_temp.fails38(format('select pos.label_paper_save(%L, %L, %L)', p2, o1, jsonb_set(jsonb_set(good, '{name}', '"Tinggi"'), '{label_h}', '210')), 'label does not fit height'), 'label tidak muat tinggi ditolak');
  perform pg_temp.ok38(pg_temp.fails38(format('select pos.label_paper_save(%L, %L, %L)', p2, o1, jsonb_set(good, '{name}', '""')), 'name required'), 'nama kosong ditolak');
  perform pg_temp.ok38((pos.label_paper_delete(p1)->>'deleted')::boolean, 'kertas dihapus');
  perform pos.label_paper_save(p1, o1, good);
  reset role;
  perform set_config('request.jwt.claim.sub', cash::text, true);
  set local role authenticated;
  perform pg_temp.ok38((select count(*) from pos.label_papers where org_id = o1) = 1, 'anggota biasa boleh membaca');
  perform pg_temp.ok38(pg_temp.fails38(format('select pos.label_paper_save(%L, %L, %L)', p2, o1, jsonb_set(good, '{name}', '"Kasir"')), 'not allowed'), 'kasir tidak boleh mengubah');
  perform pg_temp.ok38(pg_temp.fails38(format('select pos.label_paper_delete(%L)', p1), 'not allowed'), 'kasir tidak boleh menghapus');
  reset role;
  if o2 is not null then
    perform set_config('request.jwt.claim.sub', stranger::text, true);
    set local role authenticated;
    perform pg_temp.ok38((select count(*) from pos.label_papers where org_id = o1) = 0, 'org lain tidak bisa membaca');
    perform pg_temp.ok38(pg_temp.fails38(format('select pos.label_paper_delete(%L)', p1), 'not allowed'), 'org lain tidak boleh menghapus');
    reset role;
  end if;
  delete from pos.label_papers where org_id = o1;
end $$;
