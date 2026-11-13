-- CG POS · 0138_label_papers
-- Pengaturan kertas dan isi label barcode (A149), dikendalikan dari backoffice (keputusan Louis 13 Nov 2026): ukuran kertas dan label, kolom, jarak,
-- margin, serta isi label (huruf, barcode, kode, nama, satuan, merchant, harga). Kertas bawaan baca-saja ada di aplikasi (bukan di tabel).
-- Hanya pengelola (pos.can_manage) yang boleh mengubah; semua anggota organisasi boleh membaca (kasir hanya mencetak memakai pengaturan ini).

create table pos.label_papers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references pos.orgs(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 50),
  paper_w numeric(7,2) not null check (paper_w between 10 and 1000),
  paper_h numeric(7,2) not null check (paper_h between 10 and 2000),
  columns int not null check (columns between 1 and 12),
  label_w numeric(7,2) not null check (label_w between 5 and 500),
  label_h numeric(7,2) not null check (label_h between 5 and 500),
  row_gap numeric(6,2) not null default 0 check (row_gap between 0 and 100),
  col_gap numeric(6,2) not null default 0 check (col_gap between 0 and 100),
  margin_left numeric(6,2) not null default 0 check (margin_left between 0 and 200),
  margin_top numeric(6,2) not null default 0 check (margin_top between 0 and 200),
  content jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create unique index label_papers_name on pos.label_papers (org_id, lower(btrim(name)));
alter table pos.label_papers enable row level security;
create policy sel on pos.label_papers for select to authenticated using (org_id in (select pos.user_org_ids()));
revoke all on pos.label_papers from anon;
grant select on pos.label_papers to authenticated;

-- Simpan kertas (buat atau ubah). Ukuran: label harus muat di kertas (kolom x lebar + jarak kolom + margin kiri <= lebar kertas; tinggi label + margin atas <= tinggi kertas).
create or replace function pos.label_paper_save(p_id uuid, p_org uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_pw numeric := (p_data->>'paper_w')::numeric; v_ph numeric := (p_data->>'paper_h')::numeric;
  v_cols int := (p_data->>'columns')::int;
  v_lw numeric := (p_data->>'label_w')::numeric; v_lh numeric := (p_data->>'label_h')::numeric;
  v_rg numeric := coalesce((p_data->>'row_gap')::numeric, 0); v_cg numeric := coalesce((p_data->>'col_gap')::numeric, 0);
  v_ml numeric := coalesce((p_data->>'margin_left')::numeric, 0); v_mt numeric := coalesce((p_data->>'margin_top')::numeric, 0);
  v_content jsonb := coalesce(p_data->'content', '{}'::jsonb);
begin
  if p_id is null then raise exception 'id required'; end if;
  if not pos.can_manage(p_org) then raise exception 'not allowed'; end if;
  if char_length(v_name) not between 1 and 50 then raise exception 'name required'; end if;
  if v_pw is null or v_ph is null or v_cols is null or v_lw is null or v_lh is null then raise exception 'size required'; end if;
  if jsonb_typeof(v_content) <> 'object' then raise exception 'invalid content'; end if;
  if v_cols * v_lw + (v_cols - 1) * v_cg + v_ml > v_pw then raise exception 'labels do not fit width'; end if;
  if v_lh + v_mt > v_ph then raise exception 'label does not fit height'; end if;
  if exists (select 1 from label_papers where org_id = p_org and id <> p_id and lower(btrim(name)) = lower(v_name)) then raise exception 'name already used'; end if;
  if exists (select 1 from label_papers where id = p_id and org_id <> p_org) then raise exception 'not allowed'; end if;
  insert into label_papers(id, org_id, name, paper_w, paper_h, columns, label_w, label_h, row_gap, col_gap, margin_left, margin_top, content, created_by)
  values (p_id, p_org, v_name, v_pw, v_ph, v_cols, v_lw, v_lh, v_rg, v_cg, v_ml, v_mt, v_content, auth.uid())
  on conflict (id) do update set name = excluded.name, paper_w = excluded.paper_w, paper_h = excluded.paper_h, columns = excluded.columns, label_w = excluded.label_w,
    label_h = excluded.label_h, row_gap = excluded.row_gap, col_gap = excluded.col_gap, margin_left = excluded.margin_left, margin_top = excluded.margin_top,
    content = excluded.content, updated_at = now();
  return jsonb_build_object('id', p_id);
end $$;

create or replace function pos.label_paper_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare p label_papers%rowtype;
begin
  select * into p from label_papers where id = p_id;
  if not found then return jsonb_build_object('id', p_id, 'deleted', false); end if;
  if not pos.can_manage(p.org_id) then raise exception 'not allowed'; end if;
  delete from label_papers where id = p_id;
  return jsonb_build_object('id', p_id, 'deleted', true);
end $$;

revoke all on function pos.label_paper_save(uuid, uuid, jsonb), pos.label_paper_delete(uuid) from public, anon;
grant execute on function pos.label_paper_save(uuid, uuid, jsonb), pos.label_paper_delete(uuid) to authenticated, service_role;
