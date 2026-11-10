-- Templat struk (migrasi 0031): bawaan kosong, bisa disimpan, harus objek, dan ukurannya dibatasi.
do $$
declare o1 uuid := ctx('o1'); out1 uuid; ok boolean;
begin
  select id into out1 from outlets where org_id = o1 limit 1;
  if (select receipt_template from outlet_settings where outlet_id = out1) <> '{}'::jsonb then
    raise exception 'ASSERT GAGAL: templat harus kosong secara bawaan'; end if;
  update outlet_settings set receipt_template = '{"theme":"large","showPhone":false,"maxPrints":2}'::jsonb where outlet_id = out1;
  if (select receipt_template->>'theme' from outlet_settings where outlet_id = out1) <> 'large' then raise exception 'ASSERT GAGAL: templat tidak tersimpan'; end if;
  begin update outlet_settings set receipt_template = '[1,2]'::jsonb where outlet_id = out1; ok := false;
  exception when check_violation then ok := true; end;
  if ok is not true then raise exception 'ASSERT GAGAL: templat bukan objek harus ditolak'; end if;
  begin update outlet_settings set receipt_template = jsonb_build_object('x', repeat('y', 3000)) where outlet_id = out1; ok := false;
  exception when check_violation then ok := true; end;
  if ok is not true then raise exception 'ASSERT GAGAL: templat >2 KB harus ditolak'; end if;
  begin update outlet_settings set receipt_template = null where outlet_id = out1; ok := false;
  exception when not_null_violation then ok := true; end;
  if ok is not true then raise exception 'ASSERT GAGAL: templat tidak boleh null'; end if;
  update outlet_settings set receipt_template = '{}'::jsonb where outlet_id = out1;
end $$;
