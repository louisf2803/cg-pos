-- Test 25: Pengaturan Metode Pembayaran Server (migrasi 0109)
create or replace function pg_temp.ok25(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT GAGAL: %', msg; end if; end $$;

do $$
declare
  o1 uuid := ctx('o1');
  u_owner uuid := ctx('u_owner');
  u_cashier uuid := ctx('u_cashier');
  out1 uuid := ctx('out1');
  v_res jsonb;
  v_custom_id uuid;
  v_edc_id uuid;
begin
  -- 1. Owner menyimpan penyesuaian metode bawaan EDC
  perform set_config('request.jwt.claim.sub', u_owner::text, true);

  v_res := pos.save_payment_method_config(
    o1, out1, null, 'EDC', 'Kartu Debit BCA', 'edc', true, 1.5, 500, 'Toko Kopi', '1234567890', 'Settlement H+1'
  );
  perform pg_temp.ok25(v_res->>'name' = 'Kartu Debit BCA', 'nama EDC terbarui');
  perform pg_temp.ok25((v_res->>'feePct')::numeric = 1.5, 'feePct 1.5');
  perform pg_temp.ok25((v_res->>'feeFixed')::numeric = 500, 'feeFixed 500');
  perform pg_temp.ok25((v_res->>'isBuiltIn')::boolean = true, 'isBuiltIn true');

  -- Periksa pos.payment_methods ikut terbarui
  perform pg_temp.ok25(
    exists (select 1 from pos.payment_methods where org_id = o1 and code = 'EDC' and name = 'Kartu Debit BCA'),
    'pos.payment_methods nama terbarui'
  );

  -- 2. Owner membuat metode kustom baru: QRIS Dinamis Konter
  v_res := pos.save_payment_method_config(
    o1, out1, null, 'QRIS_STATIC', 'QRIS Statis Toko', 'qris', true, 0.7, 0, 'Rekening Toko', '987654321', 'BCA QRIS'
  );
  v_custom_id := (v_res->>'id')::uuid;
  perform pg_temp.ok25(v_custom_id is not null, 'custom payment method dibuat');
  perform pg_temp.ok25((v_res->>'isBuiltIn')::boolean = false, 'custom bukan builtin');

  -- Periksa pos.payment_methods memiliki baris baru QRIS_STATIC
  perform pg_temp.ok25(
    exists (select 1 from pos.payment_methods where org_id = o1 and code = 'QRIS_STATIC'),
    'pos.payment_methods memiliki QRIS_STATIC'
  );

  -- 3. Mencoba menghapus metode bawaan EDC ditolak
  select id into v_edc_id from pos.payment_method_settings where org_id = o1 and code = 'EDC';
  begin
    perform pos.delete_payment_method_config(o1, v_edc_id);
    raise exception 'seharusnya gagal menghapus metode bawaan';
  exception when others then
    perform pg_temp.ok25(sqlerrm like '%Metode pembayaran bawaan tidak dapat dihapus%', 'hapus bawaan ditolak: ' || sqlerrm);
  end;

  -- 4. Menghapus metode kustom berhasil
  perform pg_temp.ok25(pos.delete_payment_method_config(o1, v_custom_id), 'hapus custom berhasil');
  perform pg_temp.ok25(
    not exists (select 1 from pos.payment_method_settings where id = v_custom_id),
    'custom method terhapus dari settings'
  );

  -- 5. Gateway bawaan QRIS dipaksa tetap is_active = false
  v_res := pos.save_payment_method_config(
    o1, out1, null, 'QRIS', 'QRIS Otomatis', 'qris', true, 0.7, 0, null, null, null
  );
  perform pg_temp.ok25((v_res->>'isActive')::boolean = false, 'gateway QRIS dipaksa nonaktif');

  -- 6. Kasir biasa tidak boleh menyimpan konfigurasi
  perform set_config('request.jwt.claim.sub', u_cashier::text, true);
  begin
    perform pos.save_payment_method_config(
      o1, out1, null, 'CASH', 'Tunai Outlet', 'cash', true, 0, 0, null, null, null
    );
    raise exception 'seharusnya kasir ditolak';
  exception when others then
    perform pg_temp.ok25(sqlerrm like '%forbidden%', 'kasir ditolak: ' || sqlerrm);
  end;

end $$;

