-- Kas awal bawaan (migrasi 0026): kolom ada, nullable, tidak boleh negatif.
do $$
declare o1 uuid := ctx('o1'); out1 uuid; ok boolean;
begin
  select id into out1 from outlets where org_id = o1 limit 1;
  if (select is_nullable from information_schema.columns where table_schema='pos' and table_name='outlet_settings' and column_name='default_opening_cash') <> 'YES' then
    raise exception 'ASSERT GAGAL: default_opening_cash harus nullable'; end if;
  update outlet_settings set default_opening_cash = 150000 where outlet_id = out1;
  if (select default_opening_cash from outlet_settings where outlet_id = out1) <> 150000 then raise exception 'ASSERT GAGAL: nilai tidak tersimpan'; end if;
  update outlet_settings set default_opening_cash = null where outlet_id = out1;
  begin update outlet_settings set default_opening_cash = -1 where outlet_id = out1; ok := false;
  exception when check_violation then ok := true; end;
  if ok is not true then raise exception 'ASSERT GAGAL: nilai negatif harus ditolak'; end if;
end $$;
