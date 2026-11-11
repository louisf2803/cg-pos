-- CG POS · 0032_journal_transfer_kind
-- Tambah jenis jurnal manual 'transfer' (pindah saldo kas/bank) agar bisa dibedakan secara pasti
-- dari jurnal manual biasa tanpa mengandalkan teks keterangan (lihat docs/REQUESTS-FOR-CLAUDE.md
-- /keuangan/transfer). Nomor dokumen memakai awalan PS- (Pindah Saldo). Bisa dibalik seperti
-- jurnal manual/saldo awal lainnya. Tidak mengubah tanda tangan pos.journal_manual_post
-- (parameter sama), hanya memperluas nilai p_kind yang diterima -> aman untuk kode lama.
begin;

create or replace function pos.journal_manual_post(p_id uuid, p_org uuid, p_date date, p_desc text, p_kind text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  ln jsonb; v_debit numeric := 0; v_credit numeric := 0; v_d numeric; v_c numeric; v_acc uuid; v_je uuid; v_num text; v_lines jsonb := '[]'; v_count int := 0; v_seen uuid[] := '{}'; v_prefix text;
begin
  if p_id is null then raise exception 'id required'; end if;
  if not pos.is_org_admin(p_org) then raise exception 'not allowed'; end if;
  select id, number into v_je, v_num from journal_entries where org_id = p_org and source_key = 'manual:' || p_id;
  if v_je is not null then return jsonb_build_object('id', v_je, 'number', v_num, 'already', true); end if;
  if p_kind not in ('manual', 'opening', 'transfer') then raise exception 'invalid kind'; end if;
  if p_date is null then raise exception 'date required'; end if;
  if p_desc is null or length(trim(p_desc)) = 0 or length(p_desc) > 200 then raise exception 'description required (max 200)'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then raise exception 'journal needs at least 2 lines'; end if;
  if jsonb_array_length(p_lines) > 200 then raise exception 'too many lines'; end if;
  for ln in select * from jsonb_array_elements(p_lines) loop
    v_acc := (ln->>'account_id')::uuid;
    v_d := coalesce((ln->>'debit')::numeric, 0); v_c := coalesce((ln->>'credit')::numeric, 0);
    if v_d < 0 or v_c < 0 or (v_d > 0) = (v_c > 0) then raise exception 'each line needs exactly one of debit or credit'; end if;
    if v_d > 1000000000000 or v_c > 1000000000000 or v_d <> round(v_d, 2) or v_c <> round(v_c, 2) then raise exception 'invalid amount'; end if;
    if not exists (select 1 from accounts where id = v_acc and org_id = p_org and kind = 'detail' and is_active) then raise exception 'account not found or not postable'; end if;
    v_debit := v_debit + v_d; v_credit := v_credit + v_c; v_count := v_count + 1;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', v_acc, 'debit', v_d, 'credit', v_c, 'memo', nullif(left(trim(coalesce(ln->>'memo', '')), 200), '')));
  end loop;
  if v_debit <> v_credit then raise exception 'journal not balanced: debit % credit %', v_debit, v_credit; end if;
  v_prefix := case p_kind when 'opening' then 'OB' when 'transfer' then 'PS' else 'JU' end;
  v_je := pos.post_journal(p_org, null, p_date, v_prefix, left(trim(p_desc), 200), p_kind, p_id, 'manual:' || p_id, v_lines);
  select number into v_num from journal_entries where id = v_je;
  return jsonb_build_object('id', v_je, 'number', v_num, 'lines', v_count, 'total', v_debit);
end $$;
revoke all on function pos.journal_manual_post(uuid, uuid, date, text, text, jsonb) from public, anon;
grant execute on function pos.journal_manual_post(uuid, uuid, date, text, text, jsonb) to authenticated, service_role;

create or replace function pos.journal_reverse(p_entry uuid, p_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = pos, extensions, pg_temp as $$
declare
  e journal_entries%rowtype; v_rev uuid; v_num bigint; v_numtxt text; l record; i int := 0; v_date date;
begin
  select * into e from journal_entries where id = p_entry for update;
  if not found then raise exception 'journal not found'; end if;
  if not pos.is_org_admin(e.org_id) then raise exception 'not allowed'; end if;
  if e.source_type not in ('manual', 'opening', 'transfer') then raise exception 'only manual journals can be reversed'; end if;
  if e.reverses_entry_id is not null then raise exception 'a reversal entry cannot be reversed'; end if;
  select id, number into v_rev, v_numtxt from journal_entries where reverses_entry_id = e.id;
  if v_rev is not null then return jsonb_build_object('id', v_rev, 'number', v_numtxt, 'already', true); end if;
  if e.status <> 'posted' then raise exception 'journal is not posted'; end if;
  v_date := coalesce(p_date, current_date);
  v_num := pos.next_doc_number(e.org_id, 'JRN:REV', 0);
  insert into journal_entries(org_id, outlet_id, number, entry_date, description, source_type, source_id, source_key, reverses_entry_id, created_by)
  values (e.org_id, e.outlet_id, 'REV-' || lpad(v_num::text, 6, '0'), v_date,
          left('Pembalik ' || e.number || coalesce(': ' || nullif(trim(p_reason), ''), ''), 200), 'reversal', e.id, 'reverse:' || e.id, e.id, auth.uid())
  returning id into v_rev;
  for l in select * from journal_lines where entry_id = e.id order by line_no loop
    i := i + 1;
    insert into journal_lines(org_id, entry_id, account_id, debit, credit, memo, line_no) values (e.org_id, v_rev, l.account_id, l.credit, l.debit, l.memo, i);
  end loop;
  update journal_entries set status = 'posted' where id = v_rev;
  update journal_entries set status = 'voided' where id = e.id;
  select number into v_numtxt from journal_entries where id = v_rev;
  return jsonb_build_object('id', v_rev, 'number', v_numtxt);
end $$;
revoke all on function pos.journal_reverse(uuid, date, text) from public, anon;
grant execute on function pos.journal_reverse(uuid, date, text) to authenticated, service_role;

commit;
