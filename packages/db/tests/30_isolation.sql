-- Dijalankan SETELAH semua migrasi: tabel app lain di public harus utuh
do $$
declare b record; n bigint; pr text; df bigint;
begin
  select * into b from public._baseline;
  select count(*) into n from public.categories;
  select string_agg(privilege_type, ',' order by privilege_type) into pr from information_schema.role_table_grants where table_schema='public' and table_name='categories' and grantee='anon';
  select count(*) into df from pg_constraint where connamespace='public'::regnamespace and condeferrable;
  if n <> b.n then raise exception 'ISOLASI GAGAL: isi public.categories berubah'; end if;
  if pr is distinct from b.anon_priv then raise exception 'ISOLASI GAGAL: hak anon pada public.categories berubah (% -> %)', b.anon_priv, pr; end if;
  if df <> b.deferrable_fks then raise exception 'ISOLASI GAGAL: constraint public berubah'; end if;
  if exists (select 1 from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relname not in ('categories','employees','_baseline') and c.relkind in ('r','v','S')) then
    raise exception 'ISOLASI GAGAL: ada objek baru di schema public';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public') then raise exception 'ISOLASI GAGAL: ada fungsi baru di public'; end if;
  if has_schema_privilege('anon','pos','usage') then raise exception 'anon tidak boleh punya akses ke schema pos'; end if;
  if has_table_privilege('anon','pos.orders','select') then raise exception 'anon tidak boleh membaca pos.orders'; end if;
end $$;
select 'isolasi public: OK' as hasil;
