-- Fungsi harus berjalan dengan search_path bawaan PostgREST (public), tanpa mengandalkan pos di jalur sesi
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='pos' and p.prokind='f' and p.proname <> 'ctx'
             and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')) then
    raise exception 'ada fungsi pos tanpa search_path';
  end if;
end $$;
set search_path = public;
do $$
declare o uuid; v bigint;
begin
  select id into o from pos.orgs limit 1;
  v := pos.next_doc_number(o, 'uji-path', 0);
  if v <> 1 then raise exception 'next_doc_number salah: %', v; end if;
  if pos.is_debit_normal('cash_bank') is not true then raise exception 'is_debit_normal salah'; end if;
end $$;
select 'search_path fungsi: OK' as hasil;
