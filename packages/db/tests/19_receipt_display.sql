-- Tampilan struk (migrasi 0027): bawaan, batas panjang, dan bisa diubah.
do $$
declare o1 uuid := ctx('o1'); out1 uuid; ok boolean;
begin
  select id into out1 from outlets where org_id = o1 limit 1;
  if (select receipt_show_cashier and receipt_show_customer from outlet_settings where outlet_id = out1) is not true then
    raise exception 'ASSERT GAGAL: kasir dan pelanggan harus tampil secara bawaan'; end if;
  if (select receipt_header from outlet_settings where outlet_id = out1) is not null then
    raise exception 'ASSERT GAGAL: teks kepala harus kosong secara bawaan'; end if;
  update outlet_settings set receipt_header = 'Buka setiap hari 08.00-22.00', receipt_show_cashier = false where outlet_id = out1;
  if (select receipt_header from outlet_settings where outlet_id = out1) <> 'Buka setiap hari 08.00-22.00' then raise exception 'ASSERT GAGAL: teks kepala tidak tersimpan'; end if;
  if (select receipt_show_cashier from outlet_settings where outlet_id = out1) is not false then raise exception 'ASSERT GAGAL: pilihan kasir tidak tersimpan'; end if;
  begin update outlet_settings set receipt_header = repeat('x', 201) where outlet_id = out1; ok := false;
  exception when check_violation then ok := true; end;
  if ok is not true then raise exception 'ASSERT GAGAL: teks kepala >200 karakter harus ditolak'; end if;
  begin update outlet_settings set receipt_show_customer = null where outlet_id = out1; ok := false;
  exception when not_null_violation then ok := true; end;
  if ok is not true then raise exception 'ASSERT GAGAL: pilihan pelanggan tidak boleh null'; end if;
  update outlet_settings set receipt_header = null, receipt_show_cashier = true where outlet_id = out1;
end $$;
